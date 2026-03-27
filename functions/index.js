const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const COLLECTIONS = {
  users: 'users',
  territory: 'captured_territory',
  runs: 'runs',
  territoryEvents: 'territory_events',
  pushTokens: 'push_tokens',
};

const CELL_SIZE_METERS = 50;
const METERS_PER_DEG_LAT = 111320;

function metersPerDegLon(latDeg) {
  return METERS_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);
}

function coordToCell(latitude, longitude) {
  const row = Math.floor((latitude * METERS_PER_DEG_LAT) / CELL_SIZE_METERS);
  const col = Math.floor((longitude * metersPerDegLon(latitude)) / CELL_SIZE_METERS);
  return `${row},${col}`;
}

function uniqueCellsFromPath(path) {
  return [...new Set((path || []).map((point) => coordToCell(point.latitude, point.longitude)))];
}

async function claimCell({ cellKey, userId, displayName, teamColor, runId }) {
  const territoryRef = db.collection(COLLECTIONS.territory).doc(cellKey);
  const eventRef = db.collection(COLLECTIONS.territoryEvents).doc();

  return db.runTransaction(async (transaction) => {
    const territorySnap = await transaction.get(territoryRef);
    const previous = territorySnap.exists ? territorySnap.data() : null;

    if (previous && previous.ownerId === userId) {
      return { changed: false, stolen: false, defenderId: null };
    }

    transaction.set(
      territoryRef,
      {
        gridId: cellKey,
        ownerId: userId,
        displayName,
        teamColor,
        lastRunId: runId,
        capturedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(eventRef, {
      type: previous ? 'territory_stolen' : 'territory_claimed',
      cellKey,
      runId,
      attackerId: userId,
      attackerName: displayName,
      attackerTeamColor: teamColor,
      defenderId: previous?.ownerId || null,
      defenderName: previous?.displayName || null,
      defenderTeamColor: previous?.teamColor || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      changed: true,
      stolen: Boolean(previous?.ownerId && previous.ownerId !== userId),
      defenderId: previous?.ownerId || null,
    };
  });
}

async function getPushTokensForUsers(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return [];

  const tokens = [];
  for (let index = 0; index < uniqueUserIds.length; index += 10) {
    const chunk = uniqueUserIds.slice(index, index + 10);
    const snapshot = await db
      .collection(COLLECTIONS.pushTokens)
      .where('userId', 'in', chunk)
      .get();

    snapshot.forEach((doc) => {
      const token = doc.get('token');
      if (token) tokens.push(token);
    });
  }

  return [...new Set(tokens)];
}

async function sendTerritoryPushes({ attackerName, defenderIds, stolenCount }) {
  const tokens = await getPushTokensForUsers(defenderIds);
  if (tokens.length === 0 || stolenCount === 0) return;

  const messages = tokens.map((token) => ({
    to: token,
    title: 'Territory lost',
    body: `${attackerName} stole ${stolenCount} of your cells.`,
    sound: 'default',
    data: {
      type: 'territory_stolen',
      stolenCount,
    },
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('Expo push send failed', text);
  }
}

exports.processQueuedRun = onDocumentCreated('runs/{runId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const runId = event.params.runId;
  const run = snapshot.data();

  if (!run?.userId) {
    logger.error('Run missing userId', { runId });
    return;
  }

  const derivedCellKeys = uniqueCellsFromPath(run.path);
  const cellKeys = derivedCellKeys.length > 0 ? derivedCellKeys : run.cellKeys || [];

  let claimed = 0;
  let stolen = 0;
  const defenderIds = [];

  for (const cellKey of cellKeys) {
    const result = await claimCell({
      cellKey,
      userId: run.userId,
      displayName: run.displayName,
      teamColor: run.teamColor,
      runId,
    });

    if (result.changed) claimed += 1;
    if (result.stolen) {
      stolen += 1;
      if (result.defenderId) defenderIds.push(result.defenderId);
    }
  }

  await db.collection(COLLECTIONS.users).doc(run.userId).set(
    {
      sweatCoins: FieldValue.increment(run.earnedCoins || 0),
      totalDistanceM: FieldValue.increment(run.distanceM || 0),
      lastRunAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await snapshot.ref.set(
    {
      status: 'processed',
      processedAt: FieldValue.serverTimestamp(),
      territorySummary: {
        claimed,
        stolen,
      },
    },
    { merge: true },
  );

  await sendTerritoryPushes({
    attackerName: run.displayName || 'Another runner',
    defenderIds,
    stolenCount: stolen,
  });

  logger.info('Run processed', {
    runId,
    userId: run.userId,
    claimed,
    stolen,
  });
});

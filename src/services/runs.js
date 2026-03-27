import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { FIRESTORE_COLLECTIONS, MAX_STORED_RUN_POINTS } from '../config/game';
import { metersToCoins } from '../utils/distance';
import { coordToCell } from '../utils/grid';
import { db } from './firebase';

function uniqueCellsFromTrail(trail) {
  return [...new Set(trail.map(({ latitude, longitude }) => coordToCell(latitude, longitude)))];
}

function sampleTrail(trail) {
  if (trail.length <= MAX_STORED_RUN_POINTS) {
    return trail;
  }

  const step = Math.ceil(trail.length / MAX_STORED_RUN_POINTS);
  return trail.filter((_, index) => index % step === 0 || index === trail.length - 1);
}

export async function submitRun({ userId, profile, distanceM, trail }) {
  const roundedDistanceM = Math.round(distanceM);
  const earnedCoins = metersToCoins(roundedDistanceM);
  const uniqueCellKeys = uniqueCellsFromTrail(trail);
  const runRef = doc(collection(db, FIRESTORE_COLLECTIONS.runs));

  await setDoc(runRef, {
    userId,
    displayName: profile.displayName,
    teamColor: profile.teamColor,
    distanceM: roundedDistanceM,
    earnedCoins,
    path: sampleTrail(trail),
    cellKeys: uniqueCellKeys,
    startedAt: trail[0]?.timestamp || null,
    completedAt: serverTimestamp(),
    status: 'queued',
  });

  return {
    runId: runRef.id,
    earnedCoins,
    roundedDistanceM,
    uniqueCellCount: uniqueCellKeys.length,
    status: 'queued',
  };
}

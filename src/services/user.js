/**
 * Firestore helpers for the users collection.
 *
 * Document ID = user ID.
 * Fields: { displayName, teamColor, sweatCoins, totalDistanceM, lastRunAt }
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { FIRESTORE_COLLECTIONS, TEAM_COLORS } from '../config/game';
import { db } from './firebase';

function hashString(value) {
  return [...value].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function buildStarterProfile(uid) {
  return {
    displayName: `Runner-${uid.slice(0, 6)}`,
    teamColor: TEAM_COLORS[hashString(uid) % TEAM_COLORS.length],
    sweatCoins: 0,
    totalDistanceM: 0,
  };
}

export async function ensureUserProfile(user) {
  const ref = doc(db, FIRESTORE_COLLECTIONS.users, user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }

  const starter = buildStarterProfile(user.uid);
  await setDoc(
    ref,
    {
      ...starter,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { id: user.uid, ...starter };
}

/**
 * Firestore helpers for the users collection.
 *
 * Document ID = user ID.
 * Fields: { sweatCoins, totalDistanceM, lastRunAt }
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { DUMMY_USER_ID } from './territory';

/**
 * Persist the user's updated Sweat Coin balance after a run.
 * Merges so we don't overwrite other profile fields later.
 */
export async function saveSweatCoins(coinsToAdd, distanceToAddM) {
  const ref = doc(db, 'users', DUMMY_USER_ID);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : { sweatCoins: 0, totalDistanceM: 0 };

  await setDoc(
    ref,
    {
      sweatCoins: (prev.sweatCoins || 0) + coinsToAdd,
      totalDistanceM: (prev.totalDistanceM || 0) + distanceToAddM,
      lastRunAt: serverTimestamp(),
    },
    { merge: true },
  );
}

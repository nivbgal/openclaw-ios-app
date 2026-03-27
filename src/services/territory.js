/**
 * Firestore helpers for the captured territory collection.
 *
 * Document ID = grid cell key ("row,col").
 * Fields: { gridId, ownerId, displayName, teamColor, capturedAt, lastRunId }
 */
import { collection, getDocs } from 'firebase/firestore';

import { FIRESTORE_COLLECTIONS } from '../config/game';
import { db } from './firebase';

/**
 * Fetch every claimed cell from Firestore.
 * Returns a Map<cellKey, { ownerId, teamColor }>.
 */
export async function fetchAllTerritory() {
  const snap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.territory));
  const territory = {};
  snap.forEach((d) => {
    const data = d.data();
    territory[d.id] = {
      ownerId: data.ownerId,
      displayName: data.displayName,
      teamColor: data.teamColor,
    };
  });
  return territory;
}

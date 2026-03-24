/**
 * Firestore helpers for the captured_territory collection.
 *
 * Document ID = grid cell key ("row,col").
 * Fields: { gridId, ownerId, teamColor, capturedAt }
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const COLLECTION = 'captured_territory';

// Hardcoded dummy user until Auth is wired up
export const DUMMY_USER_ID = 'player_001';
export const DUMMY_TEAM_COLOR = '#00e5ff'; // cyan

/**
 * Write a single captured cell to Firestore.
 * Uses setDoc (upsert) so re-capturing your own cell is a no-op cost-wise.
 */
export async function captureCell(cellKey) {
  const ref = doc(db, COLLECTION, cellKey);
  await setDoc(ref, {
    gridId: cellKey,
    ownerId: DUMMY_USER_ID,
    teamColor: DUMMY_TEAM_COLOR,
    capturedAt: serverTimestamp(),
  });
}

/**
 * Fetch every claimed cell from Firestore.
 * Returns a Map<cellKey, { ownerId, teamColor }>.
 */
export async function fetchAllTerritory() {
  const snap = await getDocs(collection(db, COLLECTION));
  const territory = {};
  snap.forEach((d) => {
    const data = d.data();
    territory[d.id] = {
      ownerId: data.ownerId,
      teamColor: data.teamColor,
    };
  });
  return territory;
}

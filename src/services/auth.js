import { signInAnonymously } from 'firebase/auth';

import { auth } from './firebase';
import { ensureUserProfile } from './user';

export async function ensureSignedInUser() {
  let currentUser = auth.currentUser;

  if (!currentUser) {
    const credential = await signInAnonymously(auth);
    currentUser = credential.user;
  }

  const profile = await ensureUserProfile(currentUser);
  return { user: currentUser, profile };
}

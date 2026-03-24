/**
 * Firebase initialisation — pure JS SDK (works in Expo Go, no native modules).
 */
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAHcV9xe270WYJ5CttfcOU1rM0wrwrLOB8',
  authDomain: 'turfwar-7be0b.firebaseapp.com',
  projectId: 'turfwar-7be0b',
  storageBucket: 'turfwar-7be0b.firebasestorage.app',
  messagingSenderId: '953533143496',
  appId: '1:953533143496:web:dfd4f2bc767746e77288fd',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };

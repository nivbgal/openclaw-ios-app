import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { FIRESTORE_COLLECTIONS, EXPO_PUSH_PROJECT_ID } from '../config/game';
import { db } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('territory-alerts', {
    name: 'Territory Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00e5ff',
  });
}

export async function registerPushTokenAsync(userId) {
  await ensureAndroidChannel();

  const permission = await Notifications.getPermissionsAsync();
  let finalStatus = permission.status;

  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (!EXPO_PUSH_PROJECT_ID) {
    console.warn(
      'Missing EXPO_PUBLIC_EAS_PROJECT_ID. Push token registration skipped.',
    );
    return null;
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PUSH_PROJECT_ID,
    })
  ).data;

  await setDoc(
    doc(collection(db, FIRESTORE_COLLECTIONS.pushTokens), token),
    {
      userId,
      token,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return token;
}

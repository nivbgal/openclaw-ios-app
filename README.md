# openclaw-ios-app

Turf-based running game built with Expo, React Native Maps, and Firebase.

## Firebase setup

The repo no longer stores Firebase config in source. Create a local `.env` file from `.env.example` and fill in your project values before starting Expo.

Required variables:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_EAS_PROJECT_ID`

Enable Anonymous Authentication in Firebase Auth for the current app flow.

## Firestore and Functions

The repo now includes:

- `firestore.rules`
- `firebase.json`
- `functions/index.js`

The trust model is:

- the client can create its own queued `runs` documents
- the backend function processes runs into territory ownership and theft events
- direct client writes to `captured_territory` and `territory_events` are denied by Firestore rules

Deploy steps:

1. Install the Firebase CLI and log in.
2. Run `npm install` in the repo root and in `functions/`.
3. Run `firebase deploy --only firestore:rules,functions`.

## Security note

If a Firebase web API key was previously committed, treat that as an exposure event even though Firebase API keys are not treated like server secrets. You should still rotate the key, review Firebase Auth settings, and lock down Firestore Security Rules before pushing the app further.

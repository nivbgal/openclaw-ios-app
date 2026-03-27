export const FIRESTORE_COLLECTIONS = {
  users: 'users',
  territory: 'captured_territory',
  runs: 'runs',
  territoryEvents: 'territory_events',
  pushTokens: 'push_tokens',
};

export const TEAM_COLORS = ['#00e5ff', '#7c4dff', '#00c853', '#ff9100', '#ff1744'];

export const GPS_JITTER_MIN_METERS = 1;
export const GPS_JITTER_MAX_METERS = 100;
export const FIRESTORE_FLUSH_DEBOUNCE_MS = 1000;
export const MAX_STORED_RUN_POINTS = 250;
export const EXPO_PUSH_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '';

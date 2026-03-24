/**
 * Distance calculation using the Haversine formula.
 */

const R = 6_371_000; // Earth radius in meters

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Distance in meters between two {latitude, longitude} points.
 */
export function haversine(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Total distance (m) along an array of coordinate points.
 */
export function totalDistance(trail) {
  let d = 0;
  for (let i = 1; i < trail.length; i++) {
    d += haversine(trail[i - 1], trail[i]);
  }
  return d;
}

/**
 * Convert meters → Sweat Coins (1 coin per 100 m).
 */
export function metersToCoins(meters) {
  return Math.floor(meters / 100);
}

/**
 * Grid utilities for TurfWar territory capture.
 *
 * We divide the world into a square grid where each cell is CELL_SIZE_METERS
 * on a side. A cell is identified by its (row, col) index derived from the
 * user's latitude/longitude.
 *
 * Because we work at city-block scale the flat-Earth approximation is fine.
 */

// ---- tunables ----
const CELL_SIZE_METERS = 50; // each grid square ≈ 50 m

// ---- constants ----
const METERS_PER_DEG_LAT = 111_320; // roughly constant everywhere

/**
 * Return the number of longitude-degrees that correspond to one meter at a
 * given latitude.
 */
function metersPerDegLon(latDeg) {
  return METERS_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);
}

/**
 * Convert a lat/lng to a grid cell key "row,col".
 */
export function coordToCell(latitude, longitude) {
  const row = Math.floor((latitude * METERS_PER_DEG_LAT) / CELL_SIZE_METERS);
  const col = Math.floor(
    (longitude * metersPerDegLon(latitude)) / CELL_SIZE_METERS,
  );
  return `${row},${col}`;
}

/**
 * Return the four corner coordinates of the polygon for a given cell key.
 * Returned as an array of {latitude, longitude} suitable for react-native-maps
 * Polygon.
 */
export function cellToPolygon(cellKey) {
  const [row, col] = cellKey.split(',').map(Number);

  const latStep = CELL_SIZE_METERS / METERS_PER_DEG_LAT;
  const south = (row * CELL_SIZE_METERS) / METERS_PER_DEG_LAT;
  const north = south + latStep;

  // Use the centre latitude of the cell to compute the longitude step so the
  // cell doesn't skew too much.
  const midLat = (south + north) / 2;
  const lonStep = CELL_SIZE_METERS / metersPerDegLon(midLat);
  const west = (col * CELL_SIZE_METERS) / metersPerDegLon(midLat);
  const east = west + lonStep;

  return [
    { latitude: south, longitude: west },
    { latitude: south, longitude: east },
    { latitude: north, longitude: east },
    { latitude: north, longitude: west },
  ];
}

/**
 * Build the set of visible cell keys inside a map region so we can render a
 * faint grid overlay.  Returns an array of cell keys.
 *
 * To keep things performant we cap at MAX_VISIBLE cells.
 */
const MAX_VISIBLE = 400;

export function visibleCells(region) {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

  const south = latitude - latitudeDelta / 2;
  const north = latitude + latitudeDelta / 2;
  const west = longitude - longitudeDelta / 2;
  const east = longitude + longitudeDelta / 2;

  const rowMin = Math.floor((south * METERS_PER_DEG_LAT) / CELL_SIZE_METERS);
  const rowMax = Math.floor((north * METERS_PER_DEG_LAT) / CELL_SIZE_METERS);
  const mpdLon = metersPerDegLon(latitude);
  const colMin = Math.floor((west * mpdLon) / CELL_SIZE_METERS);
  const colMax = Math.floor((east * mpdLon) / CELL_SIZE_METERS);

  const totalCells = (rowMax - rowMin + 1) * (colMax - colMin + 1);
  if (totalCells > MAX_VISIBLE) return []; // zoomed out too far, skip grid

  const cells = [];
  for (let r = rowMin; r <= rowMax; r++) {
    for (let c = colMin; c <= colMax; c++) {
      cells.push(`${r},${c}`);
    }
  }
  return cells;
}

export { CELL_SIZE_METERS };

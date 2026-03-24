import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import MapView, { PROVIDER_DEFAULT, Polyline, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';

import StartRunButton from '../components/StartRunButton';
import RunStatsOverlay from '../components/RunStatsOverlay';
import { coordToCell, cellToPolygon, visibleCells } from '../utils/grid';
import { haversine, totalDistance, metersToCoins } from '../utils/distance';
import { captureCell, fetchAllTerritory } from '../services/territory';
import { saveSweatCoins } from '../services/user';

// ---------- dark map style ----------
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  {
    featureType: 'administrative.country',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#4b6878' }],
  },
  {
    featureType: 'land',
    elementType: 'geometry',
    stylers: [{ color: '#1d2c4d' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#283d6a' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6f9ba5' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry.fill',
    stylers: [{ color: '#023e58' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#304a7d' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#98a5be' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#2c6675' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#255763' }],
  },
  {
    featureType: 'transit',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#98a5be' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0e1626' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4e6d70' }],
  },
];

const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

// ---------- component ----------
export default function HomeScreen() {
  // Map state
  const [region, setRegion] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  // Run state
  const [isRunning, setIsRunning] = useState(false);
  const locationSub = useRef(null);

  // Trail (array of {latitude, longitude})
  const [trail, setTrail] = useState([]);

  // Live distance + coins (computed incrementally for perf)
  const [distanceM, setDistanceM] = useState(0);
  const lastPoint = useRef(null);

  // Captured cells — local state mirrors Firestore
  // { cellKey: { ownerId, teamColor } }
  const [capturedCells, setCapturedCells] = useState({});

  // Grid overlay cells for the visible region
  const [gridCells, setGridCells] = useState([]);

  // Queue for Firestore writes (fire-and-forget, batched loosely)
  const writeQueue = useRef([]);
  const flushTimer = useRef(null);

  // ---- load existing territory from Firestore on mount ----
  useEffect(() => {
    fetchAllTerritory()
      .then((territory) => {
        if (Object.keys(territory).length > 0) {
          setCapturedCells(territory);
        }
      })
      .catch((err) => console.warn('Territory fetch failed:', err));
  }, []);

  // ---- initial location ----
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Required',
            'TurfWar needs your location to show the map around you. Please enable location permissions in Settings.',
            [{ text: 'OK' }],
          );
          setRegion(DEFAULT_REGION);
          setLoading(false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const initialRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        };
        setRegion(initialRegion);
      } catch (error) {
        console.warn('Location error:', error);
        setRegion(DEFAULT_REGION);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---- recompute grid overlay when region changes ----
  const handleRegionChange = useCallback((newRegion) => {
    setGridCells(visibleCells(newRegion));
  }, []);

  // ---- flush Firestore write queue ----
  const flushWrites = useCallback(() => {
    const batch = writeQueue.current.splice(0);
    batch.forEach((cellKey) => {
      captureCell(cellKey).catch((err) =>
        console.warn('Firestore write failed:', cellKey, err),
      );
    });
  }, []);

  // ---- start / stop run ----
  const startRun = useCallback(async () => {
    setTrail([]);
    setDistanceM(0);
    lastPoint.current = null;
    setIsRunning(true);

    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 3,
        timeInterval: 2000,
      },
      (loc) => {
        const { latitude, longitude } = loc.coords;
        const point = { latitude, longitude };

        // Accumulate distance incrementally
        if (lastPoint.current) {
          const delta = haversine(lastPoint.current, point);
          // Filter GPS jitter — ignore jumps < 1 m or > 100 m (teleport)
          if (delta >= 1 && delta <= 100) {
            setDistanceM((prev) => prev + delta);
          }
        }
        lastPoint.current = point;

        // Append to trail
        setTrail((prev) => [...prev, point]);

        // Capture grid cell
        const cellKey = coordToCell(latitude, longitude);
        setCapturedCells((prev) => {
          if (prev[cellKey]) return prev; // already captured
          // Queue Firestore write
          writeQueue.current.push(cellKey);
          // Debounce flush to ~1 s to batch nearby captures
          if (flushTimer.current) clearTimeout(flushTimer.current);
          flushTimer.current = setTimeout(flushWrites, 1000);

          return {
            ...prev,
            [cellKey]: { ownerId: 'player_001', teamColor: '#00e5ff' },
          };
        });
      },
    );
  }, [flushWrites]);

  const stopRun = useCallback(async () => {
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    setIsRunning(false);

    // Flush any remaining writes
    flushWrites();

    // Save Sweat Coins to Firestore
    setDistanceM((currentDist) => {
      const coins = metersToCoins(currentDist);
      if (coins > 0 || currentDist > 0) {
        saveSweatCoins(coins, Math.round(currentDist)).catch((err) =>
          console.warn('Failed to save sweat coins:', err),
        );
      }
      return currentDist; // don't change — just read inside setter
    });
  }, [flushWrites]);

  const handleRunToggle = useCallback(() => {
    if (isRunning) {
      stopRun();
    } else {
      startRun();
    }
  }, [isRunning, startRun, stopRun]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (locationSub.current) locationSub.current.remove();
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, []);

  // ---- derived values ----
  const sweatCoins = metersToCoins(distanceM);
  const capturedKeys = Object.keys(capturedCells);

  // ---- render ----
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00e5ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        customMapStyle={DARK_MAP_STYLE}
        userInterfaceStyle="dark"
        onRegionChangeComplete={handleRegionChange}
      >
        {/* Faint grid overlay (uncaptured cells only) */}
        {gridCells.map((cellKey) => {
          if (capturedCells[cellKey]) return null;
          return (
            <Polygon
              key={`grid-${cellKey}`}
              coordinates={cellToPolygon(cellKey)}
              strokeColor="rgba(0, 229, 255, 0.15)"
              fillColor="transparent"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Captured cells — colored by team */}
        {capturedKeys.map((cellKey) => {
          const cell = capturedCells[cellKey];
          const color = cell.teamColor || '#00e5ff';
          // Convert hex to rgba for the fill
          const hexToRgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
          };
          const fill = color.startsWith('#')
            ? hexToRgba(color, 0.3)
            : 'rgba(0, 255, 255, 0.3)';
          const stroke = color.startsWith('#')
            ? hexToRgba(color, 0.6)
            : 'rgba(0, 255, 255, 0.6)';
          return (
            <Polygon
              key={`cap-${cellKey}`}
              coordinates={cellToPolygon(cellKey)}
              strokeColor={stroke}
              fillColor={fill}
              strokeWidth={1}
            />
          );
        })}

        {/* Trail polyline */}
        {trail.length >= 2 && (
          <Polyline
            coordinates={trail}
            strokeColor="#00e5ff"
            strokeWidth={4}
            lineDashPattern={[0]}
          />
        )}
      </MapView>

      {/* Live stats HUD — only during active run */}
      {isRunning && (
        <RunStatsOverlay distanceM={distanceM} sweatCoins={sweatCoins} />
      )}

      <StartRunButton onPress={handleRunToggle} isRunning={isRunning} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a1929',
  },
});

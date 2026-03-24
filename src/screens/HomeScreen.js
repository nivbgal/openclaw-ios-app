import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import MapView, { PROVIDER_DEFAULT, Polyline, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import StartRunButton from '../components/StartRunButton';
import { coordToCell, cellToPolygon, visibleCells } from '../utils/grid';

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
  const [currentRegion, setCurrentRegion] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  // Run state
  const [isRunning, setIsRunning] = useState(false);
  const locationSub = useRef(null);

  // Trail (array of {latitude, longitude})
  const [trail, setTrail] = useState([]);

  // Captured cells (Set stored as object for fast lookup, rendered from keys)
  const [capturedCells, setCapturedCells] = useState({});

  // Grid overlay cells for the visible region
  const [gridCells, setGridCells] = useState([]);

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
        setCurrentRegion(initialRegion);
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
    setCurrentRegion(newRegion);
    setGridCells(visibleCells(newRegion));
  }, []);

  // ---- start / stop run ----
  const startRun = useCallback(async () => {
    // Reset trail for a new run (keep previously captured cells across runs)
    setTrail([]);
    setIsRunning(true);

    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 3, // emit every ~3 m of movement
        timeInterval: 2000, // or every 2 s
      },
      (loc) => {
        const { latitude, longitude } = loc.coords;
        const point = { latitude, longitude };

        // Append to trail
        setTrail((prev) => [...prev, point]);

        // Check / capture grid cell
        const cellKey = coordToCell(latitude, longitude);
        setCapturedCells((prev) => {
          if (prev[cellKey]) return prev; // already captured
          return { ...prev, [cellKey]: true };
        });
      },
    );
  }, []);

  const stopRun = useCallback(() => {
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    setIsRunning(false);
  }, []);

  const handleRunToggle = useCallback(() => {
    if (isRunning) {
      stopRun();
    } else {
      startRun();
    }
  }, [isRunning, startRun, stopRun]);

  // Clean up subscription on unmount
  useEffect(() => {
    return () => {
      if (locationSub.current) {
        locationSub.current.remove();
      }
    };
  }, []);

  // ---- render ----
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00e5ff" />
      </View>
    );
  }

  const capturedKeys = Object.keys(capturedCells);

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
        {/* Faint grid overlay */}
        {gridCells.map((cellKey) => {
          const isCaptured = !!capturedCells[cellKey];
          // Only draw uncaptured cells as faint outlines; captured ones drawn below
          if (isCaptured) return null;
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

        {/* Captured cells */}
        {capturedKeys.map((cellKey) => (
          <Polygon
            key={`cap-${cellKey}`}
            coordinates={cellToPolygon(cellKey)}
            strokeColor="rgba(0, 255, 255, 0.6)"
            fillColor="rgba(0, 255, 255, 0.3)"
            strokeWidth={1}
          />
        ))}

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

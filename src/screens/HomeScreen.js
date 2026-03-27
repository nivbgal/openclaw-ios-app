import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import MapView, { PROVIDER_DEFAULT, Polyline, Polygon } from 'react-native-maps';
import * as Location from 'expo-location';

import {
  FIRESTORE_FLUSH_DEBOUNCE_MS,
  GPS_JITTER_MAX_METERS,
  GPS_JITTER_MIN_METERS,
} from '../config/game';
import StartRunButton from '../components/StartRunButton';
import RunStatsOverlay from '../components/RunStatsOverlay';
import { ensureSignedInUser } from '../services/auth';
import { registerPushTokenAsync } from '../services/notifications';
import { submitRun } from '../services/runs';
import { fetchAllTerritory } from '../services/territory';
import { coordToCell, cellToPolygon, visibleCells } from '../utils/grid';
import { haversine, metersToCoins } from '../utils/distance';

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

export default function HomeScreen() {
  const [region, setRegion] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [syncingRun, setSyncingRun] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [isRunning, setIsRunning] = useState(false);
  const locationSub = useRef(null);

  const [trail, setTrail] = useState([]);
  const [distanceM, setDistanceM] = useState(0);
  const lastPoint = useRef(null);

  const [capturedCells, setCapturedCells] = useState({});
  const [gridCells, setGridCells] = useState([]);
  const pushRegistrationTimer = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapSession() {
      try {
        const { user, profile: nextProfile } = await ensureSignedInUser();
        if (!isMounted) return;

        setCurrentUser(user);
        setProfile(nextProfile);

        const territory = await fetchAllTerritory();
        if (isMounted) {
          setCapturedCells(territory);
        }

        pushRegistrationTimer.current = setTimeout(() => {
          registerPushTokenAsync(user.uid).catch((err) =>
            console.warn('Push registration failed:', err),
          );
        }, FIRESTORE_FLUSH_DEBOUNCE_MS);
      } catch (error) {
        console.warn('Session bootstrap failed:', error);
        const details = [error?.code, error?.message].filter(Boolean).join('\n');
        Alert.alert(
          'Sign-in failed',
          details ||
            'The app could not create a player session. Check Firebase Auth and try again.',
        );
      } finally {
        if (isMounted) {
          setSessionLoading(false);
        }
      }
    }

    bootstrapSession();

    return () => {
      isMounted = false;
      if (pushRegistrationTimer.current) {
        clearTimeout(pushRegistrationTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location Required',
            'TurfWar needs your location to show the map around you. Please enable location permissions in Settings.',
            [{ text: 'OK' }],
          );
          if (isMounted) {
            setRegion(DEFAULT_REGION);
            setGridCells(visibleCells(DEFAULT_REGION));
          }
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

        if (isMounted) {
          setRegion(initialRegion);
          setGridCells(visibleCells(initialRegion));
        }
      } catch (error) {
        console.warn('Location error:', error);
        if (isMounted) {
          setRegion(DEFAULT_REGION);
          setGridCells(visibleCells(DEFAULT_REGION));
        }
      } finally {
        if (isMounted) {
          setLocationLoading(false);
        }
      }
    }

    loadLocation();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRegionChange = useCallback((nextRegion) => {
    setRegion(nextRegion);
    setGridCells(visibleCells(nextRegion));
  }, []);

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
        const point = { latitude, longitude, timestamp: loc.timestamp };

        if (lastPoint.current) {
          const delta = haversine(lastPoint.current, point);
          if (delta >= GPS_JITTER_MIN_METERS && delta <= GPS_JITTER_MAX_METERS) {
            setDistanceM((prev) => prev + delta);
          }
        }
        lastPoint.current = point;

        setTrail((prev) => [...prev, point]);

        if (!currentUser || !profile) return;

        const cellKey = coordToCell(latitude, longitude);
        setCapturedCells((prev) => {
          if (prev[cellKey]?.ownerId === currentUser.uid) return prev;
          return {
            ...prev,
            [cellKey]: {
              ownerId: currentUser.uid,
              displayName: profile.displayName,
              teamColor: profile.teamColor,
            },
          };
        });
      },
    );
  }, [currentUser, profile]);

  const stopRun = useCallback(async () => {
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    setIsRunning(false);

    if (!currentUser || !profile || trail.length === 0) {
      return;
    }

    setSyncingRun(true);
    try {
      const summary = await submitRun({
        userId: currentUser.uid,
        profile,
        distanceM,
        trail,
      });

      Alert.alert(
        'Run submitted',
        `${summary.earnedCoins} coins queued. Territory updates will appear after the backend processes the run.`,
      );
    } catch (error) {
      console.warn('Run sync failed:', error);
      Alert.alert(
        'Run sync failed',
        'Your territory changes were not saved. Check Firestore rules and network access.',
      );
    } finally {
      setSyncingRun(false);
    }
  }, [currentUser, distanceM, profile, trail]);

  const handleRunToggle = useCallback(() => {
    if (syncingRun) return;

    if (isRunning) {
      stopRun();
    } else {
      startRun();
    }
  }, [isRunning, startRun, stopRun, syncingRun]);

  useEffect(() => {
    return () => {
      if (locationSub.current) locationSub.current.remove();
    };
  }, []);

  const loading = locationLoading || sessionLoading;
  const sweatCoins = metersToCoins(distanceM);
  const capturedKeys = Object.keys(capturedCells);

  if (loading || !region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00e5ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        customMapStyle={DARK_MAP_STYLE}
        userInterfaceStyle="dark"
        onRegionChangeComplete={handleRegionChange}
      >
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

        {capturedKeys.map((cellKey) => {
          const cell = capturedCells[cellKey];
          const color = cell.teamColor || '#00e5ff';
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

        {trail.length >= 2 && (
          <Polyline
            coordinates={trail}
            strokeColor="#00e5ff"
            strokeWidth={4}
            lineDashPattern={[0]}
          />
        )}
      </MapView>

      {isRunning && (
        <RunStatsOverlay distanceM={distanceM} sweatCoins={sweatCoins} />
      )}

      <StartRunButton
        onPress={handleRunToggle}
        isRunning={isRunning}
        disabled={syncingRun || !currentUser || !profile}
      />
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

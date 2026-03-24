import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Translucent HUD at the top of the map showing live run stats.
 * Only visible during an active run.
 */
export default function RunStatsOverlay({ distanceM, sweatCoins }) {
  const distKm = (distanceM / 1000).toFixed(2);

  return (
    <View style={styles.container}>
      <View style={styles.stat}>
        <Text style={styles.label}>DISTANCE</Text>
        <Text style={styles.value}>{distKm} km</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.label}>SWEAT COINS</Text>
        <Text style={styles.value}>🪙 {sweatCoins}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 25, 41, 0.85)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
  },
  label: {
    color: 'rgba(0, 229, 255, 0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  value: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
});

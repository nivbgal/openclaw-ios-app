import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  View,
} from 'react-native';

export default function StartRunButton({ onPress, isRunning = false }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.93,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.wrapper}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[styles.button, isRunning && styles.buttonStop]}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
        >
          <Text style={[styles.icon, isRunning && styles.iconStop]}>
            {isRunning ? '■' : '▶'}
          </Text>
          <Text style={[styles.text, isRunning && styles.textStop]}>
            {isRunning ? 'STOP RUN' : 'START RUN'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00e5ff',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 50,
    shadowColor: '#00e5ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonStop: {
    backgroundColor: '#ff1744',
    shadowColor: '#ff1744',
  },
  icon: {
    color: '#0a1929',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
  },
  iconStop: {
    color: '#fff',
  },
  text: {
    color: '#0a1929',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  textStop: {
    color: '#fff',
  },
});

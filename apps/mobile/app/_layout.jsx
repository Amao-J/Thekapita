import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { isAuthenticated, restoreSession, subscribe } from '../state/session.js';
import { colors } from '../theme/tokens.js';

export default function RootLayout() {
  const [booting, setBooting] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribe(() => {
      if (mounted) {
        setAuthenticated(isAuthenticated());
      }
    });

    restoreSession()
      .then(() => {
        if (mounted) {
          setAuthenticated(isAuthenticated());
          setBooting(false);
        }
      })
      .catch((error) => {
        console.error('Failed to restore mobile session:', error);
        if (mounted) {
          setBooting(false);
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.emerald} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!authenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={authenticated}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

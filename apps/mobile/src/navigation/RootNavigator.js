import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';

import { restoreSession, isAuthenticated, subscribe } from '../state/session.js';
import { colors } from '../theme/tokens.js';

import SignInScreen from '../screens/auth/SignInScreen.js';
import SignUpScreen from '../screens/auth/SignUpScreen.js';
import HomeScreen from '../screens/home/HomeScreen.js';
import WalletScreen from '../screens/wallet/WalletScreen.js';

const AuthStack = createNativeStackNavigator();
const MainStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="SignIn" component={SignInScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainStack.Navigator screenOptions={{ headerTintColor: colors.ink }}>
      <MainStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <MainStack.Screen name="Wallet" component={WalletScreen} options={{ title: 'theKapita Pay' }} />
      {/* Additional module stacks (Market, Seller, Profile...) mount here
          the same way — one entry per module, matching the phased build
          order in the Building Plan (Section 7/8). */}
    </MainStack.Navigator>
  );
}

export default function RootNavigator() {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    // Restore any session saved in SecureStore from a previous app launch,
    // then keep this in sync with session.js going forward — a login,
    // logout or silent token refresh anywhere in the app flips this
    // automatically, without any screen needing to call navigation.reset()
    // itself.
    restoreSession().then(() => {
      setAuthed(isAuthenticated());
      setBooting(false);
    });
    const unsubscribe = subscribe(() => setAuthed(isAuthenticated()));
    return unsubscribe;
  }, []);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.emerald} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {authed ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

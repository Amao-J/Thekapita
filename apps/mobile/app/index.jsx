
import { Redirect } from 'expo-router';
import { isAuthenticated } from '../state/session.js';

export default function Index() {
  return (
    <Redirect
      href={isAuthenticated() ? '/(tabs)/HomeScreen' : '/(auth)/SignInScreen'}
    />
  );
}

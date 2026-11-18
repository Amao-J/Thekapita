import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens.js';

export default function LandingScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>THE UNIFIED SUPER-APP ECOSYSTEM</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.brand}>
          <Text style={styles.brandPrefix}>the</Text>Kapita<Text style={styles.brandDot}>.</Text>
        </Text>
        <Text style={styles.title}>One Super App.{'\n'}Every everyday essential.</Text>
        <Text style={styles.subtitle}>
          Wallet, bills, rides, food, marketplace, and more — united by one trusted identity.
        </Text>
      </View>

      <Link href="/(auth)/SignInScreen" asChild>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Get started</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingVertical: 48,
    backgroundColor: colors.white,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#e7fff4',
  },
  badgeText: {
    color: colors.emeraldDark,
    fontSize: 11,
    fontWeight: '700',
  },
  hero: {
    gap: spacing.lg,
  },
  brand: {
    ...typography.h2,
  },
  brandPrefix: {
    color: colors.emerald,
  },
  brandDot: {
    color: colors.emerald,
  },
  title: {
    ...typography.h1,
    fontSize: 36,
    lineHeight: 42,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
    lineHeight: 24,
  },
  button: {
    alignItems: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    paddingVertical: 18,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});

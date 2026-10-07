import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { register } from '../../state/session.js';
import { ApiError } from '../../api/client.js';
import { validateRegisterForm } from '@thekapita/shared/validators';
import { colors, spacing, radii, typography } from '../../theme/tokens.js';

export default function SignUpScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);
    // Same validators, same rules, as apps/web/src/pages/auth.js — this is
    // the whole point of packages/shared/validators.js existing: one set
    // of sign-up rules, not two that can quietly drift apart.
    const { valid, errors } = validateRegisterForm({ fullName, email, phone, password });
    if (!valid) {
      setError(Object.values(errors)[0]);
      return;
    }

    setBusy(true);
    try {
      await register({ fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach theKapita. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>One identity for every theKapita module</Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Full legal name</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="e.g. Chris Omolu" />

      <Text style={styles.label}>Email address</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text style={styles.label}>Phone number</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="e.g. 08012345678"
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />

      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Create Account</Text>}
      </Pressable>

      <Pressable onPress={() => navigation.navigate('SignIn')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.white, padding: spacing.xl, justifyContent: 'center' },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.xl },
  label: { ...typography.label, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.emerald,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  link: { color: colors.emeraldDark, textAlign: 'center', marginTop: spacing.lg, fontSize: 13 },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 13 },
});

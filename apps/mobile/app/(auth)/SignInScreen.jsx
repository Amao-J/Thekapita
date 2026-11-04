import { useEffect, useState } from 'react';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { validateRegisterForm } from '@thekapita/shared/validators';
import { ApiError } from '../../api/client.js';
import { login, register } from '../../state/session.js';
import { colors, radii, spacing, typography } from '../../theme/tokens.js';
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export default function SignInScreen() {
  const [authMode, setAuthMode] = useState('signin');
  const [identifier, setIdentifier] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [tabsWidth, setTabsWidth] = useState(0);

const indicatorX = useSharedValue(0);

const tabWidth = Math.max(0, (tabsWidth - spacing.xs * 2) / 2);

useEffect(() => {
  indicatorX.value = withTiming(
    authMode === 'signup' ? tabWidth : 0,
    { duration: 320 }
  );
}, [authMode, tabWidth, indicatorX]);

const indicatorStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: indicatorX.value }],
}));

  async function handleSubmit() {
    setError(null);

    if (authMode === 'signup') {
      const { valid, errors } = validateRegisterForm({ fullName, email, phone, password });
      if (!valid) {
        console.log("error?",errors)
        setError(Object.values(errors)[0]);
        return;
      }
    }

    setBusy(true);
    try {
      if (authMode === 'signup') {
        await register({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
        });
      } else {
        await login(identifier.trim(), password);
      }
    } catch (err) {
      console.log(err)
      setError(err instanceof ApiError ? err.message : 'Could not reach theKapita. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.wrapper}>
          <View style={styles.header}>
            <Text style={styles.brandTitle}>
              <Text style={styles.brandPrefix}>the</Text>Kapita
              <Text style={styles.brandDot}>.</Text>
            </Text>
            <Text style={styles.subtitle}>One App. One Identity. One Wallet</Text>
          </View>

          <Animated.View
  layout={LinearTransition.duration(350)}
  style={styles.card}
>
            <View
  style={styles.authTabs}
  onLayout={(event) => setTabsWidth(event.nativeEvent.layout.width)}
>
  <Animated.View
    pointerEvents="none"
    style={[
      styles.authTabIndicator,
      { width: tabWidth },
      indicatorStyle,
    ]}
  />

  <Pressable
    style={styles.authTab}
    accessibilityRole="tab"
    accessibilityState={{ selected: authMode === 'signin' }}
    onPress={() => {
      setAuthMode('signin');
      setError(null);
    }}
  >
    <Text
      style={[
        styles.authTabText,
        authMode === 'signin' && styles.authTabTextActive,
      ]}
    >
      Sign In
    </Text>
  </Pressable>

  <Pressable
    style={styles.authTab}
    accessibilityRole="tab"
    accessibilityState={{ selected: authMode === 'signup' }}
    onPress={() => {
      setAuthMode('signup');
      setError(null);
    }}
  >
    <Text
      style={[
        styles.authTabText,
        authMode === 'signup' && styles.authTabTextActive,
      ]}
    >
      Create Account
    </Text>
  </Pressable>
            </View>

            {/* <Text style={styles.title}>
              {authMode === 'signup' ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text style={styles.cardSubtitle}>
              {authMode === 'signup'
                ? 'One identity for every theKapita module'
                : 'Sign in to your theKapita account'}
            </Text> */}

            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {authMode === 'signup' ? (
               <Animated.View
    key="signup-fields"
    entering={FadeInDown.duration(250)}
    exiting={FadeOutUp.duration(150)}
    layout={LinearTransition.duration(300)}
  >
                <Text style={styles.label}>Full legal name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="e.g. Chris Omolu"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  returnKeyType="next"
                  accessibilityLabel="Full legal name"
                />

                <Text style={styles.label}>Email address</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  accessibilityLabel="Email address"
                />

                <Text style={styles.label}>Phone number</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. 08012345678"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  accessibilityLabel="Phone number"
                />
              </Animated.View>
            ) : (
               <Animated.View
    key="signin-fields"
    entering={FadeInDown.duration(250)}
    exiting={FadeOutUp.duration(150)}
    layout={LinearTransition.duration(300)}
  >
                <Text style={styles.label}>Email or theKapita ID</Text>
                <TextInput
                  style={styles.input}
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="e.g. name@example.com or KPT-883902"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  accessibilityLabel="Email or theKapita ID"
                />
              </Animated.View>
            )}

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              returnKeyType="go"
              autoCapitalize="none"
              onSubmitEditing={handleSubmit}
              accessibilityLabel="Password"
            />

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={busy}
              accessibilityRole="button"
            >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>
                {authMode === 'signup' ? 'Create Account' : 'Sign In'}
              </Text>
            )}
            </Pressable>
            <View style={styles.alternateConnectBoxesContainer}>
            <View style={styles.alternateConnectBoxes}>
              <View style={styles.alternateConnectBoxesInnerView}>
            <Ionicons name={"logo-apple"} size={21} color="#000000" />
<Text>Apple</Text></View>
            </View>
            <View style={styles.alternateConnectBoxes}>
            <View style={styles.alternateConnectBoxesInnerView}>
            <Ionicons name={"logo-google"} size={21} color="#5F33FF" />
<Text>Google</Text></View>
            </View>
</View>



          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  wrapper: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brandTitle: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '700',
  },
  brandPrefix: {
    color: colors.ink,
    fontSize:20
  },
  brandDot: {
    color: colors.emerald,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    elevation: 3,
    padding: spacing.xl,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  authTabs: {
    backgroundColor: colors.surface,
  borderRadius: radii.md,
  flexDirection: 'row',
  marginBottom: spacing.lg,
  padding: spacing.xs,
  position: 'relative',
  overflow: 'hidden',
  },
  authTab: {
   alignItems: 'center',
  borderRadius: radii.sm,
  flex: 1,
  justifyContent: 'center',
  minHeight: 40,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
  zIndex: 1,
  },
  authTabIndicator: {
  position: 'absolute',
  left: spacing.xs,
  top: spacing.xs,
  bottom: spacing.xs,
  backgroundColor: colors.white,
  borderRadius: radii.sm,
  elevation: 2,
  shadowColor: colors.ink,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.1,
  shadowRadius: 3,
},
  authTabActive: {
    backgroundColor: colors.white,
    elevation: 2,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  authTabText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  authTabTextActive: {
    color: colors.ink,
  },
  title: {
    ...typography.h2,
    color: colors.ink,
  },
  cardSubtitle: {
    ...typography.body,
    color: colors.muted,
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.ink,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderRadius: radii.sm,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  alternateConnectBoxesContainer:{
  // backgroundColor:"red",
  height:"13%",
  display:"flex", 
  flexDirection:"row",
  justifyContent:"space-between",
  marginTop:"5%"
  },
  alternateConnectBoxes:{
    width:"48%",
    height:"100%",
    // backgroundColor:"pink",
    borderRadius:radii.md,
    borderColor:colors.muted,
    borderWidth:.5,
     display:"flex", 
 alignItems:"center",
  justifyContent:"center",
  },
  alternateConnectBoxesInnerView:{
    // backgroundColor:"pink",
     display:"flex",
     flexDirection:"row", 
width:"50%",
  justifyContent:"space-between",
  alignItems:"center"
  }
});

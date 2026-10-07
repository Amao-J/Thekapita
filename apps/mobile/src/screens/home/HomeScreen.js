import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { getCurrentUser, logout } from '../../state/session.js';
import { colors, spacing, radii, typography } from '../../theme/tokens.js';

// Placeholder module list — apps/web's src/pages/app.js reads these from
// data-* attributes on hand-authored HTML; a real shared module registry
// (in packages/shared, the way endpoints.js already works) is the natural
// next step so web and mobile show the same launcher grid from one list
// instead of two.
const MODULES = [
  { id: 'wallet', title: 'Pay', desc: 'Wallet, transfers & bills' },
  { id: 'market', title: 'Market', desc: 'Buy & sell, escrowed' },
  { id: 'ride', title: 'Ride', desc: 'Coming soon' },
  { id: 'eats', title: 'Eats', desc: 'Coming soon' },
];

export default function HomeScreen({ navigation }) {
  const user = getCurrentUser();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''} 👋</Text>
          <Text style={styles.subtitle}>What would you like to do?</Text>
        </View>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Sign out</Text>
        </Pressable>
      </View>

      <FlatList
        data={MODULES}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ gap: spacing.md }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => {
              if (item.id === 'wallet') navigation.navigate('Wallet');
              // Other modules route to a shared "ComingSoon" screen once
              // one exists — see the Building Plan's mobile section for
              // why this avoids the vanilla scaffold's dead-route bug.
            }}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDesc}>{item.desc}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xl },
  greeting: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.body, color: colors.muted },
  logout: { color: colors.emeraldDark, fontSize: 13, fontWeight: '600' },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 100,
  },
  cardTitle: { ...typography.label, color: colors.ink, fontSize: 16, marginBottom: spacing.xs },
  cardDesc: { ...typography.caption, color: colors.muted },
});

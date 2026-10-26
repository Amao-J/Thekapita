// import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
// import { getCurrentUser, logout } from '../../state/session.js';
// import { colors, spacing, radii, typography } from '../../theme/tokens.js';

// // Placeholder module list — apps/web's src/pages/app.js reads these from
// // data-* attributes on hand-authored HTML; a real shared module registry
// // (in packages/shared, the way endpoints.js already works) is the natural
// // next step so web and mobile show the same launcher grid from one list
// // instead of two.
// const MODULES = [
//   { id: 'wallet', title: 'Pay', desc: 'Wallet, transfers & bills' },
//   { id: 'market', title: 'Market', desc: 'Buy & sell, escrowed' },
//   { id: 'ride', title: 'Ride', desc: 'Coming soon' },
//   { id: 'eats', title: 'Eats', desc: 'Coming soon' },
// ];

// export default function HomeScreen({ navigation }) {
//   const user = getCurrentUser();

//   return (
//     <View style={styles.container}>
//       <View style={styles.header}>
//         <View>
//           <Text style={styles.greeting}>Hi{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''} 👋</Text>
//           <Text style={styles.subtitle}>What would you like to do?</Text>
//         </View>
//         <Pressable onPress={logout}>
//           <Text style={styles.logout}>Sign out</Text>
//         </Pressable>
//       </View>

//       <FlatList
//         data={MODULES}
//         keyExtractor={(item) => item.id}
//         numColumns={2}
//         columnWrapperStyle={{ gap: spacing.md }}
//         contentContainerStyle={{ gap: spacing.md }}
//         renderItem={({ item }) => (
//           <Pressable
//             style={styles.card}
//             onPress={() => {
//               if (item.id === 'wallet') navigation.navigate('Wallet');
//               // Other modules route to a shared "ComingSoon" screen once
//               // one exists — see the Building Plan's mobile section for
//               // why this avoids the vanilla scaffold's dead-route bug.
//             }}
//           >
//             <Text style={styles.cardTitle}>{item.title}</Text>
//             <Text style={styles.cardDesc}>{item.desc}</Text>
//           </Pressable>
//         )}
//       />
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg },
//   header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xl },
//   greeting: { ...typography.h2, color: colors.ink },
//   subtitle: { ...typography.body, color: colors.muted },
//   logout: { color: colors.emeraldDark, fontSize: 13, fontWeight: '600' },
//   card: {
//     flex: 1,
//     backgroundColor: colors.white,
//     borderRadius: radii.lg,
//     borderWidth: 1,
//     borderColor: colors.border,
//     padding: spacing.lg,
//     minHeight: 100,
//   },
//   cardTitle: { ...typography.label, color: colors.ink, fontSize: 16, marginBottom: spacing.xs },
//   cardDesc: { ...typography.caption, color: colors.muted },
// });




import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Keyboard,
} from 'react-native';

import { getCurrentUser, logout } from '../../state/session.js';
import { colors, spacing, radii, typography } from '../../theme/tokens.js';

const EMERALD = '#00D084';
const EMERALD_DARK = '#008755';
const INK = '#121212';
const MUTED = '#64748B';
const BORDER = '#CBD5E1';
const SOFT = '#F8FAFC';

const PLACEHOLDERS = [
  "Search 'Ride to Airport'...",
  "Search 'Order Jollof'...",
  "Search 'Pay Electricity'...",
  'Ask Kapita Brain AI...',
];

const QUICK_ACTIONS = [
  { id: 'wallet', title: 'Kapita Pay', icon: '💳' },
  { id: 'bills', title: 'Pay Bills', icon: '⚡' },
  { id: 'ride', title: 'Book Ride', icon: '🚗' },
  { id: 'eats', title: 'Order Chow', icon: '🍔' },
  { id: 'market', title: 'Marketplace', icon: '🛍️' },
];

const MODULES = [
  {
    id: 'ride',
    title: 'Rides',
    desc: 'Ride & Logistics',
    icon: '🚗',
    tint: '#E6FDF4',
  },
  {
    id: 'bills',
    title: 'Bills & Pay',
    desc: 'Utilities & Subs',
    icon: '🧾',
    tint: '#FFF7ED',
  },
  {
    id: 'eats',
    title: 'Eats',
    desc: 'Food & Bukka',
    icon: '🍔',
    tint: '#FEF3C7',
  },
  {
    id: 'haven',
    title: 'Haven',
    desc: 'Real Estate',
    icon: '🏠',
    tint: '#EFF6FF',
  },
  {
    id: 'care',
    title: 'Care',
    desc: 'Healthcare',
    icon: '🩺',
    tint: '#FDF2F8',
  },
  {
    id: 'counsel',
    title: 'Counsel',
    desc: 'Legal Directory',
    icon: '⚖️',
    tint: '#F5F3FF',
  },
  {
    id: 'talent',
    title: 'Talent',
    desc: 'Jobs & Hiring',
    icon: '💼',
    tint: '#F1F5F9',
  },
  {
    id: 'brain',
    title: 'Brain AI',
    desc: 'AI Assistant',
    icon: '🤖',
    tint: '#ECFEFF',
  },
  {
    id: 'stays',
    title: 'Stays',
    desc: 'Hospitality',
    icon: '🏨',
    tint: '#FFF7ED',
  },
  {
    id: 'handy',
    title: 'Handy',
    desc: 'Skilled Artisans',
    icon: '🔧',
    tint: '#F0FDF4',
  },
  {
    id: 'market',
    title: 'Market',
    desc: 'Buy & Sell',
    icon: '🛍️',
    tint: '#FDF4FF',
  },
  {
    id: 'all',
    title: 'All Apps',
    desc: 'View More',
    icon: '+12',
    tint: INK,
  },
];

const APP_LINKS = {
  wallet: 'Wallet',
  market: 'Marketplace',
  bills: 'Bills',
  ride: 'Ride',
  eats: 'Eats',
};

function IconButton({ icon, label, onPress, badge }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.headerIcon}>{icon}</Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function HomeScreen({ navigation }) {
  const user = getCurrentUser();
  const firstName = user?.full_name?.trim().split(/\s+/)[0];

  const [search, setSearch] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [activeMenu, setActiveMenu] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length);
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  function openApp(id) {
    setActiveMenu(null);

    const route = APP_LINKS[id];

    if (route && navigation.getState().routeNames.includes(route)) {
      navigation.navigate(route);
      return;
    }

    if (id === 'all') {
      setActiveMenu('apps');
      return;
    }

    // Routes not registered in this navigator are not navigated to.
    // Add their screens when those modules are ready.
  }

  function handleSearch() {
    const query = search.trim();

    if (!query) return;

    Keyboard.dismiss();

    // Connect this handler to your search screen or Brain AI API.
    // For now, the input and submit action work without a fake result.
    console.log('theKapita search:', query);
  }

  function handleLogout() {
    setActiveMenu(null);
    logout();
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Brand header */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="theKapita home"
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.brand}>
              <Text style={styles.brandPrefix}>the</Text>
              Kapita<Text style={styles.brandDot}>.</Text>
            </Text>
          </Pressable>

          <View style={styles.headerActions}>
            <IconButton
              icon="♧"
              label="Notifications"
              badge="0"
              onPress={() => setActiveMenu('notifications')}
            />

            <IconButton
              icon="▦"
              label="Open apps"
              onPress={() => setActiveMenu('apps')}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Account settings"
              style={styles.avatar}
              onPress={() => {
                if (
                  navigation.getState().routeNames.includes('Profile')
                ) {
                  navigation.navigate('Profile');
                } else {
                  setActiveMenu('account');
                }
              }}
            >
              <Text style={styles.avatarText}>
                {firstName?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Hero and search */}
        <View style={styles.hero}>
          <Text style={styles.greeting}>
            {firstName ? `Good to see you, ${firstName}.` : 'Welcome to theKapita.'}
          </Text>

          <Text style={styles.heroSubtitle}>
            What do you need today?
          </Text>

          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>⌕</Text>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={PLACEHOLDERS[placeholderIndex]}
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              accessibilityLabel="Search theKapita services"
            />

            {search.length > 0 ? (
              <Pressable
                accessibilityLabel="Clear search"
                onPress={() => setSearch('')}
                hitSlop={8}
              >
                <Text style={styles.clearSearch}>×</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={handleSearch}
              style={styles.aiButton}
            >
              <Text style={styles.aiButtonText}>Ask AI</Text>
            </Pressable>
          </View>

          {/* Quick action pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActions}
          >
            {QUICK_ACTIONS.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => openApp(item.id)}
                style={({ pressed }) => [
                  styles.quickPill,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.quickPillText}>
                  {item.icon} {item.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Service launcher */}
        <View style={styles.servicesSection}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>
                Services & Ecosystem
              </Text>
              <Text style={styles.sectionSubtitle}>
                Everything you need, in one place.
              </Text>
            </View>

            <View style={styles.countTag}>
              <Text style={styles.countTagText}>20+ Apps</Text>
            </View>
          </View>

          <View style={styles.moduleGrid}>
            {MODULES.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.desc}`}
                onPress={() => openApp(item.id)}
                style={({ pressed }) => [
                  styles.moduleCard,
                  pressed && styles.moduleCardPressed,
                ]}
              >
                <View
                  style={[
                    styles.moduleIcon,
                    { backgroundColor: item.tint },
                    item.id === 'all' && styles.allAppsIcon,
                  ]}
                >
                  <Text
                    style={[
                      styles.moduleEmoji,
                      item.id === 'all' && styles.allAppsText,
                    ]}
                  >
                    {item.icon}
                  </Text>
                </View>

                <Text style={styles.moduleTitle} numberOfLines={1}>
                  {item.title}
                </Text>

                <Text style={styles.moduleDescription} numberOfLines={2}>
                  {item.desc}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Account action */}
        <Pressable
          onPress={handleLogout}
          style={styles.signOutButton}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>

      {/* Native notification / app launcher / account panel */}
      <Modal
        visible={activeMenu !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setActiveMenu(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setActiveMenu(null)}
        >
          <Pressable
            style={styles.modalPanel}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeMenu === 'apps'
                  ? 'theKapita Apps'
                  : activeMenu === 'notifications'
                    ? 'Activity & Alerts'
                    : 'Your Account'}
              </Text>

              <Pressable
                onPress={() => setActiveMenu(null)}
                hitSlop={10}
              >
                <Text style={styles.closeButton}>×</Text>
              </Pressable>
            </View>

            {activeMenu === 'apps' ? (
              <View style={styles.launcherGrid}>
                {[
                  { id: 'wallet', title: 'Pay', icon: '💳' },
                  { id: 'bills', title: 'Bills', icon: '🧾' },
                  { id: 'ride', title: 'Ride', icon: '🚗' },
                  { id: 'eats', title: 'Eats', icon: '🍔' },
                  { id: 'market', title: 'Market', icon: '🛍️' },
                  { id: 'all', title: 'All Apps', icon: '＋' },
                ].map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.launcherItem}
                    onPress={() => openApp(item.id)}
                  >
                    <Text style={styles.launcherEmoji}>{item.icon}</Text>
                    <Text style={styles.launcherLabel}>
                      {item.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : activeMenu === 'notifications' ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>♧</Text>
                <Text style={styles.emptyTitle}>
                  You're all caught up
                </Text>
                <Text style={styles.emptyDescription}>
                  Your notifications will appear here when available.
                </Text>
              </View>
            ) : (
              <View style={styles.accountPanel}>
                <Text style={styles.accountName}>
                  {user?.full_name || 'Your account'}
                </Text>
                <Text style={styles.accountEmail}>
                  {user?.email || 'Manage your theKapita account'}
                </Text>

                <Pressable
                  onPress={handleLogout}
                  style={styles.modalSignOut}
                >
                  <Text style={styles.signOutText}>Sign out</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white || '#FFFFFF',
    paddingTop:"8%"
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 36,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    marginBottom: spacing.xl,
  },

  brand: {
    fontFamily: 'Bricolage Grotesque',
    fontSize: 27,
    fontWeight: '800',
    color: INK,
    letterSpacing: -0.8,
  },

  brandPrefix: {
    fontSize: 15,
    fontWeight: '400',
  },

  brandDot: {
    color: EMERALD_DARK,
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },

  headerIcon: {
    color: INK,
    fontSize: 24,
    fontWeight: '500',
  },

  badge: {
    position: 'absolute',
    right: 1,
    top: 0,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: EMERALD_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },

  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },

  avatar: {
    width: 36,
    height: 36,
    borderRadius: 20,
    backgroundColor: INK,
    borderWidth: 2,
    borderColor: EMERALD_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 3,
  },

  avatarText: {
    color: EMERALD,
    fontSize: 15,
    fontWeight: '800',
  },

  hero: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },

  greeting: {
    ...typography.h2,
    color: INK,
    fontSize: 24,
    lineHeight: 31,
  },

  heroSubtitle: {
    fontSize: 15,
    color: '#475569',
    marginTop: 5,
    marginBottom: 22,
    fontWeight: '500',
  },

  searchBar: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 30,
    paddingLeft: 15,
    paddingRight: 6,
    backgroundColor: '#FFFFFF',
    gap: 7,
  },

  searchIcon: {
    fontSize: 29,
    color: MUTED,
    lineHeight: 32,
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    color: INK,
    fontSize: 12,
    paddingVertical: 10,
  },

  clearSearch: {
    fontSize: 22,
    color: MUTED,
    paddingHorizontal: 3,
  },

  aiButton: {
    backgroundColor: EMERALD,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  aiButtonText: {
    color: INK,
    fontSize: 12,
    fontWeight: '800',
  },

  quickActions: {
    flexDirection: 'row',
    gap: 9,
    paddingTop: 17,
    paddingBottom: 5,
  },

  quickPill: {
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 22,
  },

  quickPillText: {
    color: INK,
    fontSize: 12,
    fontWeight: '600',
  },

  servicesSection: {
    width: '100%',
  },

  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 17,
  },

  sectionHeadingText: {
    flex: 1,
  },

  sectionTitle: {
    ...typography.h2,
    color: INK,
    fontSize: 20,
  },

  sectionSubtitle: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },

  countTag: {
    backgroundColor: '#E4F8EF',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
  },

  countTagText: {
    color: '#007A4D',
    fontSize: 10,
    fontWeight: '800',
  },

  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },

  moduleCard: {
    width: '48.3%',
    minHeight: 144,
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 13,
    justifyContent: 'center',
  },

  moduleCardPressed: {
    backgroundColor: '#FFFFFF',
    borderColor: EMERALD_DARK,
    opacity: 0.85,
  },

  moduleIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  moduleEmoji: {
    fontSize: 23,
  },

  moduleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: INK,
    marginBottom: 4,
  },

  moduleDescription: {
    fontSize: 10,
    lineHeight: 15,
    color: '#525252',
  },

  allAppsIcon: {
    backgroundColor: INK,
  },

  allAppsText: {
    color: EMERALD,
    fontWeight: '800',
    fontSize: 21,
  },

  signOutButton: {
    alignSelf: 'center',
    padding: 14,
    marginTop: 24,
  },

  signOutText: {
    color: EMERALD_DARK,
    fontSize: 13,
    fontWeight: '700',
  },

  pressed: {
    opacity: 0.7,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18,18,18,0.38)',
    justifyContent: 'center',
    padding: 22,
  },

  modalPanel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: INK,
  },

  closeButton: {
    fontSize: 28,
    color: MUTED,
    paddingHorizontal: 4,
  },

  launcherGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
  },

  launcherItem: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: SOFT,
  },

  launcherEmoji: {
    fontSize: 27,
    marginBottom: 7,
  },

  launcherLabel: {
    color: INK,
    fontSize: 11,
    fontWeight: '700',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },

  emptyIcon: {
    fontSize: 32,
    color: EMERALD_DARK,
    marginBottom: 12,
  },

  emptyTitle: {
    color: INK,
    fontSize: 15,
    fontWeight: '800',
  },

  emptyDescription: {
    textAlign: 'center',
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },

  accountPanel: {
    paddingVertical: 8,
  },

  accountName: {
    color: INK,
    fontSize: 16,
    fontWeight: '800',
  },

  accountEmail: {
    color: MUTED,
    fontSize: 12,
    marginTop: 5,
  },

  modalSignOut: {
    marginTop: 20,
    backgroundColor: '#E4F8EF',
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 12,
  },
});

// import { useEffect, useState, useCallback } from 'react';
// import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Modal, Alert } from 'react-native';
// import { refreshBalance, getBalanceDisplay, fundWallet, sendMoney } from '../../state/ledger.js';
// import { ApiError } from '../../api/client.js';
// import { colors, spacing, radii, typography } from '../../theme/tokens.js';

// export default function WalletScreen() {
//   const [balanceDisplay, setBalanceDisplay] = useState('—');
//   const [loading, setLoading] = useState(true);
//   const [modal, setModal] = useState(null); // 'fund' | 'send' | null

//   const loadBalance = useCallback(async () => {
//     setLoading(true);
//     try {
//       await refreshBalance();
//       setBalanceDisplay(getBalanceDisplay());
//     } catch (err) {
//       setBalanceDisplay('Unavailable');
//       console.error('Could not load wallet balance:', err);
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     loadBalance();
//   }, [loadBalance]);

//   return (
//     <View style={styles.container}>
//       <View style={styles.balanceCard}>
//         <Text style={styles.balanceLabel}>Available balance</Text>
//         {loading ? (
//           <ActivityIndicator color={colors.white} style={{ marginTop: spacing.sm }} />
//         ) : (
//           <Text style={styles.balanceValue}>{balanceDisplay}</Text>
//         )}
//       </View>

//       <View style={styles.actionsRow}>
//         <Pressable style={styles.actionButton} onPress={() => setModal('fund')}>
//           <Text style={styles.actionButtonText}>+ Add Money</Text>
//         </Pressable>
//         <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={() => setModal('send')}>
//           <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>Send</Text>
//         </Pressable>
//       </View>

//       <FundModal visible={modal === 'fund'} onClose={() => setModal(null)} onDone={loadBalance} />
//       <SendModal visible={modal === 'send'} onClose={() => setModal(null)} onDone={loadBalance} />
//     </View>
//   );
// }

// function FundModal({ visible, onClose, onDone }) {
//   const [amount, setAmount] = useState('');
//   const [busy, setBusy] = useState(false);

//   async function handleConfirm() {
//     const parsed = parseFloat(amount);
//     if (!parsed || parsed <= 0) {
//       Alert.alert('Enter an amount greater than zero.');
//       return;
//     }
//     setBusy(true);
//     try {
//       // channel hardcoded to bank_transfer here — a real picker (bank
//       // transfer vs card) is the same UI decision apps/web's wallet.js
//       // modal makes with its <select id="fundChannel">.
//       await fundWallet(parsed, 'bank_transfer');
//       Alert.alert('Funding initiated', 'You will get a push notification once it clears.');
//       setAmount('');
//       onClose();
//       onDone();
//     } catch (err) {
//       Alert.alert('Could not fund wallet', err instanceof ApiError ? err.message : 'Try again.');
//     } finally {
//       setBusy(false);
//     }
//   }

//   return (
//     <ModalShell visible={visible} title="Add Money" onClose={onClose}>
//       <Text style={styles.label}>Amount (₦)</Text>
//       <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" />
//       <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleConfirm} disabled={busy}>
//         {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Continue to Pay</Text>}
//       </Pressable>
//     </ModalShell>
//   );
// }

// function SendModal({ visible, onClose, onDone }) {
//   const [recipient, setRecipient] = useState('');
//   const [amount, setAmount] = useState('');
//   const [busy, setBusy] = useState(false);

//   async function handleConfirm() {
//     const parsed = parseFloat(amount);
//     if (!recipient.trim()) {
//       Alert.alert('Enter a recipient ID, email or bank account.');
//       return;
//     }
//     if (!parsed || parsed <= 0) {
//       Alert.alert('Enter an amount greater than zero.');
//       return;
//     }
//     setBusy(true);
//     try {
//       await sendMoney(recipient.trim(), parsed);
//       Alert.alert('Transfer complete!');
//       setRecipient('');
//       setAmount('');
//       onClose();
//       onDone();
//     } catch (err) {
//       Alert.alert('Could not send money', err instanceof ApiError ? err.message : 'Try again.');
//     } finally {
//       setBusy(false);
//     }
//   }

//   return (
//     <ModalShell visible={visible} title="Send Money" onClose={onClose}>
//       <Text style={styles.label}>Recipient ID, email or bank account</Text>
//       <TextInput style={styles.input} value={recipient} onChangeText={setRecipient} placeholder="e.g. @sarah or KPT-881029" />
//       <Text style={styles.label}>Amount (₦)</Text>
//       <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" />
//       <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleConfirm} disabled={busy}>
//         {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Confirm & Send</Text>}
//       </Pressable>
//     </ModalShell>
//   );
// }

// function ModalShell({ visible, title, onClose, children }) {
//   return (
//     <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
//       <View style={styles.modalBackdrop}>
//         <View style={styles.modalSheet}>
//           <View style={styles.modalHeader}>
//             <Text style={styles.modalTitle}>{title}</Text>
//             <Pressable onPress={onClose}>
//               <Text style={styles.modalClose}>✕</Text>
//             </Pressable>
//           </View>
//           {children}
//         </View>
//       </View>
//     </Modal>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg },
//   balanceCard: {
//     backgroundColor: colors.ink,
//     borderRadius: radii.lg,
//     padding: spacing.xl,
//     marginBottom: spacing.lg,
//   },
//   balanceLabel: { color: '#a0aec0', fontSize: 13 },
//   balanceValue: { ...typography.h1, color: colors.white, marginTop: spacing.xs },
//   actionsRow: { flexDirection: 'row', gap: spacing.md },
//   actionButton: {
//     flex: 1,
//     backgroundColor: colors.emerald,
//     borderRadius: radii.md,
//     paddingVertical: spacing.md,
//     alignItems: 'center',
//   },
//   actionButtonSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
//   actionButtonText: { color: colors.white, fontWeight: '700' },
//   actionButtonTextSecondary: { color: colors.ink },
//   label: { ...typography.label, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
//   input: {
//     borderWidth: 1,
//     borderColor: colors.border,
//     borderRadius: radii.md,
//     paddingHorizontal: spacing.md,
//     paddingVertical: spacing.sm + 2,
//     fontSize: 15,
//   },
//   button: {
//     backgroundColor: colors.emerald,
//     borderRadius: radii.md,
//     paddingVertical: spacing.md,
//     alignItems: 'center',
//     marginTop: spacing.lg,
//   },
//   buttonDisabled: { opacity: 0.6 },
//   buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
//   modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
//   modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.xl },
//   modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
//   modalTitle: { ...typography.h2, color: colors.ink },
//   modalClose: { fontSize: 18, color: colors.muted },
// });


import React, { useMemo, useState } from 'react';
import {

  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  Switch,
  StatusBar,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';


const C = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  ink: '#151922',
  muted: '#788292',
  line: '#E8ECF1',
  dark: '#121212',
  green: '#00B879',
  greenSoft: '#E8F8F1',
  red: '#E05252',
  redSoft: '#FCEEEE',
  blue: '#4778E8',
  purple: '#8A63D2',
};

const TABS = [
  ['overview', 'Overview'],
  ['cards', 'Kapita Cards'],
  ['bills', 'Bills & Utility'],
  ['recipients', 'Recipients'],
  ['insights', 'Analytics'],
  ['security', 'Security & Limits'],
];

const transactions = [
  { id: 'TX-990812', title: 'theKapita Eats: Bukka Hut Lunch', subtitle: 'Today, 1:42 PM · Food Payment', amount: -8500, icon: '', status: 'Successful' },
  { id: 'TX-990811', title: 'Salary Deposit: Tech Firm Ltd', subtitle: 'Today, 9:15 AM · Bank Transfer', amount: 850000, icon: '', status: 'Successful' },
  { id: 'TX-990810', title: 'Transfer to: John Okafor (@john)', subtitle: 'Yesterday · Peer Transfer', amount: -20000, icon: '↗', status: 'Successful' },
];

const utilities = [
  ['', 'Airtime & Data', 'MTN, Airtel, Glo, 9mobile'],
  ['', 'Electricity', 'IKEDC, EKEDC, AEDC & others'],
  ['', 'Cable TV', 'DStv, GOtv, StarTimes'],
  ['', 'Internet', 'Spectranet, Smile, Fibre'],
  ['', 'Education & Exams', 'WAEC, JAMB, Tuition Fees'],
  ['', 'Health & HMO', 'Ecosystem Health Plans'],
];

const money = (value) =>
  `₦${Math.abs(Number(value) || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function SectionCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function SectionTitle({ title, action, onAction }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActionButton({ icon, label, onPress, primary }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.actionIcon, primary && styles.actionIconPrimary]}>
        <Text style={[styles.actionIconText, primary && styles.actionIconTextPrimary]}>{icon}</Text>
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function TransactionRow({ item, onPress }) {
  const incoming = item.amount > 0;
  return (
    <Pressable style={styles.transactionRow} onPress={onPress}>
      <View style={styles.transactionIcon}>
        <Text style={styles.transactionEmoji}>{item.icon}</Text>
      </View>
      <View style={styles.transactionMain}>
        <Text style={styles.transactionTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.mutedSmall}>{item.subtitle}</Text>
      </View>
      <View style={styles.transactionRight}>
        <Text style={[styles.transactionAmount, { color: incoming ? C.green : C.ink }]}>
          {incoming ? '+' : '-'}{money(item.amount)}
        </Text>
        <Text style={styles.successText}>{item.status}</Text>
      </View>
    </Pressable>
  );
}

export default function WalletScreen() {
  const [activeTab, setActiveTab] = useState('overview');
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [transactionFilter, setTransactionFilter] = useState('all');
  const [modalType, setModalType] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formRecipient, setFormRecipient] = useState('');

  // Replace these presentation placeholders with values from the wallet API.
  const walletBalance = 0;
  const accountNumber = 'Unavailable';
  const filteredTransactions = useMemo(() => {
    if (transactionFilter === 'in') return transactions.filter((item) => item.amount > 0);
    if (transactionFilter === 'out') return transactions.filter((item) => item.amount < 0);
    return transactions;
  }, [transactionFilter]);

  const openAction = (type) => {
    setSelectedTransaction(null);
    setFormAmount('');
    setFormRecipient('');
    setModalType(type);
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedTransaction(null);
  };

  const modalTitle = selectedTransaction
    ? 'Transaction details'
    : ({
        add: 'Add money',
        send: 'Send money',
        receive: 'Receive money',
        withdraw: 'Withdraw money',
        scan: 'Scan & Pay',
        beneficiary: 'Add recipient',
        bill: 'Pay a bill',
        pin: 'Change security PIN',
      }[modalType] || 'Wallet action');

  const renderOverview = () => (
    <>
      <View style={styles.twoColumn}>
         {/* <SafeAreaView style={styles.twoColumn} edges={[]}> */}
      
        <View style={styles.column}>
          <SectionCard>
            <View style={styles.cardHeadingRow}>
              <Text style={styles.cardIcon}></Text>
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>Virtual Funding Account</Text>
                <Text style={styles.muted}>Transfer to top up your Kapita wallet instantly</Text>
              </View>
            </View>
            <View style={styles.accountDetails}>
              <View style={styles.accountDetail}>
                <Text style={styles.fieldLabel}>Bank Name</Text>
                <Text style={styles.fieldValue}>Not connected</Text>
              </View>
              <View style={styles.accountDetail}>
                <Text style={styles.fieldLabel}>Account Number</Text>
                <Text style={styles.fieldValue}>{accountNumber}</Text>
              </View>
            </View>
          </SectionCard>

          <SectionCard>
            <SectionTitle title="Recent Transactions" action="See all" onAction={() => setActiveTab('insights')} />
            <View style={styles.filterRow}>
              {['all', 'in', 'out'].map((filter) => (
                <Pressable
                  key={filter}
                  onPress={() => setTransactionFilter(filter)}
                  style={[styles.filterPill, transactionFilter === filter && styles.filterPillActive]}
                >
                  <Text style={[styles.filterText, transactionFilter === filter && styles.filterTextActive]}>
                    {filter === 'all' ? 'All' : filter === 'in' ? 'Money in' : 'Money out'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {filteredTransactions.map((item) => (
              <TransactionRow
                key={item.id}
                item={item}
                onPress={() => setSelectedTransaction(item)}
              />
            ))}
            {filteredTransactions.length === 0 && <Text style={styles.muted}>No transactions in this category.</Text>}
          </SectionCard>

          <SectionCard>
            <SectionTitle title="Payment Methods" action="Wallet" />
            <View style={styles.paymentMethod}>
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>▣</Text></View>
              <View style={styles.flex}>
                <Text style={styles.fieldValue}>theKapita Pay Wallet</Text>
                <Text style={styles.mutedSmall}>Available balance · {money(walletBalance)}</Text>
              </View>
              <Text style={styles.defaultBadge}>Default</Text>
            </View>
          </SectionCard>
        </View>

        <View style={styles.column}>
          <SectionCard>
            <SectionTitle title="Monthly Analytics" action="This month" />
            <View style={styles.barTrack}>
              <View style={[styles.barIn, { width: '50%' }]} />
              <View style={[styles.barOut, { width: '50%' }]} />
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: C.green }]} /><Text style={styles.mutedSmall}>Money in</Text></View>
              <Text style={styles.fieldValue}>Loading</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: C.blue }]} /><Text style={styles.mutedSmall}>Money out</Text></View>
              <Text style={styles.fieldValue}>Loading</Text>
            </View>
          </SectionCard>

          <SectionCard>
            <SectionTitle title="Quick Utilities" action="View all" onAction={() => setActiveTab('bills')} />
            <View style={styles.utilityGrid}>
              {utilities.slice(0, 4).map(([icon, title, subtitle]) => (
                <Pressable key={title} style={styles.utilityTile} onPress={() => openAction('bill')}>
                  <Text style={styles.utilityIcon}>{icon}</Text>
                  <Text style={styles.utilityTitle}>{title}</Text>
                  <Text style={styles.mutedTiny}>{subtitle}</Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>

          <SectionCard>
            <SectionTitle title="theKapita Rewards" />
            <View style={styles.rewardRow}>
              <Text style={styles.rewardIcon}>✦</Text>
              <Text style={styles.defaultBadge}>Not connected</Text>
            </View>
            <Text style={styles.muted}>Rewards are unavailable until the rewards service is connected.</Text>
          </SectionCard>
        </View>
       </View>
      {/* </SafeAreaView> */}
    </>
  );

  const renderBills = () => (
    <SectionCard>
      <Text style={styles.sectionTitle}>All Utility & Bill Payments</Text>
      <Text style={[styles.muted, { marginTop: 6, marginBottom: 16 }]}>
        Pay directly from your available balance. Fees and availability are confirmed by the bill-payment service.
      </Text>
      {utilities.map(([icon, title, subtitle]) => (
        <Pressable key={title} style={styles.listTile} onPress={() => openAction('bill')}>
          <View style={styles.utilityListIcon}><Text style={styles.utilityIcon}>{icon}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.fieldValue}>{title}</Text>
            <Text style={styles.mutedSmall}>{subtitle}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </SectionCard>
  );

  const renderCards = () => (
    <SectionCard style={styles.centerCard}>
      <Text style={styles.virtualCard}>theKapita</Text>
      <Text style={styles.sectionTitle}>theKapita Black Virtual Card</Text>
      <Text style={[styles.muted, styles.centerText]}>
        Virtual cards are unavailable until a card issuer is connected to this wallet.
      </Text>
    </SectionCard>
  );

  const renderRecipients = () => (
    <SectionCard>
      <SectionTitle title="Saved Recipients & Directory" action="+ Add recipient" onAction={() => openAction('beneficiary')} />
      <Text style={[styles.muted, { marginBottom: 14 }]}>Save people to make future Kapita transfers faster.</Text>
      <TextInput
        value={recipientSearch}
        onChangeText={setRecipientSearch}
        placeholder="Search by name, @username, or account number..."
        placeholderTextColor={C.muted}
        style={styles.searchInput}
      />
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>👥</Text>
        <Text style={styles.fieldValue}>Your saved recipients will appear here</Text>
        <Text style={styles.mutedSmall}>Connect the recipients endpoint to load your directory.</Text>
        <Pressable style={styles.primaryButton} onPress={() => openAction('beneficiary')}>
          <Text style={styles.primaryButtonText}>Add new recipient</Text>
        </Pressable>
      </View>
    </SectionCard>
  );

  const renderInsights = () => (
    <SectionCard>
      <SectionTitle title="Ecosystem Cashflow Analytics" action="Last six months" />
      <Text style={styles.muted}>Visualizing month-over-month cashflow across theKapita network.</Text>
      <View style={styles.kpiGrid}>
        {[
          ['Total Inflow', 'Loading', 'Current calendar month'],
          ['Total Outflow', 'Loading', 'Current calendar month'],
          ['Net Flow', 'Loading', 'Inflow minus outflow'],
        ].map(([label, value, caption]) => (
          <View key={label} style={styles.kpiCard}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text style={styles.kpiValue}>{value}</Text>
            <Text style={styles.mutedTiny}>{caption}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 12 }]}>6-Month Cashflow Overview</Text>
      <View style={styles.chart}>
        {[60, 75, 65, 85, 80, 95].map((height, index) => (
          <View key={index} style={styles.chartColumn}>
            <View style={styles.chartBars}>
              <View style={[styles.chartBar, { height: `${height}%`, backgroundColor: C.green }]} />
              <View style={[styles.chartBar, { height: `${height * 0.52}%`, backgroundColor: C.blue }]} />
            </View>
            <Text style={styles.mutedTiny}>{['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'][index]}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Top Ecosystem Channels</Text>
      {[
        ['', 'theKapita Eats', '28% of monthly spend', '₦52,000.00'],
        ['', 'Bills & Utility', '24% of monthly spend', '₦45,000.00'],
        ['', 'theKapita Ride', '21% of monthly spend', '₦38,500.00'],
        ['', 'Marketplace', '17% of monthly spend', '₦31,900.00'],
      ].map(([icon, title, subtitle, amount]) => (
        <View key={title} style={styles.channelRow}>
          <Text style={styles.utilityIcon}>{icon}</Text>
          <View style={styles.flex}>
            <Text style={styles.fieldValue}>{title}</Text>
            <Text style={styles.mutedSmall}>{subtitle}</Text>
          </View>
          <Text style={styles.fieldValue}>{amount}</Text>
        </View>
      ))}
      <Text style={[styles.mutedSmall, { marginTop: 16 }]}>Totals should be calculated from posted wallet ledger entries.</Text>
    </SectionCard>
  );

  const renderSecurity = () => (
    <SectionCard>
      <SectionTitle title="Security Controls & Limits" action="Protected ✓" />
      <Text style={[styles.muted, { marginBottom: 18 }]}>
        Manage your payment PIN, authorization options, and daily transaction thresholds.
      </Text>
      <Text style={styles.sectionTitle}>Transaction Limits</Text>
      <View style={styles.settingRow}>
        <View style={styles.flex}><Text style={styles.fieldValue}>Daily Transfer Limit</Text><Text style={styles.mutedSmall}>Maximum outbound transfers per 24h</Text></View>
        <Text style={styles.fieldValue}>Loading</Text>
      </View>
      <View style={styles.settingRow}>
        <View style={styles.flex}><Text style={styles.fieldValue}>Monthly Transfer Limit</Text><Text style={styles.mutedSmall}>Cumulative transfer ceiling for current month</Text></View>
        <Text style={styles.fieldValue}>Loading</Text>
      </View>
      <Text style={[styles.mutedSmall, { marginTop: 8, marginBottom: 22 }]}>Transfer limits are configured by the wallet service.</Text>
      <Text style={styles.sectionTitle}>Authentication & Protection</Text>
      <View style={styles.settingRow}>
        <View style={styles.flex}><Text style={styles.fieldValue}>Biometric Payment Auth</Text><Text style={styles.mutedSmall}>Require Face ID or fingerprint for transfers</Text></View>
        <Switch value={biometricEnabled} onValueChange={setBiometricEnabled} trackColor={{ true: C.green }} />
      </View>
      <View style={styles.settingRow}>
        <View style={styles.flex}><Text style={styles.fieldValue}>Security Transaction PIN</Text><Text style={styles.mutedSmall}>4-digit PIN prompt for transfers over ₦10,000</Text></View>
        <Pressable onPress={() => openAction('pin')}><Text style={styles.actionText}>Change PIN</Text></Pressable>
      </View>
      <View style={styles.settingRow}>
        <View style={styles.flex}><Text style={styles.fieldValue}>Two-Factor Login (2FA)</Text><Text style={styles.mutedSmall}>Send OTP on untrusted device logins</Text></View>
        <Switch value={twoFactorEnabled} onValueChange={setTwoFactorEnabled} trackColor={{ true: C.green }} />
      </View>
    </SectionCard>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'cards': return renderCards();
      case 'bills': return renderBills();
      case 'recipients': return renderRecipients();
      case 'insights': return renderInsights();
      case 'security': return renderSecurity();
      default: return renderOverview();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}  edges={[]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => {}}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.topBarRight}>
            <Text style={styles.protected}>● Protected</Text>
            <Text style={styles.idText}>ID: —</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}><Text style={styles.brandIconText}>▣</Text></View>
              <Text style={styles.heroTitle}>theKapita Pay</Text>
            </View>
            <View style={styles.verifiedPill}><View style={styles.pulseDot} /><Text style={styles.verifiedText}>Tier 3 Verified</Text></View>
          </View>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.currency}>₦</Text>
            <Text style={styles.balanceAmount}>{balanceVisible ? Number(walletBalance).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '••••••'}</Text>
            <Pressable onPress={() => setBalanceVisible((value) => !value)} style={styles.eyeButton}>
              <Text style={styles.eyeText}>{balanceVisible ? '◉' : '◎'}</Text>
            </Pressable>
          </View>
          <View style={styles.quickActions}>
            <ActionButton icon="＋" label="Add Money" primary onPress={() => openAction('add')} />
            <ActionButton icon="↗" label="Send" onPress={() => openAction('send')} />
            <ActionButton icon="↙" label="Receive" onPress={() => openAction('receive')} />
            <ActionButton icon="▤" label="Withdraw" onPress={() => openAction('withdraw')} />
            <ActionButton icon="▧" label="Pay Bills" onPress={() => setActiveTab('bills')} />
            <ActionButton icon="▦" label="Scan & Pay" onPress={() => openAction('scan')} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroller} contentContainerStyle={styles.tabsContent}>
          {TABS.map(([key, label]) => (
            <Pressable key={key} onPress={() => setActiveTab(key)} style={[styles.tab, activeTab === key && styles.tabActive]}>
              <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {renderActiveTab()}
        <Text style={styles.footer}>theKapita Pay · Secure wallet experience</Text>
      </ScrollView>

      <Modal visible={!!modalType || !!selectedTransaction} transparent animationType="slide" onRequestClose={closeModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedTransaction ? 'Transaction details' : modalTitle}</Text>
              <Pressable onPress={closeModal}><Text style={styles.closeText}>✕</Text></Pressable>
            </View>
            {selectedTransaction ? (
              <>
                <Text style={styles.detailAmount}>{selectedTransaction.amount < 0 ? '-' : '+'}{money(selectedTransaction.amount)}</Text>
                <Text style={styles.successText}>Payment {selectedTransaction.status}</Text>
                <View style={styles.modalDetails}>
                  <Detail label="Description" value={selectedTransaction.title} />
                  <Detail label="Date & Time" value={selectedTransaction.subtitle} />
                  <Detail label="Reference ID" value={selectedTransaction.id} />
                  <Detail label="Payment Method" value="theKapita Pay Wallet" />
                </View>
                <Pressable style={styles.secondaryButton} onPress={() => {}}><Text style={styles.secondaryButtonText}>Download receipt</Text></Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => {}}><Text style={styles.secondaryButtonText}>Share receipt</Text></Pressable>
              </>
            ) : modalType === 'receive' ? (
              <>
                <Text style={styles.muted}>Your receiving account details will appear here once a virtual account is connected.</Text>
                <View style={styles.receiveBox}><Text style={styles.fieldLabel}>Account number</Text><Text style={styles.fieldValue}>{accountNumber}</Text></View>
              </>
            ) : modalType === 'scan' ? (
              <View style={styles.emptyState}><Text style={styles.emptyIcon}>▦</Text><Text style={styles.fieldValue}>QR scanner</Text><Text style={styles.mutedSmall}>Connect a native camera and QR-scanning flow to enable Scan & Pay.</Text></View>
            ) : (
              <>
                {modalType === 'bill' && <Text style={styles.fieldLabel}>Bill category</Text>}
                {modalType === 'bill' && <TextInput placeholder="e.g. Airtime & Data" placeholderTextColor={C.muted} style={styles.modalInput} />}
                {(modalType === 'send' || modalType === 'withdraw' || modalType === 'beneficiary') && (
                  <>
                    <Text style={styles.fieldLabel}>{modalType === 'beneficiary' ? 'Recipient name or username' : modalType === 'send' ? 'Recipient' : 'Bank account'}</Text>
                    <TextInput value={formRecipient} onChangeText={setFormRecipient} placeholder="Enter details" placeholderTextColor={C.muted} style={styles.modalInput} />
                  </>
                )}
                {modalType !== 'beneficiary' && (
                  <>
                    <Text style={styles.fieldLabel}>Amount (NGN)</Text>
                    <TextInput value={formAmount} onChangeText={setFormAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.muted} style={styles.modalInput} />
                  </>
                )}
                {modalType === 'pin' && <TextInput secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="Enter new 4-digit PIN" placeholderTextColor={C.muted} style={styles.modalInput} />}
                <Pressable style={styles.primaryButton} onPress={() => {}}>
                  <Text style={styles.primaryButtonText}>{modalType === 'beneficiary' ? 'Save recipient' : modalType === 'pin' ? 'Update PIN' : 'Continue'}</Text>
                </Pressable>
                <Text style={styles.modalNote}>This is the UI flow. Connect the relevant wallet API before enabling real transactions.</Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Detail({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.mutedSmall}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  screen: { padding: 16, paddingBottom: 36, gap: 16,  },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, lineHeight: 32, color: C.ink, marginTop: -4 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  protected: { color: C.green, fontSize: 12, fontWeight: '700' },
  idText: { color: C.muted, fontSize: 12 },
  hero: { backgroundColor: C.dark, borderRadius: 24, padding: 20, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#292929', alignItems: 'center', justifyContent: 'center' },
  brandIconText: { color: '#FFFFFF', fontSize: 19 },
  heroTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#26352F', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  pulseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  verifiedText: { color: '#C9F3E1', fontSize: 10, fontWeight: '700' },
  balanceLabel: { color: '#AEB6C1', fontSize: 12, marginTop: 26 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 22 },
  currency: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginRight: 4 },
  balanceAmount: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  eyeButton: { marginLeft: 12, padding: 6 },
  eyeText: { color: '#D8DEE7', fontSize: 19 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  quickAction: { width: '31%', alignItems: 'center', gap: 7, paddingVertical: 4 },
  actionIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#F0F3F6', alignItems: 'center', justifyContent: 'center' },
  actionIconPrimary: { backgroundColor: C.green },
  actionIconText: { color: C.ink, fontSize: 21, fontWeight: '700' },
  actionIconTextPrimary: { color: '#FFFFFF' },
  quickActionLabel: { color: '#E7E9ED', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  tabsScroller: { flexGrow: 0, marginHorizontal: -16 },
  tabsContent: { paddingHorizontal: 16, gap: 7 },
  tab: { paddingHorizontal: 14, paddingVertical: 11, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line },
  tabActive: { backgroundColor: C.dark, borderColor: C.dark },
  tabText: { color: C.muted, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  twoColumn: { gap: 14 },
  column: { gap: 14 },
  card: { backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line },
  cardHeadingRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cardIcon: { fontSize: 24 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 },
  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  actionText: { color: C.green, fontSize: 12, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 12, lineHeight: 18 },
  mutedSmall: { color: C.muted, fontSize: 10, lineHeight: 15 },
  mutedTiny: { color: C.muted, fontSize: 9, lineHeight: 13 },
  accountDetails: { flexDirection: 'row', gap: 12, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line },
  accountDetail: { flex: 1, gap: 6 },
  fieldLabel: { color: C.muted, fontSize: 10, fontWeight: '600' },
  fieldValue: { color: C.ink, fontSize: 12, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  filterPill: { backgroundColor: C.background, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  filterPillActive: { backgroundColor: C.dark },
  filterText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  filterTextActive: { color: '#FFFFFF' },
  transactionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.line },
  transactionIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
  transactionEmoji: { fontSize: 17 },
  transactionMain: { flex: 1, gap: 4 },
  transactionTitle: { color: C.ink, fontSize: 11, fontWeight: '700' },
  transactionRight: { alignItems: 'flex-end', gap: 4 },
  transactionAmount: { fontSize: 11, fontWeight: '800' },
  successText: { color: C.green, fontSize: 9, fontWeight: '700' },
  paymentMethod: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  defaultBadge: { color: C.green, backgroundColor: C.greenSoft, overflow: 'hidden', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, fontWeight: '700' },
  barTrack: { height: 9, borderRadius: 8, overflow: 'hidden', flexDirection: 'row', marginBottom: 16, backgroundColor: C.line },
  barIn: { backgroundColor: C.green },
  barOut: { backgroundColor: C.blue },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  utilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  utilityTile: { width: '48%', minHeight: 105, padding: 11, borderRadius: 13, backgroundColor: C.background, gap: 5 },
  utilityIcon: { fontSize: 21 },
  utilityTitle: { color: C.ink, fontSize: 11, fontWeight: '800' },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rewardIcon: { color: '#C18A2D', fontSize: 23 },
  listTile: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.line },
  utilityListIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
  chevron: { color: C.muted, fontSize: 25 },
  centerCard: { alignItems: 'center', paddingVertical: 34 },
  centerText: { textAlign: 'center', marginTop: 10, maxWidth: 260 },
  virtualCard: { backgroundColor: C.dark, color: '#FFFFFF', width: '100%', padding: 28, borderRadius: 17, fontSize: 22, fontWeight: '800', marginBottom: 24, overflow: 'hidden' },
  searchInput: { backgroundColor: C.background, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: C.ink, fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 28, gap: 9 },
  emptyIcon: { fontSize: 32, marginBottom: 4 },
  primaryButton: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center', marginTop: 10 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  kpiCard: { flex: 1, minWidth: '30%', backgroundColor: C.background, borderRadius: 12, padding: 11, gap: 7 },
  kpiValue: { color: C.ink, fontSize: 16, fontWeight: '800' },
  chart: { height: 150, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', backgroundColor: C.background, borderRadius: 12, padding: 12, paddingBottom: 8 },
  chartColumn: { alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end', gap: 7 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: '85%' },
  chartBar: { width: 9, minHeight: 5, borderRadius: 4 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: C.line },
  footer: { color: C.muted, textAlign: 'center', fontSize: 10, marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '88%' },
  modalHandle: { width: 42, height: 4, borderRadius: 3, backgroundColor: '#D8DDE4', alignSelf: 'center', marginBottom: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { color: C.ink, fontSize: 18, fontWeight: '800' },
  closeText: { color: C.muted, fontSize: 19, padding: 4 },
  modalInput: { borderWidth: 1, borderColor: C.line, backgroundColor: C.background, color: C.ink, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, marginTop: 7, marginBottom: 15, fontSize: 13 },
  modalNote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 12, textAlign: 'center' },
  detailAmount: { color: C.ink, fontSize: 29, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  modalDetails: { marginVertical: 20, borderTopWidth: 1, borderTopColor: C.line },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.line },
  secondaryButton: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 8 },
  secondaryButtonText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  receiveBox: { backgroundColor: C.background, borderRadius: 12, padding: 16, marginTop: 16, gap: 7 },
  pressed: { opacity: 0.75 },
});

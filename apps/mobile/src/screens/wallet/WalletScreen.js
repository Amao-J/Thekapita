import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Modal, Alert } from 'react-native';
import { refreshBalance, getBalanceDisplay, fundWallet, sendMoney } from '../../state/ledger.js';
import { ApiError } from '../../api/client.js';
import { colors, spacing, radii, typography } from '../../theme/tokens.js';

export default function WalletScreen() {
  const [balanceDisplay, setBalanceDisplay] = useState('—');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'fund' | 'send' | null

  const loadBalance = useCallback(async () => {
    setLoading(true);
    try {
      await refreshBalance();
      setBalanceDisplay(getBalanceDisplay());
    } catch (err) {
      setBalanceDisplay('Unavailable');
      console.error('Could not load wallet balance:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available balance</Text>
        {loading ? (
          <ActivityIndicator color={colors.white} style={{ marginTop: spacing.sm }} />
        ) : (
          <Text style={styles.balanceValue}>{balanceDisplay}</Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setModal('fund')}>
          <Text style={styles.actionButtonText}>+ Add Money</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={() => setModal('send')}>
          <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>Send</Text>
        </Pressable>
      </View>

      <FundModal visible={modal === 'fund'} onClose={() => setModal(null)} onDone={loadBalance} />
      <SendModal visible={modal === 'send'} onClose={() => setModal(null)} onDone={loadBalance} />
    </View>
  );
}

function FundModal({ visible, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      Alert.alert('Enter an amount greater than zero.');
      return;
    }
    setBusy(true);
    try {
      // channel hardcoded to bank_transfer here — a real picker (bank
      // transfer vs card) is the same UI decision apps/web's wallet.js
      // modal makes with its <select id="fundChannel">.
      await fundWallet(parsed, 'bank_transfer');
      Alert.alert('Funding initiated', 'You will get a push notification once it clears.');
      setAmount('');
      onClose();
      onDone();
    } catch (err) {
      Alert.alert('Could not fund wallet', err instanceof ApiError ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell visible={visible} title="Add Money" onClose={onClose}>
      <Text style={styles.label}>Amount (₦)</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" />
      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleConfirm} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Continue to Pay</Text>}
      </Pressable>
    </ModalShell>
  );
}

function SendModal({ visible, onClose, onDone }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    const parsed = parseFloat(amount);
    if (!recipient.trim()) {
      Alert.alert('Enter a recipient ID, email or bank account.');
      return;
    }
    if (!parsed || parsed <= 0) {
      Alert.alert('Enter an amount greater than zero.');
      return;
    }
    setBusy(true);
    try {
      await sendMoney(recipient.trim(), parsed);
      Alert.alert('Transfer complete!');
      setRecipient('');
      setAmount('');
      onClose();
      onDone();
    } catch (err) {
      Alert.alert('Could not send money', err instanceof ApiError ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell visible={visible} title="Send Money" onClose={onClose}>
      <Text style={styles.label}>Recipient ID, email or bank account</Text>
      <TextInput style={styles.input} value={recipient} onChangeText={setRecipient} placeholder="e.g. @sarah or KPT-881029" />
      <Text style={styles.label}>Amount (₦)</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" />
      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleConfirm} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Confirm & Send</Text>}
      </Pressable>
    </ModalShell>
  );
}

function ModalShell({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg },
  balanceCard: {
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  balanceLabel: { color: '#a0aec0', fontSize: 13 },
  balanceValue: { ...typography.h1, color: colors.white, marginTop: spacing.xs },
  actionsRow: { flexDirection: 'row', gap: spacing.md },
  actionButton: {
    flex: 1,
    backgroundColor: colors.emerald,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionButtonSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  actionButtonText: { color: colors.white, fontWeight: '700' },
  actionButtonTextSecondary: { color: colors.ink },
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
    marginTop: spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.xl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.h2, color: colors.ink },
  modalClose: { fontSize: 18, color: colors.muted },
});

/**
 * SINGLE OWNER of the wallet balance on mobile — same public API as
 * apps/web/src/state/ledger.js (refreshBalance, getBalanceDisplay,
 * fundWallet, sendMoney, subscribe), so a screen written against this file
 * reads exactly like a page written against the web one.
 */
import { authorizedRequest } from './session.js';
import { newIdempotencyKey } from '../api/client.js';
import { ENDPOINTS } from '@thekapita/shared/endpoints';
import { formatCurrency } from '@thekapita/shared/currency';

let balanceState = { balance: null, currency: 'NGN', dailyLimit: null, monthlyLimit: null };
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(balanceState));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getBalance() {
  return balanceState;
}
export function getBalanceDisplay() {
  return balanceState.balance == null ? '—' : formatCurrency(balanceState.balance, balanceState.currency);
}

export async function refreshBalance() {
  const data = await authorizedRequest(ENDPOINTS.wallet.balance);
  balanceState = {
    balance: data.balance,
    currency: data.currency,
    dailyLimit: data.daily_limit,
    monthlyLimit: data.monthly_limit,
  };
  notify();
  return balanceState;
}

export async function fundWallet(amount, channel) {
  const result = await authorizedRequest(ENDPOINTS.wallet.fund, {
    method: 'POST',
    body: { amount, channel },
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
  await refreshBalance();
  return result;
}

export async function sendMoney(recipientKapitaId, amount) {
  const result = await authorizedRequest(ENDPOINTS.wallet.send, {
    method: 'POST',
    body: { recipient_kapita_id: recipientKapitaId, amount },
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
  await refreshBalance();
  return result;
}

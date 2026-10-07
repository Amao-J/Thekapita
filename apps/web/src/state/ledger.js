/**
 * SINGLE OWNER of the wallet balance and wallet actions. Replaces
 * js/constants.js's KAPITA_MOCK.WALLET_BALANCE_DISPLAY (which was itself a
 * patch for two pages hardcoding two different numbers) with the real
 * thing: one fetch, cached here, read by every page through
 * getBalanceDisplay() / subscribe().
 *
 * wallet.js and profile.js both import from here now — neither hardcodes a
 * balance, and neither can drift from the other, because there's only one
 * copy of the number in memory.
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

/** @param {number} amount @param {'card'|'bank_transfer'|'ussd'} channel */
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

/**
 * The ₦184,500 vs ₦245,500 bug happened because two pages each formatted
 * (and independently hardcoded) the same balance. This file is the one
 * place that turns a Decimal-as-string from the API into display text, on
 * both platforms.
 */

/**
 * @param {string|number} amount - decimal string from the API (e.g. "245500.00")
 * @param {string} currency
 * @returns {string} e.g. "₦245,500.00"
 */
export function formatCurrency(amount, currency = 'NGN') {
  const symbols = { NGN: '\u20A6', USD: '$' };
  const symbol = symbols[currency] ?? `${currency} `;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return `${symbol}0.00`;
  return `${symbol}${num.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ══════════════════════════════════════════════════════════
   currencyUtils.js — Shared currency conversion & formatting
   Include this script BEFORE page-specific JS on any page
   that displays event prices.
   
   Exchange Rates (hardcoded):
     1 USD = 230 DZD
     1 EUR = 280 DZD
     1 GBP = 300 DZD
══════════════════════════════════════════════════════════ */

const CURRENCY_RATES_TO_DZD = {
  DZD: 1,
  USD: 230,
  EUR: 280,
  GBP: 300,
};

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', DZD: 'DZD' };

/**
 * Convert a price from one currency to another.
 * @param {number} amount     — the raw price value
 * @param {string} fromCur    — source currency code (e.g. "DZD")
 * @param {string} toCur      — target currency code (e.g. "USD")
 * @returns {number}          — converted amount, rounded to 2 decimals
 */
function convertPrice(amount, fromCur, toCur) {
  if (!amount || amount <= 0) return 0;
  if (fromCur === toCur) return amount;

  const fromRate = CURRENCY_RATES_TO_DZD[fromCur];
  const toRate   = CURRENCY_RATES_TO_DZD[toCur];
  if (!fromRate || !toRate) return amount; // unknown currency — return as-is

  // Convert: source → DZD → target
  const inDZD = amount * fromRate;
  return +(inDZD / toRate).toFixed(2);
}

/**
 * Format a number with a currency symbol.
 * @param {number} amount   — the numeric price
 * @param {string} currency — currency code
 * @returns {string}        — e.g. "$10.87" or "2,500.00 DZD"
 */
function formatCurrencyValue(amount, currency) {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  const locale = currency === 'USD' ? 'en-US'
               : currency === 'EUR' ? 'fr-FR'
               : currency === 'GBP' ? 'en-GB'
               : 'fr-DZ';
  const formatted = amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'DZD' ? `${formatted} DZD` : `${sym}${formatted}`;
}

/**
 * All-in-one: convert an event's price from its stored currency
 * to the user's preferred currency, then format it.
 * @param {number} amount        — event's raw price
 * @param {string} eventCurrency — the currency the event was created in
 * @param {string} [userCurrency] — user's preferred display currency (auto-detected if omitted)
 * @returns {string}             — e.g. "$10.87" or "Free"
 */
function displayPrice(amount, eventCurrency, userCurrency) {
  if (!amount || amount <= 0) return 'Free';
  userCurrency  = userCurrency  || localStorage.getItem('eventfy_currency') || 'DZD';
  eventCurrency = eventCurrency || 'DZD';
  const converted = convertPrice(amount, eventCurrency, userCurrency);
  return formatCurrencyValue(converted, userCurrency);
}

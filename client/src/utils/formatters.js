import { format } from 'date-fns';

/**
 * Format an amount as Indian Rupee (₹) without decimal places.
 * @param {number} n
 * @returns {string} e.g. "₹12,345"
 */
export const fmtCurrency = (n) =>
    `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * Format with an explicit + for positive values.
 * @param {number} n
 * @returns {string} e.g. "+₹500" or "₹-200"
 */
export const fmtSignedCurrency = (n) =>
    `${n > 0 ? '+' : ''}${fmtCurrency(n)}`;

/**
 * Format a JavaScript Date object to an ISO date string (yyyy-MM-dd).
 * @param {Date} d
 * @returns {string}
 */
export const fmtDate = (d) => format(d, 'yyyy-MM-dd');

/**
 * Convert an ISO date string (yyyy-MM-dd) to Indian display format (dd-MM-yyyy).
 * @param {string} iso
 * @returns {string}
 */
export const fmtDisplay = (iso) => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
};

/**
 * Build a display label for a card object.
 * @param {{ bank_name: string, last_four_digit: string }} card
 * @returns {string} e.g. "HDFC Bank ••••1234"
 */
export const cardLabel = (card) =>
    card ? `${card.bank_name} - ${card.last_four_digit}` : '';

/**
 * Card label including the holder name (when the holder is populated).
 * Used in dropdowns where cards from several people are listed together.
 * @returns {string} e.g. "HDFC Bank - 1234 · Ravi"
 */
export const cardHolderLabel = (card) => {
    if (!card) return '';
    const holder = card.holder_id?.name;
    const addon = card.card_type === 'addon' ? ' (Add-on)' : '';
    return `${cardLabel(card)}${addon}${holder ? ` · ${holder}` : ''}`;
};

/**
 * Build a display label for a seller object.
 * @param {{ name: string, city: string }} seller
 * @returns {string} e.g. "Prakash Das (Ranchi)"
 */
export const sellerLabel = (seller) =>
    seller ? `${seller.name} (${seller.city})` : '';

/**
 * Return the CSS color variable for a profit/balance value.
 * Positive → success (green), negative → danger (red), zero → inherit.
 * @param {number} value
 * @returns {string}
 */
export const profitColor = (value) =>
    value > 0 ? 'var(--success)' : value < 0 ? 'var(--danger)' : 'inherit';

/**
 * Strip falsy values from a params object (empty strings, null, undefined, 0).
 * Useful for building clean API query params.
 * @param {Object} obj
 * @returns {Object}
 */
export const pickTruthy = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));

/**
 * Return ordinal suffix for a number (1st, 2nd, 3rd, 4th, 11th, 21st, etc.)
 * @param {number} n
 * @returns {string}
 */
export const ordinalSuffix = (n) => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    const mod10 = n % 10;
    if (mod10 === 1) return `${n}st`;
    if (mod10 === 2) return `${n}nd`;
    if (mod10 === 3) return `${n}rd`;
    return `${n}th`;
};

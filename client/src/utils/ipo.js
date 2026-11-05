/**
 * IPO profit sharing — mirror of server/utils/ipo.js.
 * profit = sell_price − lot_price (once allotted and sold);
 * the applicant gets profit_share_percent of it, you keep the rest.
 */
const round2 = (n) => Math.round(n * 100) / 100;

export const isSold = (a) => a.allotted === true && typeof a.sell_price === 'number';

export function ipoShares(a) {
  if (!isSold(a)) return { profit: null, their_share: null, my_share: null };
  const profit = round2(a.sell_price - a.lot_price);
  const their = round2(profit * (a.profit_share_percent || 0) / 100);
  return { profit, their_share: their, my_share: round2(profit - their) };
}

export const IPO_STATUS = {
  applied: { label: 'Applied', badge: 'badge-surface' },
  allotted: { label: 'Allotted', badge: 'badge-warning' },
  sold: { label: 'Sold', badge: 'badge-success' },
};

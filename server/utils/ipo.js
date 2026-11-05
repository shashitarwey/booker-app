/**
 * IPO profit sharing (mirrored in client/src/utils/ipo.js).
 *
 * Profit exists only for an allotted application with a sell price:
 *   profit      = sell_price − lot_price   (can be negative: a loss is shared too)
 *   their_share = profit × profit_share_percent / 100
 *   my_share    = profit − their_share
 */
const round2 = (n) => Math.round(n * 100) / 100;

const isSold = (a) => a.allotted === true && typeof a.sell_price === 'number';

function ipoShares(a) {
    if (!isSold(a)) return { profit: null, their_share: null, my_share: null };
    const profit = round2(a.sell_price - a.lot_price);
    const their = round2(profit * (a.profit_share_percent || 0) / 100);
    return { profit, their_share: their, my_share: round2(profit - their) };
}

/** Status shown in the UI: applied → allotted → sold (or not_allotted once decided). */
const ipoStatus = (a) => (isSold(a) ? 'sold' : a.allotted ? 'allotted' : 'applied');

/** Roll a list of applications up into counts and ₹ totals. */
function summarize(apps) {
    const s = { applications: 0, allotted: 0, sold: 0, awaiting_sale: 0, invested: 0, profit: 0, their_share: 0, my_share: 0 };
    for (const a of apps) {
        s.applications += 1;
        if (!a.allotted) continue;
        s.allotted += 1;
        s.invested += a.lot_price;
        const sh = ipoShares(a);
        if (sh.profit === null) { s.awaiting_sale += 1; continue; }
        s.sold += 1;
        s.profit += sh.profit;
        s.their_share += sh.their_share;
        s.my_share += sh.my_share;
    }
    for (const k of ['invested', 'profit', 'their_share', 'my_share']) s[k] = round2(s[k]);
    return s;
}

module.exports = { ipoShares, ipoStatus, summarize, isSold };

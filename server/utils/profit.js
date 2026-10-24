/**
 * Single source of truth for order profit.
 *
 * Own / family card order:  profit = return_amount − order_amount + cashback (+ coupon)
 * Friend card order:        profit = return_amount − friend_amount (+ coupon)
 *                           friend earns friend_amount − order_amount + cashback
 * Coupon cashback (from the e-comm site, on the user's account) is added to
 * the user's profit only when coupon_in_profit isn't false. It never changes
 * what a friend earns.
 *
 * An order is a friend order when `friend_amount` is a number. The orders
 * route sets it (required) for cards held by a friend and nulls it otherwise.
 */

const IS_FRIEND_ORDER = { $isNumber: '$friend_amount' };

const OWN_PROFIT = { $add: [{ $subtract: ['$return_amount', '$order_amount'] }, { $ifNull: ['$cashback', 0] }] };

// Coupon cashback counted towards profit (missing flag on old docs = counted)
const COUPON_IN_PROFIT = {
    $cond: [{ $eq: ['$coupon_in_profit', false] }, 0, { $ifNull: ['$coupon_cashback', 0] }],
};

/** Aggregation expression: the user's profit on one order document. */
const PROFIT_EXPR = {
    $add: [
        { $cond: [IS_FRIEND_ORDER, { $subtract: ['$return_amount', '$friend_amount'] }, OWN_PROFIT] },
        COUPON_IN_PROFIT,
    ],
};

/** Aggregation expression: the friend's earning on one order (0 for non-friend orders). */
const FRIEND_EARNING_EXPR = {
    $cond: [IS_FRIEND_ORDER, { $add: [{ $subtract: ['$friend_amount', '$order_amount'] }, { $ifNull: ['$cashback', 0] }] }, 0],
};

const isFriendOrder = (o) => typeof o.friend_amount === 'number';

const couponInProfit = (o) => (o.coupon_in_profit === false ? 0 : (o.coupon_cashback || 0));

/** JS equivalent of PROFIT_EXPR for a plain order object. */
function orderProfit(o) {
    const base = isFriendOrder(o)
        ? (o.return_amount || 0) - o.friend_amount
        : (o.return_amount || 0) - (o.order_amount || 0) + (o.cashback || 0);
    return base + couponInProfit(o);
}

module.exports = { PROFIT_EXPR, FRIEND_EARNING_EXPR, isFriendOrder, orderProfit };

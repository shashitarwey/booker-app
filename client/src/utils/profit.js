/**
 * Order profit — mirrors server/utils/profit.js.
 *
 * Own / family card:  profit = return − order + cashback (+ coupon)
 * Friend card:        profit = return − amount given to friend (+ coupon)
 *                     (coupon = coupon_cashback, unless coupon_in_profit is false)
 *                     friend earns given − order + cashback
 */
export const isFriendOrder = (o) => typeof o?.friend_amount === 'number';

// Coupon cashback counts towards profit unless the order says not to
const couponInProfit = (o) => (o?.coupon_in_profit === false ? 0 : (o?.coupon_cashback || 0));

export const orderProfit = (o) => {
    const base = isFriendOrder(o)
        ? (o.return_amount || 0) - o.friend_amount
        : (o.return_amount || 0) - (o.order_amount || 0) + (o.cashback || 0);
    return base + couponInProfit(o);
};

export const friendEarning = (o) =>
    isFriendOrder(o) ? o.friend_amount - (o.order_amount || 0) + (o.cashback || 0) : 0;

/** Profit as % of order amount for an aggregate { my_profit, total_order_amount }. */
export const profitPercent = (p) =>
    p.total_order_amount > 0 ? (p.my_profit / p.total_order_amount) * 100 : 0;

/** "(2.58%)"-style label: profit as % of an order amount; '' when there is no amount. */
export const pctLabel = (profit, orderAmount) =>
    orderAmount > 0 ? `(${((profit / orderAmount) * 100).toFixed(2)}%)` : '';

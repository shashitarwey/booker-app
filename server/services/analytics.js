const Order = require('../models/Order');
const { PROFIT_EXPR, FRIEND_EARNING_EXPR } = require('../utils/profit');
const SellerPayment = require('../models/SellerPayment');
const Person = require('../models/Person');
const { khataTotalsByPerson } = require('../utils/bookerKhata');
const { toObjectId } = require('../utils/helpers');
const { todayAsUtcDate } = require('../utils/dates');

/**
 * GET /api/analytics/profit
 *
 * Returns:
 *  - monthly: [{ label, year, month, order_amount, return_amount, cashback, profit, order_count }]
 *    Empty months between earliest and latest are filled with zeros so the trend
 *    chart doesn't draw long straight lines across gaps.
 *  - bySeller / byEcommSite / totals — date-filtered when from_date/to_date are set.
 *  - byBooker: [{ person_id, name, relation, order_count, order_amount, profit, profit_percent, friend_amount, friend_earning, pending_dues }]
 *      — grouped by the holder of the card used (self / family / friend)
 *  - bySource: { own: {...}, bookers: {...} } — own & family cards vs friends' cards
 *  - position: all-time balances { receivable, payable, pending_orders, pending_order_amount, pending_return_amount, net }
 *  - fy: { start, days, profit, per_day_profit } — always FY-to-date (1 Apr → today),
 *    independent of the date filter. Used by the "Per Day Profit (FY)" stat card.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Fill empty months between start and end (inclusive) so a sparse trend
// renders as zeros instead of a single sloped line across the gap.
function fillMonthlyGaps(rows, startDate, endDate) {
    const byKey = new Map(rows.map(r => [`${r.year}-${r.month}`, r]));
    const out = [];
    const cur = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
    while (cur <= end) {
        const y = cur.getUTCFullYear();
        const m = cur.getUTCMonth() + 1;
        const key = `${y}-${m}`;
        const existing = byKey.get(key);
        out.push(existing || {
            year: y, month: m,
            order_amount: 0, return_amount: 0, cashback: 0, profit: 0, order_count: 0,
            label: `${MONTHS[m - 1]} ${y}`,
        });
        cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return out;
}


/**
 * Profit analytics for one user (see GET /api/analytics/profit docs above).
 * Shared by the analytics route and the AI assistant's data snapshot.
 * @param {string} userIdStr
 * @param {{ from_date?: string, to_date?: string }} [query]
 */
async function computeProfitAnalytics(userIdStr, query = {}) {
    const userId = toObjectId(userIdStr);
    const { from_date, to_date } = query;

    const baseMatch = { user_id: userId, delivery_status: 'Delivered' };
    if (from_date || to_date) {
        baseMatch.order_date = {};
        if (from_date) baseMatch.order_date.$gte = new Date(from_date);
        if (to_date) baseMatch.order_date.$lte = new Date(`${to_date}T23:59:59.999Z`);
    }

    // ── Monthly profit trend ────────────────────────────────────────
    const monthly = await Order.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    year: { $year: '$order_date' },
                    month: { $month: '$order_date' },
                },
                order_amount: { $sum: '$order_amount' },
                return_amount: { $sum: '$return_amount' },
                cashback: { $sum: '$cashback' },
                order_count: { $sum: 1 },
                profit: { $sum: PROFIT_EXPR },
            },
        },
        {
            $project: {
                _id: 0,
                year: '$_id.year',
                month: '$_id.month',
                order_amount: 1,
                return_amount: 1,
                cashback: 1,
                order_count: 1,
                profit: 1,
            },
        },
        { $sort: { year: 1, month: 1 } },
    ]);

    const monthlyWithLabels = monthly.map(m => ({
        ...m,
        label: `${MONTHS[m.month - 1]} ${m.year}`,
    }));

    // Range for gap-filling: use filter bounds if provided, else min-order-date
    // to today. Falls back to today/today when there are no orders at all.
    let trendStart, trendEnd;
    if (from_date) trendStart = new Date(from_date);
    else if (monthlyWithLabels.length) trendStart = new Date(Date.UTC(monthlyWithLabels[0].year, monthlyWithLabels[0].month - 1, 1));
    else trendStart = new Date();
    if (to_date) trendEnd = new Date(to_date);
    else trendEnd = new Date();

    const monthlyFormatted = monthlyWithLabels.length || (from_date && to_date)
        ? fillMonthlyGaps(monthlyWithLabels, trendStart, trendEnd)
        : [];

    // ── Profit by seller ────────────────────────────────────────────
    const bySeller = await Order.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: '$seller_id',
                order_amount: { $sum: '$order_amount' },
                return_amount: { $sum: '$return_amount' },
                cashback: { $sum: '$cashback' },
                order_count: { $sum: 1 },
                profit: { $sum: PROFIT_EXPR },
            },
        },
        {
            $lookup: {
                from: 'sellers',
                localField: '_id',
                foreignField: '_id',
                as: 'seller',
            },
        },
        { $unwind: { path: '$seller', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 0,
                seller_id: '$_id',
                seller_name: { $ifNull: ['$seller.name', 'Unknown'] },
                seller_city: { $ifNull: ['$seller.city', ''] },
                order_amount: 1,
                return_amount: 1,
                cashback: 1,
                order_count: 1,
                profit: 1,
                profit_percent: {
                    $cond: [
                        { $eq: ['$order_amount', 0] },
                        0,
                        {
                            $round: [
                                {
                                    $multiply: [
                                        {
                                            $divide: [
                                                '$profit',
                                                '$order_amount',
                                            ]
                                        },
                                        100,
                                    ],
                                },
                                2,
                            ],
                        },
                    ],
                },
            },
        },
        { $sort: { profit: -1 } },
    ]);

    // ── Profit by e-commerce site ───────────────────────────────────
    const byEcommSite = await Order.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: '$ecomm_site',
                order_amount: { $sum: '$order_amount' },
                return_amount: { $sum: '$return_amount' },
                cashback: { $sum: '$cashback' },
                order_count: { $sum: 1 },
                profit: { $sum: PROFIT_EXPR },
            },
        },
        {
            $project: {
                _id: 0,
                ecomm_site: '$_id',
                order_amount: 1,
                return_amount: 1,
                cashback: 1,
                order_count: 1,
                profit: 1,
            },
        },
        { $sort: { profit: -1 } },
    ]);

    // ── Overall totals (within filter) ──────────────────────────────
    const [totals] = await Order.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: null,
                order_amount: { $sum: '$order_amount' },
                return_amount: { $sum: '$return_amount' },
                cashback: { $sum: '$cashback' },
                order_count: { $sum: 1 },
                profit: { $sum: PROFIT_EXPR },
            },
        },
        {
            $project: {
                _id: 0,
                order_amount: 1,
                return_amount: 1,
                cashback: 1,
                order_count: 1,
                profit: 1,
            },
        },
    ]);

    // ── FY-to-date per-day profit (independent of filter) ───────────
    // Indian FY runs 1 Apr → 31 Mar. Stat shows total FY profit / days elapsed.
    const today = todayAsUtcDate(); // business-timezone calendar day
    const fyStartYear = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
    const fyStart = new Date(Date.UTC(fyStartYear, 3, 1));
    const fyDays = Math.max(1, Math.round((today - fyStart) / 86400000) + 1);

    const [fyTotals] = await Order.aggregate([
        { $match: { user_id: userId, delivery_status: 'Delivered', order_date: { $gte: fyStart } } },
        {
            $group: {
                _id: null,
                profit: { $sum: PROFIT_EXPR },
            },
        },
    ]);
    const fyProfit = fyTotals?.profit || 0;

    // ── By card holder (booker / self / family) ───────────────────────
    // Orders → cards → people. Small collections, so $lookup is cheap.
    const holderStages = [
        { $match: baseMatch },
        { $lookup: { from: 'cards', localField: 'card_id', foreignField: '_id', as: 'card' } },
        { $unwind: { path: '$card', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'people', localField: 'card.holder_id', foreignField: '_id', as: 'holder' } },
        { $unwind: { path: '$holder', preserveNullAndEmptyArrays: true } },
    ];
    const sums = {
        order_count: { $sum: 1 },
        order_amount: { $sum: '$order_amount' },
        profit: { $sum: PROFIT_EXPR },
        friend_amount: { $sum: { $ifNull: ['$friend_amount', 0] } },
        friend_earning: { $sum: FRIEND_EARNING_EXPR },
    };
    const pct = (r) => (r.order_amount > 0 ? Math.round((r.profit / r.order_amount) * 10000) / 100 : 0);

    const holderRows = await Order.aggregate([
        ...holderStages,
        { $group: { _id: '$holder._id', name: { $first: '$holder.name' }, relation: { $first: '$holder.relation' }, ...sums } },
    ]);

    const byBooker = holderRows
        .map(r => ({
            person_id: r._id, name: r.name || 'Unknown', relation: r.relation || 'self',
            order_count: r.order_count, order_amount: r.order_amount, profit: r.profit, profit_percent: pct(r),
            friend_amount: r.friend_amount, friend_earning: r.friend_earning,
        }))
        .sort((a, b) => b.profit - a.profit);

    const emptySource = () => ({ order_count: 0, order_amount: 0, profit: 0 });
    const bySource = { own: emptySource(), bookers: emptySource() };
    for (const r of byBooker) {
        const k = r.relation === 'friend' ? 'bookers' : 'own';
        bySource[k].order_count += r.order_count;
        bySource[k].order_amount += r.order_amount;
        bySource[k].profit += r.profit;
    }
    for (const k of Object.keys(bySource)) bySource[k].profit_percent = pct(bySource[k]);

    // ── Cash position (all-time balances, independent of the filter) ──
    const friends = await Person.find({ user_id: userId, relation: 'friend' }, '_id').lean();
    const [[receivableRow], [paidRow], [pendingRow], khata] = await Promise.all([
        Order.aggregate([{ $match: { user_id: userId, delivery_status: 'Delivered' } }, { $group: { _id: null, total: { $sum: '$return_amount' } } }]),
        SellerPayment.aggregate([{ $match: { user_id: userId } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Order.aggregate([
            { $match: { user_id: userId, delivery_status: 'Pending' } },
            { $group: { _id: null, count: { $sum: 1 }, order_amount: { $sum: '$order_amount' }, return_amount: { $sum: '$return_amount' } } },
        ]),
        khataTotalsByPerson(userIdStr, friends.map(f => f._id)),
    ]);
    for (const b of byBooker) b.pending_dues = khata.get(String(b.person_id))?.pending_dues || 0;
    const receivable = (receivableRow?.total || 0) - (paidRow?.total || 0);
    // Only what's owed: one booker's advance mustn't cancel another's dues
    const payable = [...khata.values()].reduce((sum, t) => sum + Math.max(0, t.pending_dues), 0);
    const advanceWithBookers = [...khata.values()].reduce((sum, t) => sum + Math.max(0, -t.pending_dues), 0);
    const position = {
        receivable,
        payable,
        pending_orders: pendingRow?.count || 0,
        pending_order_amount: pendingRow?.order_amount || 0,
        pending_return_amount: pendingRow?.return_amount || 0,
        advance_with_bookers: advanceWithBookers,
        net: receivable - payable,
    };

    return {
        monthly: monthlyFormatted,
        byBooker,
        bySource,
        position,
        bySeller,
        byEcommSite,
        totals: totals || { order_amount: 0, return_amount: 0, cashback: 0, profit: 0, order_count: 0 },
        fy: {
            start: fyStart.toISOString().slice(0, 10),
            days: fyDays,
            profit: fyProfit,
            per_day_profit: fyProfit / fyDays,
        },
    };
}

module.exports = { computeProfitAnalytics, fillMonthlyGaps };

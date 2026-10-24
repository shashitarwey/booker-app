const express = require('express');
const router = express.Router();
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const { PROFIT_EXPR } = require('../utils/profit');
const { buildDateRange, getCashbackCycleStart } = require('../utils/helpers');
const { cacheMiddleware } = require('../utils/cache');
const { todayLocal, todayAsUtcDate } = require('../utils/dates');

/**
 * @swagger
 * /summary:
 *   get:
 *     summary: Get spend summary per card and per bank (cached 5 min)
 *     tags: [Summary]
 *     parameters:
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [quarterly, monthly] }
 *     responses:
 *       200: { description: Object with cards array, banks array, and grand_total }
 */

// GET /api/summary?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
router.get('/', cacheMiddleware(300), async (req, res, next) => {
    try {
        const { from_date: qFrom, to_date: qTo, period } = req.query;
        let from_date, to_date;

        if (qFrom && qTo) {
            from_date = qFrom; to_date = qTo;
        } else {
            // Defaults use the business-timezone calendar day (not UTC)
            const today = todayAsUtcDate();
            const y = today.getUTCFullYear();
            const m = period === 'quarterly' ? Math.floor(today.getUTCMonth() / 3) * 3 : today.getUTCMonth();
            from_date = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
            to_date = todayLocal();
        }

        const dateRange = buildDateRange(from_date, to_date);
        const cards = await Card.find({ user_id: req.user.id }).populate('holder_id', 'name relation').sort({ bank_name: 1, created_at: 1 });
        const cardIds = cards.map(c => c._id);

        // Aggregate transaction spend per card in one query (fixes N+1)
        const txAgg = await Transaction.aggregate([
            { $match: { card_id: { $in: cardIds }, date: dateRange } },
            { $group: { _id: '$card_id', total: { $sum: '$amount' } } }
        ]);
        const txMap = txAgg.reduce((m, r) => { m[r._id.toString()] = r.total; return m; }, {});

        // Aggregate order spend + profit per card in one query (fixes N+1).
        // Profit here saves clients from fetching every order to compute it.
        const ordAgg = await Order.aggregate([
            { $match: { card_id: { $in: cardIds }, order_date: dateRange, delivery_status: { $ne: 'Cancelled' } } },
            { $group: { _id: '$card_id', total: { $sum: '$order_amount' }, profit: { $sum: PROFIT_EXPR }, order_count: { $sum: 1 } } }
        ]);
        const ordMap = ordAgg.reduce((m, r) => { m[r._id.toString()] = r; return m; }, {});

        // Aggregate cashback earned per card in its current reset cycle
        const cbCards = cards.filter(c => c.cashback_enabled && c.cashback_limit > 0);
        const cbCycleMap = {};
        if (cbCards.length) {
            // Group cards by their cycle start date to minimize queries
            const cycleGroups = {};
            for (const c of cbCards) {
                const cycleStart = getCashbackCycleStart(c.cashback_reset_day, c.cashback_period, c.cashback_cycle_start_month);
                const key = cycleStart.toISOString();
                if (!cycleGroups[key]) cycleGroups[key] = { start: cycleStart, cardIds: [] };
                cycleGroups[key].cardIds.push(c._id);
            }
            // Run one aggregation per distinct cycle start
            for (const { start, cardIds } of Object.values(cycleGroups)) {
                const agg = await Order.aggregate([
                    { $match: { card_id: { $in: cardIds }, order_date: { $gte: start }, delivery_status: { $ne: 'Cancelled' } } },
                    { $group: { _id: '$card_id', earned: { $sum: '$cashback' } } }
                ]);
                for (const r of agg) cbCycleMap[r._id.toString()] = r.earned;
            }
        }

        const cardSummaries = cards.map(card => {
            const id = card._id.toString();
            const ord = ordMap[id];
            const total_spend = (txMap[id] || 0) + (ord?.total || 0);
            const cashback_earned_cycle = cbCycleMap[id] || 0;
            return {
                ...card.toObject(), total_spend, cashback_earned_cycle,
                // Order profit in the period (non-cancelled); order_count 0 → no orders
                profit: ord?.profit || 0, order_count: ord?.order_count || 0,
            };
        });

        const bankMap = {};
        cardSummaries.forEach(c => { bankMap[c.bank_name] = (bankMap[c.bank_name] || 0) + c.total_spend; });
        const banks = Object.entries(bankMap)
            .map(([bank_name, total_spend]) => ({ bank_name, total_spend }))
            .sort((a, b) => a.bank_name.localeCompare(b.bank_name));

        res.json({
            from_date, to_date,
            grand_total: cardSummaries.reduce((s, c) => s + c.total_spend, 0),
            cards: cardSummaries,
            banks,
        });
    } catch (err) { next(err); }
});

module.exports = router;

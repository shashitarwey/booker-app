const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const { buildDateRange } = require('../utils/helpers');
const { invalidateCache } = require('../utils/cache');
const { logActivity } = require('../utils/activityLogger');
const validate = require('../middleware/validate');
const { createRules, idRule } = require('../validators/transactions.validator');

/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: Get merged transactions + orders (paginated)
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: cardId
 *         schema: { type: string }
 *       - in: query
 *         name: bankName
 *         schema: { type: string }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200: { description: Paginated transactions with total amount }
 *   post:
 *     summary: Create a new transaction
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [card_id, amount]
 *             properties:
 *               card_id: { type: string }
 *               amount: { type: number, minimum: 0.01 }
 *               description: { type: string }
 *               date: { type: string, format: date }
 *     responses:
 *       201: { description: Transaction created }
 * /transactions/{id}:
 *   delete:
 *     summary: Delete a transaction
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Transaction deleted }
 *       404: { description: Transaction not found }
 */

// GET /api/transactions?cardId=&from_date=&to_date=&page=&limit=
router.get('/', async (req, res, next) => {
    try {
        const { cardId, bankName, from_date, to_date, page = 1, limit = 10 } = req.query;
        const currentPage = Math.max(1, parseInt(page));
        const pageSize = Math.max(1, Math.min(100, parseInt(limit)));

        // ── 1. Resolve card IDs belonging to this user ──────────────────────
        // Still needed even though transactions now carry user_id: orders are
        // NOT cascade-deleted with their card, so the merged view only stays
        // identical if orders keep being limited to the user's existing cards.
        // cardId must also be verified as the user's, and bankName mapped.
        let userCardIds = [];
        if (cardId) {
            const c = await Card.findOne({ _id: cardId, user_id: req.user.id }, '_id');
            if (c) userCardIds.push(c._id);
        } else if (bankName) {
            userCardIds = (await Card.find({ bank_name: bankName, user_id: req.user.id }, '_id')).map(c => c._id);
        } else {
            userCardIds = (await Card.find({ user_id: req.user.id }, '_id')).map(c => c._id);
        }

        if (userCardIds.length === 0) {
            return res.json({
                items: [], totalAmount: 0,
                page: { has_next: false, page_size: pageSize, total_items: 0, current_page: currentPage, has_previous: false },
            });
        }

        // ── 2. Build date filter ────────────────────────────────────────────
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const dateRange = buildDateRange(from_date, to_date);
        // Transactions stay matched on card_id rather than user_id: the card
        // ids are already in hand (see above), and legacy docs not yet
        // backfilled by utils/migrations.js must not silently drop out.
        const txMatch = { card_id: { $in: userCardIds } };
        if (dateRange) txMatch.date = dateRange;

        const ordDateRange = dateRange
            ? Object.fromEntries(Object.entries(dateRange).map(([k, v]) => [k, v]))
            : null;

        // ── 3. Build $unionWith aggregation pipeline ────────────────────────
        const pipeline = [
            // Start with transactions matching user's cards + date range
            { $match: txMatch },
            // Project to a common shape
            {
                $project: {
                    card_id: 1,
                    description: 1,
                    amount: 1,
                    date: 1,
                    is_order: { $literal: false },
                },
            },
            // Union with orders (projected to the same shape)
            {
                $unionWith: {
                    coll: 'orders',
                    pipeline: [
                        {
                            $match: {
                                // user_id first so { user_id, card_id, delivery_status }
                                // bounds the scan; card_id keeps deleted-card orders out
                                user_id: userId,
                                card_id: { $in: userCardIds },
                                delivery_status: { $ne: 'Cancelled' },
                                ...(ordDateRange ? { order_date: ordDateRange } : {}),
                            },
                        },
                        {
                            $project: {
                                card_id: 1,
                                description: '$model_ordered',
                                amount: '$order_amount',
                                date: '$order_date',
                                is_order: { $literal: true },
                            },
                        },
                    ],
                },
            },
            // Sort by date descending
            // _id tie-break: many rows share a calendar day, keep paging stable
            { $sort: { date: -1, _id: -1 } },
            // Use $facet for parallel count + totalAmount + paginated items
            {
                $facet: {
                    metadata: [
                        {
                            $group: {
                                _id: null,
                                total_items: { $sum: 1 },
                                total_amount: { $sum: '$amount' },
                            },
                        },
                    ],
                    items: [
                        { $skip: (currentPage - 1) * pageSize },
                        { $limit: pageSize },
                        // Lookup card details (equivalent to populate)
                        {
                            $lookup: {
                                from: 'cards',
                                localField: 'card_id',
                                foreignField: '_id',
                                as: '_card',
                            },
                        },
                        { $unwind: { path: '$_card', preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 1,
                                description: 1,
                                amount: 1,
                                date: 1,
                                is_order: 1,
                                card_id: {
                                    _id: '$_card._id',
                                    bank_name: '$_card.bank_name',
                                    card_network: '$_card.card_network',
                                    last_four_digit: '$_card.last_four_digit',
                                    cashback_enabled: '$_card.cashback_enabled',
                                    cashback_percent: '$_card.cashback_percent',
                                },
                            },
                        },
                    ],
                },
            },
        ];

        const [result] = await Transaction.aggregate(pipeline);

        const meta = result.metadata[0] || { total_items: 0, total_amount: 0 };
        const totalPages = Math.ceil(meta.total_items / pageSize) || 1;

        res.json({
            items: result.items,
            totalAmount: meta.total_amount,
            page: {
                has_next: currentPage < totalPages,
                page_size: pageSize,
                total_items: meta.total_items,
                current_page: currentPage,
                has_previous: currentPage > 1,
            },
        });
    } catch (err) { next(err); }
});

// POST /api/transactions
router.post('/', createRules, validate, async (req, res, next) => {
    try {
        const { card_id, amount, description, date } = req.body;
        // Verify card belongs to current user
        const card = await Card.findOne({ _id: card_id, user_id: req.user.id });
        if (!card) return res.status(400).json({ error: 'Card not found or not yours' });
        const tx = await Transaction.create({ user_id: req.user.id, card_id, amount, description, date });
        invalidateCache(req, 'transactions');
        logActivity(req.user.id, 'created', 'transaction', tx._id, `Added transaction: ₹${amount} — ${description || 'No description'}`, tx);
        res.status(201).json(tx);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE /api/transactions/:id
router.delete('/:id', idRule, validate, async (req, res, next) => {
    try {
        // Ownership via the denormalised user_id — no Card lookup needed
        let tx = await Transaction.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!tx) {
            // Legacy doc the startup backfill hasn't reached (or failed on):
            // fall back to the old check through its card.
            const legacy = await Transaction.findOne({ _id: req.params.id, user_id: null }).populate('card_id', 'user_id');
            if (legacy?.card_id && String(legacy.card_id.user_id) === req.user.id) tx = legacy;
        }
        if (!tx) return res.status(404).json({ error: 'Transaction not found' });
        await tx.deleteOne();
        invalidateCache(req, 'transactions');
        logActivity(req.user.id, 'deleted', 'transaction', tx._id, `Deleted transaction: ₹${tx.amount} — ${tx.description || 'No description'}`, tx);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;

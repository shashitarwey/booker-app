const express = require('express');
const router = express.Router();
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const Person = require('../models/Person');
const { pickFields, getCashbackCycle } = require('../utils/helpers');
const { todayAsUtcDate } = require('../utils/dates');
const mongoose = require('mongoose');
const { invalidateCache } = require('../utils/cache');
const { logActivity } = require('../utils/activityLogger');
const validate = require('../middleware/validate');
const { createRules, updateRules, idRule } = require('../validators/cards.validator');
const { ensureSelfPerson, familyPersonIds } = require('../utils/people');

/**
 * @swagger
 * /cards:
 *   get:
 *     summary: Get all cards for the authenticated user (optional ?holder_id= filter)
 *     tags: [Cards]
 *     responses:
 *       200: { description: Array of card objects sorted by bank name }
 *   post:
 *     summary: Create a new credit card
 *     tags: [Cards]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bank_name, card_network, last_four_digit, name_on_card]
 *             properties:
 *               bank_name: { type: string }
 *               card_network: { type: string, enum: [Visa, Mastercard, AmEx, RuPay] }
 *               last_four_digit: { type: string, pattern: "^\\d{4}$" }
 *               name_on_card: { type: string }
 *               holder_id: { type: string, description: "Person who holds the card. Defaults to self." }
 *               card_type: { type: string, enum: [primary, addon] }
 *               primary_card_id: { type: string, description: "For add-on cards: the primary card" }
 *               cashback_enabled: { type: boolean }
 *               cashback_percent: { type: number }
 *               cashback_limit: { type: number }
 *               cashback_period: { type: string, enum: [monthly, quarterly, half-yearly, yearly] }
 *               billing_date: { type: integer, minimum: 1, maximum: 31 }
 *               due_date: { type: integer, minimum: 1, maximum: 31 }
 *     responses:
 *       201: { description: Card created }
 * /cards/{id}:
 *   put:
 *     summary: Update a card
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Card updated }
 *       404: { description: Card not found }
 *   delete:
 *     summary: Delete a card and all its transactions (blocked while the card has orders)
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Card and transactions deleted }
 *       404: { description: Card not found }
 */

// Allowed fields for card creation/update
const CARD_FIELDS = [
    'bank_name', 'card_network', 'last_four_digit', 'name_on_card',
    'cashback_enabled', 'cashback_percent', 'cashback_limit', 'cashback_period', 'cashback_reset_day', 'cashback_cycle_start_month',
    'cashback_sites',
    'billing_date', 'due_date',
    'holder_id', 'card_type', 'primary_card_id'
];

const HOLDER_POPULATE = { path: 'holder_id', select: 'name relation' };

/**
 * Validate and normalise holder / add-on fields in-place.
 * Returns an error message string, or null if the data is valid.
 */
async function resolveHolderFields(req, data, cardId = null) {
    if (data.holder_id !== undefined) {
        if (!data.holder_id) {
            if (cardId) delete data.holder_id;   // empty on update → keep existing holder
        } else {
            const holder = await Person.exists({ _id: data.holder_id, user_id: req.user.id });
            if (!holder) return 'Invalid holder_id — person not found or not yours';
        }
    }
    if (!cardId && !data.holder_id) {
        data.holder_id = (await ensureSelfPerson(req.user.id, req.user.name))._id;
    }

    if (data.card_type === 'primary') data.primary_card_id = null;
    if (data.primary_card_id !== undefined) {
        if (!data.primary_card_id) {
            data.primary_card_id = null;
        } else {
            if (cardId && String(data.primary_card_id) === String(cardId)) return 'A card cannot be its own primary card';
            const primary = await Card.findOne({ _id: data.primary_card_id, user_id: req.user.id }, 'card_type');
            if (!primary) return 'Invalid primary_card_id — card not found or not yours';
            if (primary.card_type === 'addon') return 'primary_card_id must point to a primary card';
        }
    }
    return null;
}

// All routes scoped to req.user (set by authMiddleware in index.js)

router.get('/', async (req, res, next) => {
    try {
        const filter = { user_id: req.user.id };
        // holder_id=family → self + family members (everyone except bookers)
        if (req.query.holder_id === 'family') filter.holder_id = { $in: await familyPersonIds(req.user.id) };
        else if (req.query.holder_id) filter.holder_id = req.query.holder_id;
        const cards = await Card.find(filter).populate(HOLDER_POPULATE).sort({ bank_name: 1, created_at: 1 });
        res.json(cards);
    } catch (err) { next(err); }
});

/**
 * @swagger
 * /cards/{id}/cashback-cycle:
 *   get:
 *     summary: Card cashback limit usage for the cycle containing a date
 *     tags: [Cards]
 *     parameters:
 *       - { in: query, name: date, schema: { type: string, format: date }, description: "Defaults to today" }
 *       - { in: query, name: exclude_order, schema: { type: string }, description: "Order being edited — its own cashback is not counted" }
 *     responses:
 *       200: { description: "{ enabled, percent, sites, limit, cycle: { start, end }, earned, remaining } — remaining is null when there's no limit" }
 */
router.get('/:id/cashback-cycle', idRule, validate, async (req, res, next) => {
    try {
        const card = await Card.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!card) return res.status(404).json({ error: 'Card not found' });
        const ref = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
            ? new Date(`${req.query.date}T00:00:00.000Z`)
            : todayAsUtcDate();
        const cycle = getCashbackCycle(card.cashback_reset_day, card.cashback_period, card.cashback_cycle_start_month, ref);
        const match = {
            user_id: card.user_id, card_id: card._id, delivery_status: { $ne: 'Cancelled' },
            order_date: { $gte: cycle.start, $lt: cycle.end },
        };
        if (req.query.exclude_order && mongoose.isValidObjectId(req.query.exclude_order)) {
            match._id = { $ne: new mongoose.Types.ObjectId(req.query.exclude_order) };
        }
        const [row] = await Order.aggregate([{ $match: match }, { $group: { _id: null, earned: { $sum: '$cashback' } } }]);
        const earned = row?.earned || 0;
        const limit = card.cashback_enabled ? (card.cashback_limit || 0) : 0;
        res.json({
            enabled: Boolean(card.cashback_enabled),
            percent: card.cashback_percent || 0,
            sites: card.cashback_sites || [],
            limit,
            cycle: { start: cycle.start.toISOString().slice(0, 10), end: cycle.end.toISOString().slice(0, 10) },
            earned,
            // 0 limit = no cap configured
            remaining: limit > 0 ? Math.max(0, limit - earned) : null,
        });
    } catch (err) { next(err); }
});

router.post('/', createRules, validate, async (req, res, next) => {
    try {
        const data = pickFields(req.body, CARD_FIELDS);
        data.user_id = req.user.id;
        const holderError = await resolveHolderFields(req, data);
        if (holderError) return res.status(400).json({ error: holderError });
        const created = await Card.create(data);
        const card = await created.populate(HOLDER_POPULATE);
        invalidateCache(req, 'cards');
        logActivity(req.user.id, 'created', 'card', card._id, `Added card: ${data.bank_name} •••• ${data.last_four_digit}`, card);
        res.status(201).json(card);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id', updateRules, validate, async (req, res, next) => {
    try {
        const data = pickFields(req.body, CARD_FIELDS);
        const oldCard = await Card.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!oldCard) return res.status(404).json({ error: 'Card not found' });
        const holderError = await resolveHolderFields(req, data, oldCard._id);
        if (holderError) return res.status(400).json({ error: holderError });

        // Moving a card that has orders to/from a booker (friend) would leave
        // those orders on the wrong profit formula and shift khata dues to a
        // different person. Edit or move the orders first.
        if (data.holder_id && String(data.holder_id) !== String(oldCard.holder_id)) {
            const [from, to] = await Promise.all([
                Person.findById(oldCard.holder_id, 'relation'),
                Person.findById(data.holder_id, 'relation'),
            ]);
            if (from?.relation === 'friend' || to?.relation === 'friend') {
                const orderCount = await Order.countDocuments({ user_id: req.user.id, card_id: oldCard._id });
                if (orderCount > 0) {
                    return res.status(400).json({ error: `This card has ${orderCount} order(s) booked as ${from?.relation === 'friend' ? "a booker's" : 'your/family'} card. Move those orders to another card before changing who holds it.` });
                }
            }
        }

        const card = await Card.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id },
            data,
            { new: true, runValidators: true }
        );
        // A card that became an add-on can no longer be anyone's primary
        if (card.card_type === 'addon') {
            await Card.updateMany({ user_id: req.user.id, primary_card_id: card._id }, { primary_card_id: null });
        }
        invalidateCache(req, 'cards');
        const changedFields = Object.keys(data).filter(k => String(oldCard[k]) !== String(card[k]));
        await card.populate(HOLDER_POPULATE);
        logActivity(req.user.id, 'updated', 'card', card._id, `Updated card: ${card.bank_name} •••• ${card.last_four_digit}`, card, changedFields);
        res.json(card);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', idRule, validate, async (req, res, next) => {
    try {
        // Orders reference their card for profit, holder and ITR reports —
        // deleting the card would orphan them, so block it (like buyers).
        const orderCount = await Order.countDocuments({ user_id: req.user.id, card_id: req.params.id });
        if (orderCount > 0) {
            return res.status(400).json({ error: `This card has ${orderCount} order(s). Delete or move those orders before deleting the card.` });
        }
        const card = await Card.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
        if (!card) return res.status(404).json({ error: 'Card not found' });
        await Transaction.deleteMany({ card_id: req.params.id });
        await Card.updateMany({ user_id: req.user.id, primary_card_id: card._id }, { primary_card_id: null });
        invalidateCache(req, 'cards');
        logActivity(req.user.id, 'deleted', 'card', card._id, `Deleted card: ${card.bank_name} •••• ${card.last_four_digit}`, card);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;

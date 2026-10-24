const express = require('express');
const router = express.Router();
const Person = require('../models/Person');
const Card = require('../models/Card');
const Order = require('../models/Order');
const BookerPayment = require('../models/BookerPayment');
const { khataTotalsByPerson, bookerKhataFeed } = require('../utils/bookerKhata');
const { body, param } = require('express-validator');
const { pickFields, toObjectId, buildDateRange, parsePagination, paginatedResponse } = require('../utils/helpers');
const { invalidateCache, cacheMiddleware } = require('../utils/cache');
const { logActivity } = require('../utils/activityLogger');
const { ensureSelfPerson } = require('../utils/people');
const { PROFIT_EXPR, FRIEND_EARNING_EXPR } = require('../utils/profit');
const validate = require('../middleware/validate');
const { createRules, updateRules, idRule } = require('../validators/people.validator');

/**
 * @swagger
 * /people:
 *   get:
 *     summary: List card holders (self, family, friends) with card/order stats
 *     tags: [People]
 *     parameters:
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date, description: "Order stats from this order date" }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Array of people with card_count, order_count, delivered_count, pending_count, pending_dues, total_order_amount, my_profit, total_friend_amount, friend_earning }
 *   post:
 *     summary: Add a family member or friend
 *     tags: [People]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, relation]
 *             properties:
 *               name: { type: string }
 *               relation: { type: string, enum: [family, friend] }
 *               phone: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Person created }
 * /people/{id}:
 *   get:
 *     summary: Get one person with stats
 *     tags: [People]
 *   put:
 *     summary: Update a person (self cannot change relation)
 *     tags: [People]
 *   delete:
 *     summary: Delete a person (blocked if they still hold cards; self cannot be deleted)
 *     tags: [People]
 */

const PERSON_FIELDS = ['name', 'relation', 'phone', 'notes'];
const RELATION_ORDER = { self: 0, family: 1, friend: 2 };
const EMPTY_STATS = {
    card_count: 0, order_count: 0, delivered_count: 0, pending_count: 0, total_order_amount: 0,
    my_profit: 0, total_friend_amount: 0, friend_earning: 0,
    // Friend khata (all-time, see utils/bookerKhata.js): owed on delivered
    // orders − advances − payments made
    total_due: 0, total_advance: 0, total_payments: 0, total_paid: 0, pending_dues: 0,
};

const STAT_KEYS = ['order_count', 'delivered_count', 'pending_count', 'total_order_amount', 'my_profit', 'total_friend_amount', 'friend_earning'];

// Roll up non-cancelled order stats per card holder, optionally within an
// order_date range.
async function statsByPerson(userId, personIds = null, orderDateRange = null) {
    const cardFilter = { user_id: userId };
    if (personIds) cardFilter.holder_id = { $in: personIds };
    const cards = await Card.find(cardFilter, '_id holder_id').lean();
    const holderByCard = new Map(cards.map(c => [c._id.toString(), c.holder_id.toString()]));

    const stats = new Map();
    const bucket = (pid) => {
        if (!stats.has(pid)) stats.set(pid, { ...EMPTY_STATS });
        return stats.get(pid);
    };
    for (const c of cards) bucket(c.holder_id.toString()).card_count += 1;
    if (!cards.length) return stats;

    const match = { user_id: toObjectId(userId), card_id: { $in: cards.map(c => c._id) }, delivery_status: { $ne: 'Cancelled' } };
    if (orderDateRange) match.order_date = orderDateRange;
    const rows = await Order.aggregate([
        { $match: match },
        { $group: {
            _id: '$card_id',
            order_count: { $sum: 1 },
            delivered_count: { $sum: { $cond: [{ $eq: ['$delivery_status', 'Delivered'] }, 1, 0] } },
            pending_count: { $sum: { $cond: [{ $eq: ['$delivery_status', 'Pending'] }, 1, 0] } },
            total_order_amount: { $sum: '$order_amount' },
            my_profit: { $sum: PROFIT_EXPR },
            total_friend_amount: { $sum: { $ifNull: ['$friend_amount', 0] } },
            friend_earning: { $sum: FRIEND_EARNING_EXPR },
        } },
    ]);
    for (const r of rows) {
        const s = bucket(holderByCard.get(r._id.toString()));
        for (const k of STAT_KEYS) s[k] += r[k];
    }
    return stats;
}

// Merge all-time khata totals into the stats of friends
async function addKhataTotals(userId, people, stats) {
    const friendIds = people.filter(p => p.relation === 'friend').map(p => p._id);
    const totals = await khataTotalsByPerson(userId, friendIds);
    for (const [pid, t] of totals) {
        if (!stats.has(pid)) stats.set(pid, { ...EMPTY_STATS });
        Object.assign(stats.get(pid), t);
    }
}

// Load a friend of the current user, or send 404/400
async function loadFriend(req, res) {
    const person = await Person.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!person) { res.status(404).json({ error: 'Person not found' }); return null; }
    if (person.relation !== 'friend') { res.status(400).json({ error: 'Khata is only available for bookers (friends)' }); return null; }
    return person;
}

const withStats = (person, stats) => ({ ...person.toObject(), ...(stats.get(person._id.toString()) || EMPTY_STATS) });

router.get('/', cacheMiddleware(300), async (req, res, next) => {
    try {
        await ensureSelfPerson(req.user.id, req.user.name);
        const filter = { user_id: req.user.id };
        if (req.query.relation) filter.relation = req.query.relation;
        const [people, stats] = await Promise.all([
            Person.find(filter),
            statsByPerson(req.user.id, null, buildDateRange(req.query.from_date, req.query.to_date)),
        ]);
        await addKhataTotals(req.user.id, people, stats);
        people.sort((a, b) => (RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation]) || a.name.localeCompare(b.name));
        res.json(people.map(p => withStats(p, stats)));
    } catch (err) { next(err); }
});

router.get('/:id', idRule, validate, cacheMiddleware(300), async (req, res, next) => {
    try {
        const person = await Person.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!person) return res.status(404).json({ error: 'Person not found' });
        const stats = await statsByPerson(req.user.id, [person._id]);
        await addKhataTotals(req.user.id, [person], stats);
        res.json(withStats(person, stats));
    } catch (err) { next(err); }
});

router.post('/', createRules, validate, async (req, res, next) => {
    try {
        const data = pickFields(req.body, PERSON_FIELDS);
        data.user_id = req.user.id;
        const person = await Person.create(data);
        invalidateCache(req, 'people');
        logActivity(req.user.id, 'created', 'person', person._id, `Added ${person.relation}: ${person.name}`, person);
        res.status(201).json({ ...person.toObject(), ...EMPTY_STATS });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id', updateRules, validate, async (req, res, next) => {
    try {
        const data = pickFields(req.body, PERSON_FIELDS);
        const old = await Person.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!old) return res.status(404).json({ error: 'Person not found' });
        if (old.relation === 'self' && data.relation && data.relation !== 'self') {
            return res.status(400).json({ error: 'Cannot change the relation of your own profile' });
        }
        if (old.relation === 'self') delete data.relation;

        // friend ↔ family changes which profit formula applies and whether a
        // khata exists, but past orders keep their friend amounts — block it
        // while the person still has orders (or booker payments).
        const crossesBookerLine = data.relation && (data.relation === 'friend') !== (old.relation === 'friend');
        if (crossesBookerLine) {
            const cardIds = (await Card.find({ user_id: req.user.id, holder_id: old._id }, '_id').lean()).map(c => c._id);
            const [orderCount, paymentCount] = await Promise.all([
                cardIds.length ? Order.countDocuments({ user_id: req.user.id, card_id: { $in: cardIds } }) : 0,
                BookerPayment.countDocuments({ user_id: req.user.id, person_id: old._id }),
            ]);
            if (orderCount || paymentCount) {
                return res.status(400).json({ error: `Can't change ${old.name} between Booker and Family while they have ${orderCount} order(s)${paymentCount ? ` and ${paymentCount} payment(s)` : ''}. Add them as a new person instead.` });
            }
        }

        const person = await Person.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id },
            data,
            { new: true, runValidators: true }
        );
        // Holder name/relation shows up in card listings and summary
        invalidateCache(req, 'people');
        const changedFields = Object.keys(data).filter(k => String(old[k]) !== String(person[k]));
        logActivity(req.user.id, 'updated', 'person', person._id, `Updated ${person.relation}: ${person.name}`, person, changedFields);
        res.json(person);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', idRule, validate, async (req, res, next) => {
    try {
        const person = await Person.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!person) return res.status(404).json({ error: 'Person not found' });
        if (person.relation === 'self') return res.status(400).json({ error: 'You cannot delete your own profile' });

        const cardCount = await Card.countDocuments({ user_id: req.user.id, holder_id: person._id });
        if (cardCount > 0) {
            return res.status(400).json({ error: `${person.name} still has ${cardCount} card(s). Delete or move them first.` });
        }
        await person.deleteOne();
        await BookerPayment.deleteMany({ user_id: req.user.id, person_id: person._id });
        invalidateCache(req, 'people');
        logActivity(req.user.id, 'deleted', 'person', person._id, `Deleted ${person.relation}: ${person.name}`, person);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ── Booker khata ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /people/{id}/khata:
 *   get:
 *     summary: Booker khata — delivered orders (owed), advances and payments with running balance (newest first)
 *     tags: [People]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *       - { in: query, name: all, schema: { type: boolean }, description: "Return every entry (for PDF)" }
 *     responses:
 *       200: { description: "{ items, page, totals }" }
 * /people/{id}/payments:
 *   post:
 *     summary: Record a payment made to a booker
 *     tags: [People]
 * /people/payments/{paymentId}:
 *   put:
 *     summary: Update a booker payment
 *     tags: [People]
 *   delete:
 *     summary: Delete a booker payment
 *     tags: [People]
 */
router.get('/:id/khata', idRule, validate, cacheMiddleware(300), async (req, res, next) => {
    try {
        const person = await loadFriend(req, res);
        if (!person) return;
        // ?all=true (PDF export) skips pagination; the feed comes back newest-first
        const all = req.query.all === 'true';
        const { pageNum, limitNum, skip } = parsePagination(req.query);
        const [{ items, total }, totals] = await Promise.all([
            bookerKhataFeed(req.user.id, person._id, all ? {} : { skip, limit: limitNum }),
            khataTotalsByPerson(req.user.id, [person._id]),
        ]);
        const t = totals.get(String(person._id));
        if (all) return res.json({ items, totals: t });
        res.json({ ...paginatedResponse(items, total, pageNum, limitNum), totals: t });
    } catch (err) { next(err); }
});

const paymentRules = (optional) => {
    const opt = (c) => (optional ? c.optional() : c);
    return [
        opt(body('amount').isFloat({ gt: 0 })).withMessage('Amount must be greater than 0'),
        opt(body('payment_date').isISO8601()).withMessage('payment_date must be a valid date'),
        body('notes').optional({ values: 'falsy' }).isString().isLength({ max: 200 }).withMessage('Notes must be 200 characters or fewer'),
    ];
};
const PAYMENT_FIELDS = ['amount', 'payment_date', 'notes'];
const paymentDesc = (p, name) => `Paid ₹${p.amount} to ${name}`;

router.post('/:id/payments', idRule, paymentRules(false), validate, async (req, res, next) => {
    try {
        const person = await loadFriend(req, res);
        if (!person) return;
        const data = pickFields(req.body, PAYMENT_FIELDS);
        const payment = await BookerPayment.create({ ...data, user_id: req.user.id, person_id: person._id });
        invalidateCache(req, 'booker_payments');
        logActivity(req.user.id, 'created', 'booker_payment', payment._id, paymentDesc(payment, person.name), payment);
        res.status(201).json(payment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

const paymentIdRule = [param('paymentId').isMongoId().withMessage('Invalid payment id')];

router.put('/payments/:paymentId', paymentIdRule, paymentRules(true), validate, async (req, res, next) => {
    try {
        const data = pickFields(req.body, PAYMENT_FIELDS);
        const old = await BookerPayment.findOne({ _id: req.params.paymentId, user_id: req.user.id });
        if (!old) return res.status(404).json({ error: 'Payment not found' });
        const payment = await BookerPayment.findOneAndUpdate({ _id: old._id }, data, { new: true, runValidators: true });
        invalidateCache(req, 'booker_payments');
        const person = await Person.findById(payment.person_id, 'name');
        const changed = Object.keys(data).filter(k => String(old[k]) !== String(payment[k]));
        logActivity(req.user.id, 'updated', 'booker_payment', payment._id, paymentDesc(payment, person?.name || 'booker'), payment, changed);
        res.json(payment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/payments/:paymentId', paymentIdRule, validate, async (req, res, next) => {
    try {
        const payment = await BookerPayment.findOneAndDelete({ _id: req.params.paymentId, user_id: req.user.id });
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        invalidateCache(req, 'booker_payments');
        const person = await Person.findById(payment.person_id, 'name');
        logActivity(req.user.id, 'deleted', 'booker_payment', payment._id, `Deleted payment ₹${payment.amount} to ${person?.name || 'booker'}`, payment);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;

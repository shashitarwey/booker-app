const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Card = require('../models/Card');
const Seller = require('../models/Seller');
const { PROFIT_EXPR, FRIEND_EARNING_EXPR } = require('../utils/profit');
const { familyPersonIds } = require('../utils/people');
const { pickFields, parsePagination, paginatedResponse, toObjectId, escapeRegex } = require('../utils/helpers');
const { invalidateCache } = require('../utils/cache');
const { logActivity } = require('../utils/activityLogger');
const validate = require('../middleware/validate');
const { createRules, updateRules, idRule, bulkStatusRules, bulkClearRules, bulkDeleteRules } = require('../validators/orders.validator');

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Get all orders with filters
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: order_date_from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: order_date_to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: delivery_date_from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: delivery_date_to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: seller_id
 *         schema: { type: string }
 *       - in: query
 *         name: card_id
 *         schema: { type: string }
 *       - in: query
 *         name: person_id
 *         schema: { type: string, description: "Only orders on cards held by this person, or 'family' for self + family" }
 *       - in: query
 *         name: delivery_status
 *         schema: { type: string, enum: [Delivered, Pending, Cancelled] }
 *       - in: query
 *         name: model_ordered
 *         schema: { type: string, description: "Free-text search (case-insensitive, literal substring) across model_ordered, variant, remark, id_used and ecomm_site" }
 *       - in: query
 *         name: ecomm_site
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of order objects }
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     responses:
 *       201: { description: Order created }
 * /orders/{id}:
 *   put:
 *     summary: Update an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Order updated }
 *   delete:
 *     summary: Delete an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Order deleted }
 */

// Allowed fields for order creation/update
const ORDER_FIELDS = [
    'card_id', 'seller_id', 'order_date', 'delivered_date',
    'order_amount', 'return_amount', 'quantity', 'cashback',
    'variant', 'model_ordered', 'id_used', 'delivery_status', 'ecomm_site', 'is_cleared', 'remark',
    'friend_amount', 'advance_amount', 'coupon_cashback', 'coupon_in_profit'
];

const CARD_POPULATE = {
    path: 'card_id',
    select: 'bank_name last_four_digit card_network card_type holder_id',
    populate: { path: 'holder_id', select: 'name relation' },
};

// True when a write touches any field resolveFriendAmount() is responsible for
const touchesFriendFields = (data) =>
    data.card_id !== undefined || data.friend_amount !== undefined || data.advance_amount !== undefined;

const toAmount = (raw) => (raw === '' || raw === null || raw === undefined ? NaN : Number(raw));

/**
 * Keep friend_amount / advance_amount consistent with the card's holder:
 *  - friend card  → friend_amount must be a number >= 0; optional
 *                   advance_amount must be 0..friend_amount (0 → null)
 *  - other cards  → both are null
 * Only runs when one of those fields (or the card) is part of the write, so
 * partial updates (remark, is_cleared…) never trip over it.
 * Returns an error message or null.
 */
function resolveFriendAmount(card, data, oldOrder = null) {
    if (!touchesFriendFields(data)) return null;

    const isFriendCard = card?.holder_id?.relation === 'friend';
    if (!isFriendCard) {
        data.friend_amount = null;
        data.advance_amount = null;
        return null;
    }
    const amount = toAmount(data.friend_amount !== undefined ? data.friend_amount : oldOrder?.friend_amount);
    if (!Number.isFinite(amount) || amount < 0) {
        return "Return amount to friend is required for orders on a friend's card";
    }
    data.friend_amount = amount;

    const rawAdvance = data.advance_amount !== undefined ? data.advance_amount : oldOrder?.advance_amount;
    const advance = rawAdvance === '' || rawAdvance === null || rawAdvance === undefined ? 0 : Number(rawAdvance);
    if (!Number.isFinite(advance) || advance < 0) return 'Advance amount must be 0 or more';
    if (advance > amount) return 'Advance cannot be more than the return amount to friend';
    data.advance_amount = advance > 0 ? advance : null;
    return null;
}

// Fetch a user's card with its holder populated (null if not found / not theirs)
const findUserCard = (userId, cardId) =>
    Card.findOne({ _id: cardId, user_id: userId }).populate('holder_id', 'name relation');

// Resolve ?person_id= into a card_id filter value. An explicit card_id must
// belong to that person, otherwise nothing matches.
async function personCardFilter(userId, personId, cardId) {
    const holder = personId === 'family' ? { $in: await familyPersonIds(userId) } : personId;
    const cards = await Card.find({ user_id: userId, holder_id: holder }, '_id').lean();
    const ids = cards.map(c => c._id.toString());
    if (cardId) return ids.includes(String(cardId)) ? [cardId] : [];
    return ids;
}

// Fields the ?model_ordered= free-text search looks in. The param keeps its
// old name because the client already sends it.
const SEARCH_FIELDS = ['model_ordered', 'variant', 'remark', 'id_used', 'ecomm_site'];

// Build the $or clause for a free-text search. Input is escaped so it's
// matched literally — a raw "(" used to throw (500) and arbitrary patterns
// allowed regex injection. Always combined with user_id in the caller, so the
// user_id-prefixed indexes still bound the scan. Plain RegExp values work in
// both find() and aggregate $match.
function buildSearchOr(term) {
    const needle = String(term).trim();
    if (!needle) return null;
    const re = new RegExp(escapeRegex(needle), 'i');
    return SEARCH_FIELDS.map(f => ({ [f]: re }));
}

// ── Activity-log snapshot labels ────────────────────────────────────────────
// Logged snapshots show card_id / seller_id as readable labels rather than
// ids. Shared by the single-order handlers and the bulk label maps.
const cardLabel = (c) => `${c.bank_name} •••• ${c.last_four_digit}`;
const sellerLabel = (s) => `${s.name}, ${s.city}`;

const LABEL_POPULATE = {
    card: { path: 'card_id', select: 'bank_name last_four_digit' },
    seller: { path: 'seller_id', select: 'name city' },
};

/**
 * Snapshot of an order for logActivity with card_id → "Bank •••• 1234" and
 * seller_id → "Name, City". A missing card/seller (e.g. card since deleted)
 * leaves the raw id in place.
 */
function orderSnapshot(order, card, seller) {
    const snap = order.toObject();
    if (card) snap.card_id = cardLabel(card);
    if (seller) snap.seller_id = sellerLabel(seller);
    return snap;
}

/**
 * Run a single-order query (findOneAndUpdate / findOneAndDelete), populating
 * only the label refs the handler doesn't already have loaded — so the
 * snapshot costs no extra round trips beyond the populate itself. The doc is
 * depopulated before returning so the response, changed-field diff and
 * snapshot all still see raw ids. Returns { order, card, seller }.
 */
async function execWithLabelRefs(query, known = {}) {
    let { card = null, seller = null } = known;
    if (!card) query.populate(LABEL_POPULATE.card);
    if (!seller) query.populate(LABEL_POPULATE.seller);
    const order = await query;
    if (order) {
        if (!card) card = order.card_id;
        if (!seller) seller = order.seller_id;
        order.depopulate();
    }
    return { order, card, seller };
}

// GET orders for the logged-in user with filters + server-side pagination
router.get('/', async (req, res, next) => {
    try {
        const {
            order_date_from, order_date_to,
            delivery_date_from, delivery_date_to,
            seller_id, card_id, delivery_status,
            model_ordered, ecomm_site, is_cleared,
            person_id, all
        } = req.query;

        const filter = { user_id: req.user.id };

        if (order_date_from || order_date_to) {
            filter.order_date = {};
            if (order_date_from) filter.order_date.$gte = order_date_from;
            if (order_date_to) filter.order_date.$lte = order_date_to;
        }

        if (delivery_date_from || delivery_date_to) {
            filter.delivered_date = {};
            if (delivery_date_from) filter.delivered_date.$gte = delivery_date_from;
            if (delivery_date_to) filter.delivered_date.$lte = delivery_date_to;
        }

        if (seller_id) filter.seller_id = seller_id;
        if (card_id) filter.card_id = card_id;
        let personCardIds = null;
        if (person_id) {
            if (person_id !== 'family' && !mongoose.isValidObjectId(person_id)) return res.status(400).json({ error: 'Invalid person_id' });
            personCardIds = await personCardFilter(req.user.id, person_id, card_id);
            filter.card_id = { $in: personCardIds };
        }
        if (delivery_status) filter.delivery_status = delivery_status;
        const searchOr = model_ordered ? buildSearchOr(model_ordered) : null;
        if (searchOr) filter.$or = searchOr;
        if (ecomm_site) filter.ecomm_site = ecomm_site;
        if (is_cleared === 'true') filter.is_cleared = true;
        else if (is_cleared === 'false') filter.is_cleared = false;

        const query = Order.find(filter)
            .populate(CARD_POPULATE)
            .populate('seller_id', 'name city')
            // Tie-break same-day orders by created_at desc so the most
            // recently added order surfaces at the top of its date group.
            .sort({ order_date: -1, created_at: -1 });

        if (all === 'true') {
            const orders = await query;
            return res.json(orders);
        }

        const { pageNum, limitNum, skip } = parsePagination(req.query);

        // Typed match for the profit-summary aggregation. Mongoose auto-casts
        // find() filters via the schema, but $match in aggregate() does not —
        // so user_id / dates / ref ids must be cast explicitly here, otherwise
        // a date or buyer filter would silently match nothing and the totals
        // would render as ₹0 even when rows are visible.
        // Profit excludes Cancelled orders to mirror the frontend's badge calc;
        // if the user filtered to Cancelled-only, the summary is trivially zero.
        const summaryMatch = { user_id: toObjectId(req.user.id) };
        if (order_date_from || order_date_to) {
            summaryMatch.order_date = {};
            if (order_date_from) summaryMatch.order_date.$gte = new Date(`${order_date_from}T00:00:00.000Z`);
            if (order_date_to) summaryMatch.order_date.$lte = new Date(`${order_date_to}T23:59:59.999Z`);
        }
        if (delivery_date_from || delivery_date_to) {
            summaryMatch.delivered_date = {};
            if (delivery_date_from) summaryMatch.delivered_date.$gte = new Date(`${delivery_date_from}T00:00:00.000Z`);
            if (delivery_date_to) summaryMatch.delivered_date.$lte = new Date(`${delivery_date_to}T23:59:59.999Z`);
        }
        if (seller_id) summaryMatch.seller_id = toObjectId(seller_id);
        if (card_id) summaryMatch.card_id = toObjectId(card_id);
        if (personCardIds) summaryMatch.card_id = { $in: personCardIds.map(toObjectId) };
        if (searchOr) summaryMatch.$or = searchOr;
        if (ecomm_site) summaryMatch.ecomm_site = ecomm_site;
        if (filter.is_cleared !== undefined) summaryMatch.is_cleared = filter.is_cleared;
        summaryMatch.delivery_status = delivery_status || { $ne: 'Cancelled' };

        const summaryPromise = delivery_status === 'Cancelled'
            ? Promise.resolve([])
            : Order.aggregate([
                { $match: summaryMatch },
                { $group: {
                    _id: null,
                    total_profit: { $sum: PROFIT_EXPR },
                    total_order_amount: { $sum: '$order_amount' },
                    total_friend_amount: { $sum: { $ifNull: ['$friend_amount', 0] } },
                    total_advance: { $sum: { $ifNull: ['$advance_amount', 0] } },
                    total_friend_earning: { $sum: FRIEND_EARNING_EXPR }
                }}
            ]);

        const [orders, total, totals] = await Promise.all([
            query.skip(skip).limit(limitNum),
            Order.countDocuments(filter),
            summaryPromise
        ]);

        const t = totals[0] || {};
        const summary = {
            total_profit: t.total_profit || 0,
            total_order_amount: t.total_order_amount || 0,
            total_friend_amount: t.total_friend_amount || 0,
            total_advance: t.total_advance || 0,
            total_friend_earning: t.total_friend_earning || 0,
        };

        res.json({ ...paginatedResponse(orders, total, pageNum, limitNum), summary });
    } catch (err) { next(err); }
});

// POST a new order — verify ownership of card_id and seller_id
router.post('/', createRules, validate, async (req, res, next) => {
    try {
        const data = pickFields(req.body, ORDER_FIELDS);
        // Strip empty delivered_date / delivery_status so Mongoose uses defaults
        // (delivered_date stays undefined, delivery_status defaults to 'Pending').
        // These are optional at creation and filled in later when delivered.
        if (!data.delivered_date) delete data.delivered_date;
        if (!data.delivery_status) delete data.delivery_status;
        data.user_id = req.user.id;

        // Verify the card belongs to the current user
        const card = await findUserCard(req.user.id, data.card_id);
        if (!card) return res.status(400).json({ error: 'Invalid card_id — card not found or not yours' });
        const friendError = resolveFriendAmount(card, data);
        if (friendError) return res.status(400).json({ error: friendError });

        // Verify the seller belongs to the current user
        let seller = null;
        if (data.seller_id) {
            seller = await Seller.findOne({ _id: data.seller_id, user_id: req.user.id });
            if (!seller) return res.status(400).json({ error: 'Invalid seller_id — seller not found or not yours' });
        }

        const newOrder = new Order(data);
        await newOrder.save();
        invalidateCache(req, 'orders');
        const orderDate = new Date(data.order_date).toLocaleDateString('en-GB');

        // Card + seller were already loaded by the ownership checks above
        const snap = orderSnapshot(newOrder, card, seller);

        logActivity(req.user.id, 'created', 'order', newOrder._id, `Added order: ${data.model_ordered} | ${data.ecomm_site} | ₹${data.order_amount} | ${orderDate}`, snap);
        res.status(201).json(newOrder);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update an order — verify ownership of card_id and seller_id if changed
router.put('/:id', updateRules, validate, async (req, res, next) => {
    try {
        const data = pickFields(req.body, ORDER_FIELDS);
        // An empty delivered_date means "clear it" (e.g. user reverted delivery
        // status from Yes back to No). Convert to null so Mongoose clears the
        // field instead of failing to cast '' to Date. If the field wasn't
        // sent at all, pickFields omits it and we leave it untouched.
        if (data.delivered_date === '') data.delivered_date = null;
        // delivery_status is an enum without a "blank" option — drop empty
        // values so the existing status is preserved on update.
        if (data.delivery_status === '') delete data.delivery_status;

        // Fetch old order to compute changed fields
        const oldOrder = await Order.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!oldOrder) return res.status(404).json({ error: 'Order not found' });

        // Verify the (new or existing) card belongs to the current user, and
        // keep friend_amount in step with the card holder. Both docs are
        // kept for the activity snapshot so it needn't re-read them.
        let card = null;
        let seller = null;
        if (touchesFriendFields(data)) {
            card = await findUserCard(req.user.id, data.card_id || oldOrder.card_id);
            if (!card) return res.status(400).json({ error: 'Invalid card_id — card not found or not yours' });
            const friendError = resolveFriendAmount(card, data, oldOrder);
            if (friendError) return res.status(400).json({ error: friendError });
        }

        // Verify the seller belongs to the current user if being changed
        if (data.seller_id) {
            seller = await Seller.findOne({ _id: data.seller_id, user_id: req.user.id });
            if (!seller) return res.status(400).json({ error: 'Invalid seller_id — seller not found or not yours' });
        }

        const { order: updatedOrder, card: cardDoc, seller: sellerDoc } = await execWithLabelRefs(
            Order.findOneAndUpdate(
                { _id: req.params.id, user_id: req.user.id },
                data,
                { new: true, runValidators: true }
            ),
            { card, seller }
        );
        invalidateCache(req, 'orders');

        // Compute which fields actually changed
        const changedFields = Object.keys(data).filter(k => String(oldOrder[k]) !== String(updatedOrder[k]));

        const oDate = new Date(updatedOrder.order_date).toLocaleDateString('en-GB');
        const orderTag = `${updatedOrder.model_ordered} | ${updatedOrder.ecomm_site} | ₹${updatedOrder.order_amount} | ${oDate}`;
        const desc = `Updated order: ${orderTag}`;

        const snap = orderSnapshot(updatedOrder, cardDoc, sellerDoc);

        logActivity(req.user.id, 'updated', 'order', updatedOrder._id, desc, snap, changedFields);
        res.json(updatedOrder);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE an order
router.delete('/:id', idRule, validate, async (req, res, next) => {
    try {
        const { order: deletedOrder, card: cardDoc, seller: sellerDoc } = await execWithLabelRefs(
            Order.findOneAndDelete({ _id: req.params.id, user_id: req.user.id })
        );
        if (!deletedOrder) return res.status(404).json({ error: 'Order not found' });
        invalidateCache(req, 'orders');
        const delDate = new Date(deletedOrder.order_date).toLocaleDateString('en-GB');

        const snap = orderSnapshot(deletedOrder, cardDoc, sellerDoc);

        logActivity(req.user.id, 'deleted', 'order', deletedOrder._id, `Deleted order: ${deletedOrder.model_ordered} | ${deletedOrder.ecomm_site} | ₹${deletedOrder.order_amount} | ${delDate}`, snap);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ── Bulk Actions ────────────────────────────────────────────────────────────

// Resolve card and seller name maps for a set of orders. Used by bulk
// handlers to attach human-readable labels to each per-order activity log
// snapshot (matches the pattern used by the single-order PUT/DELETE).
async function buildLabelMaps(userId, orders) {
    const cardIds = [...new Set(orders.map(o => o.card_id?.toString()).filter(Boolean))];
    const sellerIds = [...new Set(orders.map(o => o.seller_id?.toString()).filter(Boolean))];
    const [cards, sellers] = await Promise.all([
        Card.find({ _id: { $in: cardIds }, user_id: userId }, 'bank_name last_four_digit').lean(),
        Seller.find({ _id: { $in: sellerIds }, user_id: userId }, 'name city').lean(),
    ]);
    const cardMap = Object.fromEntries(cards.map(c => [c._id.toString(), cardLabel(c)]));
    const sellerMap = Object.fromEntries(sellers.map(s => [s._id.toString(), sellerLabel(s)]));
    return { cardMap, sellerMap };
}

function logOrderUpdate(userId, order, cardMap, sellerMap, changedFields) {
    const snap = order.toObject ? order.toObject() : { ...order };
    if (snap.card_id) snap.card_id = cardMap[snap.card_id.toString()] || snap.card_id;
    if (snap.seller_id) snap.seller_id = sellerMap[snap.seller_id.toString()] || snap.seller_id;
    const oDate = new Date(order.order_date).toLocaleDateString('en-GB');
    const desc = `Updated order: ${order.model_ordered} | ${order.ecomm_site} | ₹${order.order_amount} | ${oDate}`;
    logActivity(userId, 'updated', 'order', order._id, desc, snap, changedFields);
}

// POST bulk status update — logs one activity entry per affected order.
router.post('/bulk/status', bulkStatusRules, validate, async (req, res, next) => {
    try {
        const { ids, delivery_status, delivered_date } = req.body;
        const update = { delivery_status };
        if (delivery_status === 'Delivered' && delivered_date) {
            update.delivered_date = delivered_date;
        } else if (delivery_status !== 'Delivered') {
            update.delivered_date = null;
        }
        await Order.updateMany(
            { _id: { $in: ids }, user_id: req.user.id },
            update
        );
        invalidateCache(req, 'orders');

        // Re-fetch updated docs so each activity log has the post-update snapshot
        const updated = await Order.find({ _id: { $in: ids }, user_id: req.user.id });
        const { cardMap, sellerMap } = await buildLabelMaps(req.user.id, updated);
        const changedFields = Object.keys(update);
        for (const o of updated) logOrderUpdate(req.user.id, o, cardMap, sellerMap, changedFields);

        res.json({ success: true, modified: updated.length });
    } catch (err) { next(err); }
});

// POST bulk mark cleared / uncleared — logs one activity entry per order.
router.post('/bulk/clear', bulkClearRules, validate, async (req, res, next) => {
    try {
        const { ids, is_cleared } = req.body;
        await Order.updateMany(
            { _id: { $in: ids }, user_id: req.user.id },
            { is_cleared }
        );
        invalidateCache(req, 'orders');

        const updated = await Order.find({ _id: { $in: ids }, user_id: req.user.id });
        const { cardMap, sellerMap } = await buildLabelMaps(req.user.id, updated);
        for (const o of updated) logOrderUpdate(req.user.id, o, cardMap, sellerMap, ['is_cleared']);

        res.json({ success: true, modified: updated.length });
    } catch (err) { next(err); }
});

// POST bulk delete — logs one activity entry per deleted order.
router.post('/bulk/delete', bulkDeleteRules, validate, async (req, res, next) => {
    try {
        const { ids } = req.body;
        // Fetch BEFORE deleting so we have the snapshots for activity logs.
        const toDelete = await Order.find({ _id: { $in: ids }, user_id: req.user.id });
        const { cardMap, sellerMap } = await buildLabelMaps(req.user.id, toDelete);

        await Order.deleteMany({ _id: { $in: ids }, user_id: req.user.id });
        invalidateCache(req, 'orders');

        for (const o of toDelete) {
            const snap = o.toObject();
            if (snap.card_id) snap.card_id = cardMap[snap.card_id.toString()] || snap.card_id;
            if (snap.seller_id) snap.seller_id = sellerMap[snap.seller_id.toString()] || snap.seller_id;
            const oDate = new Date(o.order_date).toLocaleDateString('en-GB');
            const desc = `Deleted order: ${o.model_ordered} | ${o.ecomm_site} | ₹${o.order_amount} | ${oDate}`;
            logActivity(req.user.id, 'deleted', 'order', o._id, desc, snap);
        }

        res.json({ success: true, deleted: toDelete.length });
    } catch (err) { next(err); }
});

module.exports = router;

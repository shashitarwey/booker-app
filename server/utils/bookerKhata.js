const Card = require('../models/Card');
const Order = require('../models/Order');
const BookerPayment = require('../models/BookerPayment');
const { toObjectId } = require('./helpers');
const { runningBalanceFeed, byId } = require('./ledgerFeed');

/**
 * Booker (friend) khata — what the user owes a friend whose cards they use.
 *
 *   + Return to friend (Order.friend_amount) once the order is Delivered
 *   − Advance paid on an order (Order.advance_amount), from the order date
 *   − Payments recorded in the khata (BookerPayment)
 *
 * Balance > 0 → user still has to pay the friend. Pending orders are listed
 * but don't count until delivered; cancelled orders (and their advances)
 * never count. This matches the buyer ledger's semantics.
 */

async function friendCardIds(userId, personIds) {
    const cards = await Card.find({ user_id: userId, holder_id: { $in: personIds } }, '_id holder_id').lean();
    return { cards, holderByCard: new Map(cards.map(c => [String(c._id), String(c.holder_id)])) };
}

/** All-time khata totals per person: { total_due, total_advance, total_payments, total_paid, pending_dues }. */
async function khataTotalsByPerson(userId, personIds) {
    const out = new Map(personIds.map(id => [String(id), { total_due: 0, total_advance: 0, total_payments: 0, total_paid: 0, pending_dues: 0 }]));
    if (!personIds.length) return out;

    const { cards, holderByCard } = await friendCardIds(userId, personIds);
    const [orderRows, paymentRows] = await Promise.all([
        cards.length ? Order.aggregate([
            { $match: { user_id: toObjectId(userId), card_id: { $in: cards.map(c => c._id) }, delivery_status: { $ne: 'Cancelled' }, friend_amount: { $ne: null } } },
            { $group: {
                _id: '$card_id',
                total_due: { $sum: { $cond: [{ $eq: ['$delivery_status', 'Delivered'] }, '$friend_amount', 0] } },
                total_advance: { $sum: { $ifNull: ['$advance_amount', 0] } },
            } },
        ]) : [],
        BookerPayment.aggregate([
            { $match: { user_id: toObjectId(userId), person_id: { $in: personIds.map(toObjectId) } } },
            { $group: { _id: '$person_id', total: { $sum: '$amount' } } },
        ]),
    ]);

    for (const r of orderRows) {
        const t = out.get(holderByCard.get(String(r._id)));
        t.total_due += r.total_due;
        t.total_advance += r.total_advance;
    }
    for (const r of paymentRows) out.get(String(r._id)).total_payments += r.total;
    for (const t of out.values()) {
        t.total_paid = t.total_advance + t.total_payments;
        t.pending_dues = t.total_due - t.total_paid;
    }
    return out;
}

const khataLabel = (o) => `${o.model_ordered}${o.quantity > 1 ? ` ×${o.quantity}` : ''}${o.seller_id ? ` · ${o.seller_id.name}` : ''}`;

// Row kinds of the merged khata stream. `rank` orders orders/advances before
// payments on a date + created_at tie; `sub` keeps each advance right after
// its own order (they share date, created_at and _id).
const ORDER_ROW = { rank: 0, sub: 0 };
const ADVANCE_ROW = { rank: 0, sub: 1 };
const PAYMENT_ROW = { rank: 1, sub: 0 };
const KHATA_SORT = { date: 1, created_at: 1, rank: 1, _id: 1, sub: 1 };

// { rank: 0, sub: 1 } → { rank: { $literal: 0 }, sub: { $literal: 1 } } for $project
const literals = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { $literal: v }]));

function khataItem(r, order, payment) {
    if (r.rank === PAYMENT_ROW.rank) {
        return {
            id: payment._id, type: 'PAYMENT', subtype: 'payment', date: payment.payment_date, amount: payment.amount,
            description: payment.notes || 'Payment made', isPending: false, isCancelled: false, raw: payment,
            runningBalance: r.runningBalance,
        };
    }
    const isCancelled = order.delivery_status === 'Cancelled';
    if (r.sub === ADVANCE_ROW.sub) {
        return {
            id: `${order._id}-adv`, type: 'PAYMENT', subtype: 'advance', order_id: order._id,
            date: order.order_date, amount: order.advance_amount,
            description: `Advance · ${khataLabel(order)}`, isPending: false, isCancelled,
            raw: { created_at: order.created_at },
            runningBalance: r.runningBalance,
        };
    }
    return {
        id: order._id, type: 'ORDER', date: order.order_date, amount: order.friend_amount,
        description: khataLabel(order), isPending: order.delivery_status === 'Pending', isCancelled, raw: order,
        runningBalance: r.runningBalance,
    };
}

/**
 * Khata feed for one friend, newest → oldest, with running balance.
 *
 * Items: friend orders (+friend_amount once Delivered), a synthetic advance
 * payment per order with advance_amount > 0 (dated on the order, cancelled
 * with it) and BookerPayments (−amount). MongoDB merges the three streams,
 * computes the running balance and paginates (utils/ledgerFeed.js); only the
 * returned page is loaded in full. Omit `limit` to get every item (PDFs).
 *
 * @returns {Promise<{ items: Object[], total: number }>}
 */
async function bookerKhataFeed(userId, personId, { skip = 0, limit } = {}) {
    const { cards } = await friendCardIds(userId, [personId]);
    const orderMatch = { user_id: toObjectId(userId), card_id: { $in: cards.map(c => c._id) }, friend_amount: { $ne: null } };
    const status = '$delivery_status';

    const { rows, total } = await runningBalanceFeed(Order, [
        { $match: orderMatch },
        { $project: {
            ...literals(ORDER_ROW), date: '$order_date', created_at: 1,
            // Pending orders aren't owed yet and cancelled ones never are; both are still listed
            delta: { $cond: [{ $in: [status, ['Pending', 'Cancelled']] }, 0, '$friend_amount'] },
        } },
        { $unionWith: { coll: Order.collection.name, pipeline: [
            { $match: { ...orderMatch, advance_amount: { $gt: 0 } } },
            { $project: {
                ...literals(ADVANCE_ROW), date: '$order_date', created_at: 1,
                delta: { $cond: [{ $eq: [status, 'Cancelled'] }, 0, { $subtract: [0, '$advance_amount'] }] },
            } },
        ] } },
        { $unionWith: { coll: BookerPayment.collection.name, pipeline: [
            { $match: { user_id: toObjectId(userId), person_id: toObjectId(personId) } },
            { $project: {
                ...literals(PAYMENT_ROW), date: '$payment_date', created_at: 1,
                delta: { $subtract: [0, '$amount'] },
            } },
        ] } },
    ], { sortBy: KHATA_SORT, delta: '$delta', skip, limit });

    // Hydrate just the returned rows (orders feed both ORDER and advance items)
    const idsOf = (rank) => [...new Set(rows.filter(r => r.rank === rank).map(r => String(r._id)))];
    const [orders, payments] = await Promise.all([
        Order.find({ _id: { $in: idsOf(ORDER_ROW.rank) }, user_id: userId })
            .populate('seller_id', 'name city')
            .populate('card_id', 'bank_name last_four_digit')
            .lean(),
        BookerPayment.find({ _id: { $in: idsOf(PAYMENT_ROW.rank) }, user_id: userId }).lean(),
    ]);
    const orderById = byId(orders);
    const paymentById = byId(payments);

    const items = [];
    for (const r of rows) {
        const order = orderById.get(String(r._id));
        const payment = paymentById.get(String(r._id));
        // A document deleted between the two queries is simply dropped
        if (r.rank === PAYMENT_ROW.rank ? payment : order) items.push(khataItem(r, order, payment));
    }
    return { items, total };
}

module.exports = { khataTotalsByPerson, bookerKhataFeed };

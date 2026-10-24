const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Card = require('../models/Card');
const Person = require('../models/Person');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const { toObjectId, buildDateRange } = require('../utils/helpers');
const { ensureSelfPerson } = require('../utils/people');
const { cacheMiddleware } = require('../utils/cache');

/**
 * @swagger
 * /reports/spends:
 *   get:
 *     summary: Card spend report per person → bank → card (for ITR / SFT)
 *     description: >
 *       Spend = card transactions + non-cancelled orders, by transaction date /
 *       order date. Primary cards also carry `billed_total` (own spend + spend on
 *       linked add-on cards), which is what the bank bills the primary holder.
 *     tags: [Reports]
 *     parameters:
 *       - { in: query, name: from_date, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: to_date, required: true, schema: { type: string, format: date } }
 *       - { in: query, name: person_id, schema: { type: string }, description: "Only this person" }
 *       - { in: query, name: relations, schema: { type: string }, description: "Comma list, default self,family" }
 *       - { in: query, name: include_items, schema: { type: boolean }, description: "Also return every spend entry" }
 *     responses:
 *       200: { description: "{ from_date, to_date, months, people: [...], items? }" }
 */

// Aggregate SFT threshold for credit card bill payments (non-cash) per FY
const SFT_THRESHOLD = 1000000;
const RELATIONS = ['self', 'family', 'friend'];

// All 'YYYY-MM' keys between two dates (inclusive)
function monthKeys(from, to) {
    const keys = [];
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (d <= to) {
        keys.push(d.toISOString().slice(0, 7));
        d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return keys;
}

router.get('/spends', cacheMiddleware(300), async (req, res, next) => {
    try {
        const { from_date, to_date, person_id, include_items } = req.query;
        if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date are required' });
        if (person_id && !mongoose.isValidObjectId(person_id)) return res.status(400).json({ error: 'Invalid person_id' });
        const relations = (req.query.relations || 'self,family').split(',').map(r => r.trim()).filter(r => RELATIONS.includes(r));
        if (!relations.length) return res.status(400).json({ error: `relations must be from ${RELATIONS.join(', ')}` });

        const range = buildDateRange(from_date, to_date);
        const userId = req.user.id;
        await ensureSelfPerson(userId, req.user.name);

        // Spends are computed for ALL the user's cards so a primary card's
        // billed total can include add-ons held by anyone.
        const [people, cards] = await Promise.all([
            Person.find({ user_id: userId }).lean(),
            Card.find({ user_id: userId }).lean(),
        ]);
        const cardIds = cards.map(c => c._id);

        const [txAgg, ordAgg] = await Promise.all([
            Transaction.aggregate([
                { $match: { card_id: { $in: cardIds }, date: range } },
                { $group: {
                    _id: { card: '$card_id', month: { $dateToString: { format: '%Y-%m', date: '$date' } } },
                    total: { $sum: '$amount' }, count: { $sum: 1 },
                } },
            ]),
            Order.aggregate([
                { $match: { user_id: toObjectId(userId), card_id: { $in: cardIds }, order_date: range, delivery_status: { $ne: 'Cancelled' } } },
                { $group: {
                    _id: { card: '$card_id', month: { $dateToString: { format: '%Y-%m', date: '$order_date' } } },
                    total: { $sum: '$order_amount' }, count: { $sum: 1 },
                } },
            ]),
        ]);

        const months = monthKeys(range.$gte, range.$lte);
        const spend = new Map(cards.map(c => [String(c._id), {
            txn_total: 0, order_total: 0, txn_count: 0, order_count: 0,
            monthly: Object.fromEntries(months.map(m => [m, 0])),
        }]));
        for (const [rows, kind] of [[txAgg, 'txn'], [ordAgg, 'order']]) {
            for (const r of rows) {
                const s = spend.get(String(r._id.card));
                s[`${kind}_total`] += r.total;
                s[`${kind}_count`] += r.count;
                s.monthly[r._id.month] = (s.monthly[r._id.month] || 0) + r.total;
            }
        }
        const totalOf = (id) => { const s = spend.get(String(id)); return s.txn_total + s.order_total; };

        const personById = new Map(people.map(p => [String(p._id), p]));
        const cardById = new Map(cards.map(c => [String(c._id), c]));
        const addonsByPrimary = new Map();
        for (const c of cards) {
            if (c.card_type === 'addon' && c.primary_card_id) {
                const k = String(c.primary_card_id);
                if (!addonsByPrimary.has(k)) addonsByPrimary.set(k, []);
                addonsByPrimary.get(k).push(c);
            }
        }

        const holderLabel = (c) => personById.get(String(c.holder_id))?.name || '';
        const cardRow = (c) => {
            const s = spend.get(String(c._id));
            const total_spend = s.txn_total + s.order_total;
            const row = {
                _id: c._id, bank_name: c.bank_name, card_network: c.card_network,
                last_four_digit: c.last_four_digit, name_on_card: c.name_on_card,
                card_type: c.card_type || 'primary',
                txn_total: s.txn_total, order_total: s.order_total,
                txn_count: s.txn_count, order_count: s.order_count,
                total_spend,
                monthly: months.map(m => s.monthly[m] || 0),
            };
            if (row.card_type === 'addon') {
                const primary = c.primary_card_id && cardById.get(String(c.primary_card_id));
                row.primary_card = primary
                    ? { _id: primary._id, bank_name: primary.bank_name, last_four_digit: primary.last_four_digit, holder_name: holderLabel(primary) }
                    : null;
                // Unlinked add-on (no/deleted primary): billed to its own holder,
                // same rule as the person page's bank summary
                if (!primary) row.billed_total = total_spend;
            } else {
                const addons = addonsByPrimary.get(String(c._id)) || [];
                row.addons = addons.map(a => ({
                    _id: a._id, last_four_digit: a.last_four_digit, holder_name: holderLabel(a), total_spend: totalOf(a._id),
                }));
                row.addon_spend = row.addons.reduce((sum, a) => sum + a.total_spend, 0);
                row.billed_total = total_spend + row.addon_spend;
            }
            return row;
        };

        const RELATION_ORDER = { self: 0, family: 1, friend: 2 };
        const scoped = people
            .filter(p => relations.includes(p.relation) && (!person_id || String(p._id) === person_id))
            .sort((a, b) => (RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation]) || a.name.localeCompare(b.name));

        const out = scoped.map(p => {
            const rows = cards.filter(c => String(c.holder_id) === String(p._id)).map(cardRow);
            const bankMap = new Map();
            for (const r of rows) {
                if (!bankMap.has(r.bank_name)) bankMap.set(r.bank_name, []);
                bankMap.get(r.bank_name).push(r);
            }
            const banks = [...bankMap.entries()]
                .map(([bank_name, bankCards]) => {
                    bankCards.sort((a, b) => (a.card_type === b.card_type ? 0 : a.card_type === 'primary' ? -1 : 1) || a.last_four_digit.localeCompare(b.last_four_digit));
                    // Billed to this person = their primary cards incl. add-ons
                    const billed_total = bankCards.reduce((s, c) => s + (c.billed_total || 0), 0);
                    return {
                        bank_name,
                        total_spend: bankCards.reduce((s, c) => s + c.total_spend, 0),
                        billed_total,
                        sft_reportable: billed_total >= SFT_THRESHOLD,
                        cards: bankCards,
                    };
                })
                .sort((a, b) => b.total_spend - a.total_spend || a.bank_name.localeCompare(b.bank_name));

            return {
                _id: p._id, name: p.name, relation: p.relation,
                card_count: rows.length,
                txn_total: rows.reduce((s, c) => s + c.txn_total, 0),
                order_total: rows.reduce((s, c) => s + c.order_total, 0),
                total_spend: rows.reduce((s, c) => s + c.total_spend, 0),
                billed_total: banks.reduce((s, b) => s + b.billed_total, 0),
                monthly: months.map((_, i) => rows.reduce((s, c) => s + c.monthly[i], 0)),
                banks,
            };
        });

        const response = { from_date, to_date, months, sft_threshold: SFT_THRESHOLD, people: out };

        if (include_items === 'true') {
            const scopedCardIds = cards
                .filter(c => out.some(p => String(p._id) === String(c.holder_id)))
                .map(c => c._id);
            const [txns, orders] = await Promise.all([
                Transaction.find({ card_id: { $in: scopedCardIds }, date: range }).sort({ date: 1 }).lean(),
                Order.find({ user_id: userId, card_id: { $in: scopedCardIds }, order_date: range, delivery_status: { $ne: 'Cancelled' } })
                    .populate('seller_id', 'name city').sort({ order_date: 1 }).lean(),
            ]);
            response.items = [
                ...txns.map(t => ({ date: t.date, card_id: t.card_id, source: 'Transaction', description: t.description || '', amount: t.amount })),
                ...orders.map(o => ({
                    date: o.order_date, card_id: o.card_id, source: 'Order',
                    description: [o.model_ordered, o.variant && o.variant !== 'NA' ? o.variant : '', o.quantity > 1 ? `×${o.quantity}` : '', `· ${o.ecomm_site}`, o.seller_id ? `· ${o.seller_id.name}` : '']
                        .filter(Boolean).join(' '),
                    amount: o.order_amount,
                })),
            ].sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        res.json(response);
    } catch (err) { next(err); }
});

module.exports = router;

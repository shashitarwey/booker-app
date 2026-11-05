const express = require('express');
const router = express.Router();
const BankAccount = require('../models/BankAccount');
const IpoApplication = require('../models/IpoApplication');
const IpoApplicant = require('../models/IpoApplicant');
const Order = require('../models/Order');
const SellerPayment = require('../models/SellerPayment');
const { toObjectId, escapeRegex } = require('../utils/helpers');
const { ipoShares, ipoStatus, summarize: summarizeIpo } = require('../utils/ipo');
const { logActivity } = require('../utils/activityLogger');
const validate = require('../middleware/validate');
const { createRules, updateRules, idRule, summaryRules, holderSummaryRules, holderRenameRules } = require('../validators/bankAccounts.validator');

/**
 * @swagger
 * /bank-accounts:
 *   get:
 *     summary: "The user's bank accounts (shared across features) with usage counts and card advances still to return (advance_to_return)"
 *     tags: [Bank Accounts]
 *   post:
 *     summary: Add a bank account
 *     tags: [Bank Accounts]
 * /bank-accounts/summary:
 *   get:
 *     summary: "All accounts of one person (?holder=name, case-insensitive) combined; same shape as /{id}/summary"
 *     tags: [Bank Accounts]
 * /bank-accounts/holder:
 *   put:
 *     summary: "Rename a person: { from, to } updates holder_name on all their accounts"
 *     tags: [Bank Accounts]
 * /bank-accounts/{id}/summary:
 *   get:
 *     summary: "One account; received, advanced and IPO kept apart: money received per buyer (payment date), card advances per buyer and card (order date), IPOs applied from it (applied date). Query from_date / to_date"
 *     tags: [Bank Accounts]
 * /bank-accounts/{id}:
 *   put:
 *     summary: Update a bank account
 *     tags: [Bank Accounts]
 *   delete:
 *     summary: Delete a bank account (blocked while anything uses it)
 *     tags: [Bank Accounts]
 */

// Every collection that references a bank account. New features add a row here.
const USAGE = [
    { model: IpoApplication, field: 'bank_account_id', what: 'IPO application' },
    { model: IpoApplicant, field: 'default_bank_account_id', what: 'IPO applicant (default bank)' },
    { model: Order, field: 'card_advance_bank_id', what: 'order card advance' },
    { model: SellerPayment, field: 'bank_account_id', what: 'buyer payment' },
];

// Same person = same holder name, ignoring case and outer spaces
const holderMatch = (name) => ({ holder_name: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i') });

// Reuse the spelling of an existing person ("mummy" → "Mummy")
async function canonicalHolder(userId, name) {
    const existing = await BankAccount.findOne({ user_id: userId, ...holderMatch(name) }, 'holder_name').lean();
    return existing ? existing.holder_name : String(name).trim();
}

const label = (b) => `${b.holder_name} · ${b.bank_name}${b.account_last4 ? ` ••${b.account_last4}` : ''}`;

async function usageCounts(userId, ids) {
    const counts = new Map();
    await Promise.all(USAGE.map(async ({ model, field }) => {
        const rows = await model.aggregate([
            { $match: { user_id: userId, [field]: { $in: ids } } },
            { $group: { _id: '$' + field, n: { $sum: 1 } } },
        ]);
        for (const r of rows) counts.set(String(r._id), (counts.get(String(r._id)) || 0) + r.n);
    }));
    return counts;
}

// Card advances not yet returned to each account
async function pendingAdvances(userId) {
    const rows = await Order.aggregate([
        { $match: { user_id: userId, card_advance_amount: { $gt: 0 }, card_advance_returned: false } },
        { $group: { _id: '$card_advance_bank_id', amount: { $sum: '$card_advance_amount' }, count: { $sum: 1 } } },
    ]);
    return new Map(rows.map(r => [String(r._id), { amount: r.amount, count: r.count }]));
}

// All-time money received from buyers into each account
async function receivedTotals(userId) {
    const rows = await SellerPayment.aggregate([
        { $match: { user_id: userId, bank_account_id: { $ne: null } } },
        { $group: { _id: '$bank_account_id', amount: { $sum: '$amount' } } },
    ]);
    return new Map(rows.map(r => [String(r._id), r.amount]));
}

router.get('/', async (req, res, next) => {
    try {
        const uid = toObjectId(req.user.id);
        const accounts = await BankAccount.find({ user_id: uid }).sort({ holder_name: 1, bank_name: 1 }).lean();
        const [counts, pending, received] = await Promise.all([
            usageCounts(uid, accounts.map(a => a._id)), pendingAdvances(uid), receivedTotals(uid),
        ]);
        res.json(accounts.map(a => {
            const p = pending.get(String(a._id)) || { amount: 0, count: 0 };
            return {
                ...a, label: label(a), usage_count: counts.get(String(a._id)) || 0,
                advance_to_return: p.amount, advance_to_return_count: p.count,
                received_total: received.get(String(a._id)) || 0,
            };
        }));
    } catch (err) { next(err); }
});

// Summary over one or more accounts: received and advanced kept apart.
// Received is dated by payment date, advances by order date.
async function buildSummary(uid, accounts, { from_date, to_date }) {
    const ids = accounts.map(a => a._id);
    const labelOf = new Map(accounts.map(a => [String(a._id), label(a)]));
    const range = from_date || to_date
        ? { ...(from_date && { $gte: new Date(from_date) }), ...(to_date && { $lte: new Date(to_date) }) }
        : null;
    const payMatch = { user_id: uid, bank_account_id: { $in: ids }, ...(range && { payment_date: range }) };
    const advMatch = { user_id: uid, card_advance_bank_id: { $in: ids }, card_advance_amount: { $gt: 0 }, ...(range && { order_date: range }) };

    const [bySeller, payments, advances, receivedByAccount, ipo] = await Promise.all([
        SellerPayment.aggregate([
            { $match: payMatch },
            { $group: { _id: '$seller_id', amount: { $sum: '$amount' }, count: { $sum: 1 }, last_date: { $max: '$payment_date' } } },
            { $lookup: { from: 'sellers', localField: '_id', foreignField: '_id', as: 's' } },
            { $project: { _id: 0, seller_id: '$_id', amount: 1, count: 1, last_date: 1, name: { $ifNull: [{ $first: '$s.name' }, 'Deleted buyer'] }, city: { $first: '$s.city' } } },
            { $sort: { amount: -1, name: 1 } },
        ]),
        SellerPayment.find(payMatch).populate('seller_id', 'name').sort({ payment_date: -1, created_at: -1 }).limit(200).lean(),
        Order.find(advMatch)
            .select('order_date model_ordered quantity order_amount card_advance_amount card_advance_returned card_advance_bank_id seller_id card_id delivery_status')
            .populate('seller_id', 'name')
            .populate({ path: 'card_id', select: 'bank_name last_four_digit holder_id', populate: { path: 'holder_id', select: 'name relation' } })
            .sort({ order_date: -1, created_at: -1 })
            .lean(),
        SellerPayment.aggregate([
            { $match: payMatch },
            { $group: { _id: '$bank_account_id', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        // IPOs are dated by when they were applied
        IpoApplication.find({ user_id: uid, bank_account_id: { $in: ids }, ...(range && { created_at: range }) })
            .populate('applicant_id', 'name')
            .sort({ created_at: -1, _id: -1 })
            .lean(),
    ]);

    const advanceItems = advances.map(o => ({
        order_id: o._id,
        order_date: o.order_date,
        item: `${o.model_ordered}${o.quantity > 1 ? ` ×${o.quantity}` : ''}`,
        order_amount: o.order_amount,
        amount: o.card_advance_amount,
        returned: o.card_advance_returned === true,
        delivery_status: o.delivery_status,
        bank_account_id: o.card_advance_bank_id,
        bank_label: labelOf.get(String(o.card_advance_bank_id)) || '',
        seller_id: o.seller_id?._id || o.seller_id,
        seller_name: o.seller_id?.name || 'Deleted buyer',
        card_label: o.card_id ? `${o.card_id.bank_name} ••${o.card_id.last_four_digit}` : 'Deleted card',
        card_holder: o.card_id?.holder_id?.relation === 'self' ? 'You' : (o.card_id?.holder_id?.name || ''),
    }));
    const sumOf = (rows) => rows.reduce((t, r) => t + r.amount, 0);
    const pendingRows = advanceItems.filter(a => !a.returned);
    // Per buyer: advanced, and how much of it is still to come back
    const advBySeller = new Map();
    for (const a of advanceItems) {
        const k = String(a.seller_id);
        const row = advBySeller.get(k) || { seller_id: a.seller_id, name: a.seller_name, amount: 0, to_return: 0, count: 0 };
        row.amount += a.amount;
        row.count += 1;
        if (!a.returned) row.to_return += a.amount;
        advBySeller.set(k, row);
    }

    // IPOs applied from these accounts (money blocked / used for allotted lots)
    const ipoItems = ipo.map(a => ({
        _id: a._id,
        ipo_name: a.ipo_name,
        applied_at: a.created_at,
        applicant_id: a.applicant_id?._id || a.applicant_id,
        applicant_name: a.applicant_id?.name || 'Deleted applicant',
        bank_account_id: a.bank_account_id,
        bank_label: labelOf.get(String(a.bank_account_id)) || '',
        lot_price: a.lot_price,
        profit_share_percent: a.profit_share_percent,
        allotted: a.allotted,
        sell_price: a.sell_price,
        status: ipoStatus(a),
        ...ipoShares(a),
    }));

    // Each account on its own (the person page shows one card per bank)
    const per = new Map(accounts.map(a => [String(a._id), { received: 0, received_count: 0, advanced: 0, to_return: 0, advanced_count: 0, ipo_count: 0, ipo_invested: 0 }]));
    for (const a of ipoItems) {
        const row = per.get(String(a.bank_account_id));
        if (!row) continue;
        row.ipo_count += 1;
        if (a.allotted) row.ipo_invested += a.lot_price;
    }
    for (const r of receivedByAccount) {
        const row = per.get(String(r._id));
        if (row) { row.received = r.amount; row.received_count = r.count; }
    }
    for (const a of advanceItems) {
        const row = per.get(String(a.bank_account_id));
        if (!row) continue;
        row.advanced += a.amount;
        row.advanced_count += 1;
        if (!a.returned) row.to_return += a.amount;
    }

    return {
        accounts: accounts.map(a => ({ ...a, label: label(a), ...per.get(String(a._id)) })),
        received: {
            total: sumOf(bySeller),
            count: bySeller.reduce((t, r) => t + r.count, 0),
            by_seller: bySeller,
            payments: payments.map(p => ({
                _id: p._id, amount: p.amount, payment_date: p.payment_date, notes: p.notes,
                bank_account_id: p.bank_account_id, bank_label: labelOf.get(String(p.bank_account_id)) || '',
                seller_id: p.seller_id?._id || p.seller_id, seller_name: p.seller_id?.name || 'Deleted buyer',
            })),
        },
        advanced: {
            total: sumOf(advanceItems),
            count: advanceItems.length,
            to_return: sumOf(pendingRows),
            to_return_count: pendingRows.length,
            returned: sumOf(advanceItems) - sumOf(pendingRows),
            by_seller: [...advBySeller.values()].sort((x, y) => y.amount - x.amount || x.name.localeCompare(y.name)),
            items: advanceItems,
        },
        ipo: { ...summarizeIpo(ipo), items: ipoItems },
    };
}


// All of one person's accounts together
router.get('/summary', holderSummaryRules, validate, async (req, res, next) => {
    try {
        const uid = toObjectId(req.user.id);
        const accounts = await BankAccount.find({ user_id: uid, ...holderMatch(req.query.holder) }).sort({ bank_name: 1 }).lean();
        if (accounts.length === 0) return res.status(404).json({ error: 'No bank accounts for that person' });
        res.json(await buildSummary(uid, accounts, req.query));
    } catch (err) { next(err); }
});

router.get('/:id/summary', summaryRules, validate, async (req, res, next) => {
    try {
        const uid = toObjectId(req.user.id);
        const account = await BankAccount.findOne({ _id: req.params.id, user_id: uid }).lean();
        if (!account) return res.status(404).json({ error: 'Bank account not found' });
        const summary = await buildSummary(uid, [account], req.query);
        res.json({ ...summary, account: summary.accounts[0] });
    } catch (err) { next(err); }
});

// Rename a person: every account with that holder name
router.put('/holder', holderRenameRules, validate, async (req, res, next) => {
    try {
        const to = req.body.to.trim();
        const result = await BankAccount.updateMany({ user_id: req.user.id, ...holderMatch(req.body.from) }, { $set: { holder_name: to } });
        if (result.matchedCount === 0) return res.status(404).json({ error: 'No bank accounts for that person' });
        logActivity(req.user.id, 'updated', 'bank_account', null, `Renamed account holder ${req.body.from} → ${to} (${result.modifiedCount} accounts)`, null, ['holder_name']);
        res.json({ success: true, updated: result.modifiedCount });
    } catch (err) { next(err); }
});

router.post('/', createRules, validate, async (req, res, next) => {
    try {
        const { bank_name, account_last4 } = req.body;
        const holder_name = await canonicalHolder(req.user.id, req.body.holder_name);
        const created = await BankAccount.create({ user_id: req.user.id, holder_name, bank_name, account_last4: account_last4 || '' });
        logActivity(req.user.id, 'created', 'bank_account', created._id, `Added bank account: ${label(created)}`, created);
        res.status(201).json({ ...created.toObject(), label: label(created), usage_count: 0 });
    } catch (err) { next(err); }
});

router.put('/:id', updateRules, validate, async (req, res, next) => {
    try {
        const account = await BankAccount.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!account) return res.status(404).json({ error: 'Bank account not found' });
        const old = account.toObject();
        for (const k of ['bank_name', 'account_last4']) {
            if (req.body[k] !== undefined) account[k] = req.body[k];
        }
        if (req.body.holder_name !== undefined) account.holder_name = await canonicalHolder(req.user.id, req.body.holder_name);
        await account.save();
        const changed = ['holder_name', 'bank_name', 'account_last4'].filter(k => old[k] !== account[k]);
        logActivity(req.user.id, 'updated', 'bank_account', account._id, `Updated bank account: ${label(account)}`, account, changed);
        res.json({ ...account.toObject(), label: label(account) });
    } catch (err) { next(err); }
});

router.delete('/:id', idRule, validate, async (req, res, next) => {
    try {
        const account = await BankAccount.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!account) return res.status(404).json({ error: 'Bank account not found' });
        for (const { model, field, what } of USAGE) {
            const n = await model.countDocuments({ user_id: account.user_id, [field]: account._id });
            if (n > 0) return res.status(400).json({ error: `Used by ${n} ${what}${n > 1 ? 's' : ''}. Change those first.` });
        }
        await account.deleteOne();
        logActivity(req.user.id, 'deleted', 'bank_account', account._id, `Deleted bank account: ${label(account)}`, account);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;

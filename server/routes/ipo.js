const express = require('express');
const router = express.Router();
const IpoApplicant = require('../models/IpoApplicant');
const IpoApplication = require('../models/IpoApplication');
const BankAccount = require('../models/BankAccount');
const { toObjectId } = require('../utils/helpers');
const { ipoShares, ipoStatus, summarize } = require('../utils/ipo');
const { logActivity } = require('../utils/activityLogger');
const validate = require('../middleware/validate');
const {
    applicantCreateRules, applicantUpdateRules, idRule, listRules,
    applicationCreateRules, applicationUpdateRules,
} = require('../validators/ipo.validator');

/**
 * @swagger
 * /ipo/applicants:
 *   get:
 *     summary: IPO applicants with their application counts and profit split
 *     tags: [IPO]
 *   post:
 *     summary: Add an IPO applicant
 *     tags: [IPO]
 * /ipo/applicants/{id}:
 *   put:
 *     summary: Update an applicant
 *     tags: [IPO]
 *   delete:
 *     summary: Delete an applicant (blocked while they have applications)
 *     tags: [IPO]
 * /ipo/applications:
 *   get:
 *     summary: "IPO applications. Query: applicant_id, status (applied|allotted|sold), ipo_name"
 *     tags: [IPO]
 *     responses:
 *       200: { description: "{ items, summary }" }
 *   post:
 *     summary: "Apply one IPO for one or more applicants: entries[{ applicant_id, bank_account_id }]"
 *     tags: [IPO]
 * /ipo/applications/{id}:
 *   put:
 *     summary: Update an application (allotted, sell_price, …)
 *     tags: [IPO]
 *   delete:
 *     summary: Delete an application
 *     tags: [IPO]
 */

// sell_price only applies to an allotted lot: '' / null / not allotted → null
const normalizeSellPrice = (allotted, sell) =>
    (!allotted || sell === '' || sell === null || sell === undefined ? null : Number(sell));

const decorate = (a) => {
    const doc = typeof a.toObject === 'function' ? a.toObject() : a;
    return { ...doc, ...ipoShares(doc), status: ipoStatus(doc) };
};

const bankLabel = (b) => (b && b.holder_name
    ? `${b.holder_name} · ${b.bank_name}${b.account_last4 ? ` ••${b.account_last4}` : ''}`
    : '');

// Both ids must belong to this user
async function ownsBank(userId, id) {
    return !!(await BankAccount.exists({ _id: id, user_id: userId }));
}

const describe = (a, name) => `${a.ipo_name} · ${name || 'applicant'} · ₹${a.lot_price}`;

// ── Applicants ───────────────────────────────────────────────────────────────

router.get('/applicants', async (req, res, next) => {
    try {
        const [applicants, apps] = await Promise.all([
            IpoApplicant.find({ user_id: req.user.id }).sort({ name: 1 }).lean(),
            IpoApplication.find({ user_id: req.user.id }).lean(),
        ]);
        const byApplicant = new Map();
        for (const a of apps) {
            const k = String(a.applicant_id);
            if (!byApplicant.has(k)) byApplicant.set(k, []);
            byApplicant.get(k).push(a);
        }
        res.json(applicants.map(p => ({ ...p, stats: summarize(byApplicant.get(String(p._id)) || []) })));
    } catch (err) { next(err); }
});

router.post('/applicants', applicantCreateRules, validate, async (req, res, next) => {
    try {
        const { name, broker, notes } = req.body;
        const bankId = req.body.default_bank_account_id || null;
        if (bankId && !(await ownsBank(req.user.id, bankId))) return res.status(400).json({ error: 'Bank account not found' });
        const created = await IpoApplicant.create({
            user_id: req.user.id, name, broker: broker || '', notes: notes || '', default_bank_account_id: bankId,
        });
        logActivity(req.user.id, 'created', 'ipo_applicant', created._id, `Added IPO applicant: ${name}`, created);
        res.status(201).json(created);
    } catch (err) { next(err); }
});

router.put('/applicants/:id', applicantUpdateRules, validate, async (req, res, next) => {
    try {
        const update = {};
        for (const k of ['name', 'broker', 'notes']) if (req.body[k] !== undefined) update[k] = req.body[k];
        if (req.body.default_bank_account_id !== undefined) {
            const bankId = req.body.default_bank_account_id || null;
            if (bankId && !(await ownsBank(req.user.id, bankId))) return res.status(400).json({ error: 'Bank account not found' });
            update.default_bank_account_id = bankId;
        }
        const old = await IpoApplicant.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!old) return res.status(404).json({ error: 'Applicant not found' });
        const updated = await IpoApplicant.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id }, update, { new: true, runValidators: true },
        );
        const changed = Object.keys(update).filter(k => String(old[k]) !== String(updated[k]));
        logActivity(req.user.id, 'updated', 'ipo_applicant', updated._id, `Updated IPO applicant: ${updated.name}`, updated, changed);
        res.json(updated);
    } catch (err) { next(err); }
});

router.delete('/applicants/:id', idRule, validate, async (req, res, next) => {
    try {
        const applicant = await IpoApplicant.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!applicant) return res.status(404).json({ error: 'Applicant not found' });
        const count = await IpoApplication.countDocuments({ user_id: req.user.id, applicant_id: applicant._id });
        if (count > 0) {
            return res.status(400).json({ error: `${applicant.name} has ${count} IPO application${count > 1 ? 's' : ''}. Delete those first.` });
        }
        await applicant.deleteOne();
        logActivity(req.user.id, 'deleted', 'ipo_applicant', applicant._id, `Deleted IPO applicant: ${applicant.name}`, applicant);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ── Applications ─────────────────────────────────────────────────────────────

router.get('/applications', listRules, validate, async (req, res, next) => {
    try {
        const { applicant_id, status, ipo_name } = req.query;
        const filter = { user_id: toObjectId(req.user.id) };
        if (applicant_id) filter.applicant_id = toObjectId(applicant_id);
        if (ipo_name) filter.ipo_name = String(ipo_name);
        const all = await IpoApplication.find(filter)
            .populate('applicant_id', 'name')
            .populate('bank_account_id', 'holder_name bank_name account_last4')
            .sort({ created_at: -1, _id: -1 })
            .lean();
        const items = all.map(a => ({
            ...decorate(a),
            applicant_id: a.applicant_id?._id || a.applicant_id,
            applicant_name: a.applicant_id?.name || '',
            bank_account_id: a.bank_account_id?._id || a.bank_account_id,
            bank_label: bankLabel(a.bank_account_id),
        }));
        // Summary always covers the applicant / IPO filter, ignoring the status tab
        const summary = summarize(all);
        res.json({ items: status ? items.filter(a => a.status === status) : items, summary });
    } catch (err) { next(err); }
});

router.post('/applications', applicationCreateRules, validate, async (req, res, next) => {
    try {
        const { entries, ipo_name, lot_price, profit_share_percent } = req.body;
        const allotted = req.body.allotted === true;
        const applicantIds = [...new Set(entries.map(e => String(e.applicant_id)))];
        if (applicantIds.length !== entries.length) return res.status(400).json({ error: 'Each applicant can be added only once' });
        const bankIds = [...new Set(entries.map(e => String(e.bank_account_id)))];
        const [applicants, banks] = await Promise.all([
            IpoApplicant.find({ _id: { $in: applicantIds }, user_id: req.user.id }, 'name').lean(),
            BankAccount.find({ _id: { $in: bankIds }, user_id: req.user.id }).lean(),
        ]);
        if (applicants.length !== applicantIds.length) return res.status(400).json({ error: 'One or more applicants not found' });
        if (banks.length !== bankIds.length) return res.status(400).json({ error: 'One or more bank accounts not found' });

        const created = await IpoApplication.insertMany(entries.map(e => ({
            user_id: req.user.id,
            applicant_id: e.applicant_id,
            bank_account_id: e.bank_account_id,
            ipo_name,
            lot_price,
            profit_share_percent,
            allotted,
            sell_price: normalizeSellPrice(allotted, req.body.sell_price),
        })));
        const nameOf = new Map(applicants.map(p => [String(p._id), p.name]));
        const bankOf = new Map(banks.map(b => [String(b._id), b]));
        for (const a of created) {
            logActivity(req.user.id, 'created', 'ipo_application', a._id, `Applied IPO: ${describe(a, nameOf.get(String(a.applicant_id)))}`, a);
        }
        res.status(201).json(created.map(a => ({
            ...decorate(a),
            applicant_name: nameOf.get(String(a.applicant_id)),
            bank_label: bankLabel(bankOf.get(String(a.bank_account_id))),
        })));
    } catch (err) { next(err); }
});

router.put('/applications/:id', applicationUpdateRules, validate, async (req, res, next) => {
    try {
        const app = await IpoApplication.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!app) return res.status(404).json({ error: 'Application not found' });

        if (req.body.applicant_id !== undefined) {
            const ok = await IpoApplicant.exists({ _id: req.body.applicant_id, user_id: req.user.id });
            if (!ok) return res.status(400).json({ error: 'Applicant not found' });
        }
        if (req.body.bank_account_id !== undefined && !(await ownsBank(req.user.id, req.body.bank_account_id))) {
            return res.status(400).json({ error: 'Bank account not found' });
        }
        const old = app.toObject();
        for (const k of ['applicant_id', 'bank_account_id', 'ipo_name', 'lot_price', 'profit_share_percent', 'allotted']) {
            if (req.body[k] !== undefined) app[k] = req.body[k];
        }
        // Keep the sell price unless it's being changed or the lot is no longer allotted
        const sell = req.body.sell_price !== undefined ? req.body.sell_price : app.sell_price;
        app.sell_price = normalizeSellPrice(app.allotted, sell);
        await app.save();

        const changed = ['applicant_id', 'bank_account_id', 'ipo_name', 'lot_price', 'profit_share_percent', 'allotted', 'sell_price']
            .filter(k => String(old[k]) !== String(app[k]));
        const [applicant, bank] = await Promise.all([
            IpoApplicant.findById(app.applicant_id, 'name').lean(),
            BankAccount.findById(app.bank_account_id).lean(),
        ]);
        logActivity(req.user.id, 'updated', 'ipo_application', app._id, `Updated IPO: ${describe(app, applicant?.name)}`, app, changed);
        res.json({ ...decorate(app), applicant_name: applicant?.name || '', bank_label: bankLabel(bank) });
    } catch (err) { next(err); }
});

router.delete('/applications/:id', idRule, validate, async (req, res, next) => {
    try {
        const deleted = await IpoApplication.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
        if (!deleted) return res.status(404).json({ error: 'Application not found' });
        logActivity(req.user.id, 'deleted', 'ipo_application', deleted._id, `Deleted IPO: ${deleted.ipo_name}`, deleted);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;

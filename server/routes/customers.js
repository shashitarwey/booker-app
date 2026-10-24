const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const CustomerEntry = require('../models/CustomerEntry');
const { toObjectId, parsePagination, paginatedResponse } = require('../utils/helpers');
const { runningBalanceFeed } = require('../utils/ledgerFeed');
const { logActivity } = require('../utils/activityLogger');
const validate = require('../middleware/validate');
const {
    createRules,
    updateRules,
    idRule,
    customerIdRule,
    entryCreateRules,
    entryUpdateRules,
    entryIdRule,
} = require('../validators/customers.validator');

/**
 * @swagger
 * /customers:
 *   get:
 *     summary: Get all khata customers with aggregated totals (gave/got/balance)
 *     tags: [Customers]
 *     responses:
 *       200: { description: Array of customers with total_gave, total_got, balance }
 *   post:
 *     summary: Create a new khata customer
 *     tags: [Customers]
 * /customers/{id}:
 *   get:
 *     summary: Get a single customer with totals
 *     tags: [Customers]
 *   put:
 *     summary: Update a customer
 *     tags: [Customers]
 *   delete:
 *     summary: Delete a customer and all their entries
 *     tags: [Customers]
 * /customers/{customerId}/entries:
 *   get:
 *     summary: Get all ledger entries for a customer
 *     tags: [Customers]
 * /customers/entry:
 *   post:
 *     summary: Add a ledger entry (gave or got)
 *     tags: [Customers]
 * /customers/entry/{id}:
 *   put:
 *     summary: Update a ledger entry
 *     tags: [Customers]
 *   delete:
 *     summary: Delete a ledger entry
 *     tags: [Customers]
 */

// Aggregate totals for a set of customer ids. Returns a Map keyed by customer id.
async function aggregateTotals(userId, customerIds) {
    if (customerIds.length === 0) return new Map();
    const rows = await CustomerEntry.aggregate([
        { $match: { user_id: userId, customer_id: { $in: customerIds } } },
        {
            $group: {
                _id: { customer_id: '$customer_id', type: '$type' },
                total: { $sum: '$amount' }
            }
        }
    ]);

    const map = new Map();
    for (const row of rows) {
        const key = row._id.customer_id.toString();
        const prev = map.get(key) || { total_gave: 0, total_got: 0 };
        if (row._id.type === 'gave') prev.total_gave += row.total;
        else prev.total_got += row.total;
        map.set(key, prev);
    }
    return map;
}

function decorate(customer, totals) {
    const t = totals.get(customer._id.toString()) || { total_gave: 0, total_got: 0 };
    const balance = t.total_gave - t.total_got;
    return {
        ...customer.toObject(),
        total_gave: t.total_gave,
        total_got: t.total_got,
        balance,
    };
}

// List customers with aggregated totals + pagination
router.get('/', async (req, res, next) => {
    try {
        const { all } = req.query;
        const userId = toObjectId(req.user.id);
        const { pageNum, limitNum, skip } = parsePagination(req.query);

        let customers, total;
        if (all === 'true') {
            customers = await Customer.find({ user_id: req.user.id }).sort({ name: 1 });
            total = customers.length;
        } else {
            [customers, total] = await Promise.all([
                Customer.find({ user_id: req.user.id }).sort({ name: 1 }).skip(skip).limit(limitNum),
                Customer.countDocuments({ user_id: req.user.id })
            ]);
        }

        const customerIds = customers.map(c => toObjectId(c._id));
        const totals = await aggregateTotals(userId, customerIds);
        const enriched = customers.map(c => decorate(c, totals));

        if (all === 'true') {
            res.json(enriched);
        } else {
            res.json(paginatedResponse(enriched, total, pageNum, limitNum));
        }
    } catch (err) { next(err); }
});

// Get single customer with totals
router.get('/:id', idRule, validate, async (req, res, next) => {
    try {
        const customer = await Customer.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        const userId = toObjectId(req.user.id);
        const totals = await aggregateTotals(userId, [toObjectId(customer._id)]);
        res.json(decorate(customer, totals));
    } catch (err) { next(err); }
});

// Create customer
router.post('/', createRules, validate, async (req, res, next) => {
    try {
        const { name, phone, notes } = req.body;
        const created = await new Customer({
            user_id: req.user.id,
            name,
            phone: phone || '',
            notes: notes || ''
        }).save();
        logActivity(req.user.id, 'created', 'customer', created._id, `Added khata customer: ${name}`, created);
        res.status(201).json(created);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update customer
router.put('/:id', updateRules, validate, async (req, res, next) => {
    try {
        const { name, phone, notes } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (phone !== undefined) update.phone = phone;
        if (notes !== undefined) update.notes = notes;

        const old = await Customer.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!old) return res.status(404).json({ error: 'Customer not found' });

        const updated = await Customer.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id },
            update,
            { new: true, runValidators: true }
        );
        const changedFields = Object.keys(update).filter(k => String(old[k]) !== String(updated[k]));
        logActivity(req.user.id, 'updated', 'customer', updated._id, `Updated khata customer: ${updated.name}`, updated, changedFields);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete customer and all their entries
router.delete('/:id', idRule, validate, async (req, res, next) => {
    try {
        const deleted = await Customer.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
        if (!deleted) return res.status(404).json({ error: 'Customer not found' });
        await CustomerEntry.deleteMany({ customer_id: req.params.id, user_id: req.user.id });
        logActivity(req.user.id, 'deleted', 'customer', deleted._id, `Deleted khata customer: ${deleted.name}`, deleted);
        res.json({ success: true });
    } catch (err) { next(err); }
});

// List entries for a customer
router.get('/:customerId/entries', customerIdRule, validate, async (req, res, next) => {
    try {
        const entries = await CustomerEntry.find({
            customer_id: req.params.customerId,
            user_id: req.user.id
        }).sort({ entry_date: -1, created_at: -1 });
        res.json(entries);
    } catch (err) { next(err); }
});

// Paginated entries feed with running balance attached, newest-first. The
// balance depends on the full chronological history, so MongoDB computes it
// with a window over all entries (gave +, got −) and returns only the requested
// page — see utils/ledgerFeed.js. Same-day entries are ordered by created_at,
// then _id, so pages are stable. Client appends for infinite scroll.
router.get('/:customerId/entries-feed', customerIdRule, validate, async (req, res, next) => {
    try {
        const { pageNum, limitNum, skip } = parsePagination(req.query);

        const { rows, total } = await runningBalanceFeed(CustomerEntry, [
            { $match: { user_id: toObjectId(req.user.id), customer_id: toObjectId(req.params.customerId) } },
        ], {
            sortBy: { entry_date: 1, created_at: 1, _id: 1 },
            delta: { $cond: [{ $eq: ['$type', 'gave'] }, '$amount', { $subtract: [0, '$amount'] }] },
            skip,
            limit: limitNum,
        });

        // Rows are the raw entry documents with runningBalance appended last,
        // exactly what the previous lean() + loop produced
        res.json(paginatedResponse(rows, total, pageNum, limitNum));
    } catch (err) { next(err); }
});

// Create an entry
router.post('/entry', entryCreateRules, validate, async (req, res, next) => {
    try {
        const { customer_id, type, amount, entry_date, notes } = req.body;

        // Verify customer belongs to current user
        const customer = await Customer.findOne({ _id: customer_id, user_id: req.user.id });
        if (!customer) return res.status(400).json({ error: 'Invalid customer_id — customer not found or not yours' });

        const created = await new CustomerEntry({
            user_id: req.user.id,
            customer_id,
            type,
            amount: Number(amount),
            entry_date,
            notes: notes || ''
        }).save();
        logActivity(
            req.user.id,
            'created',
            'customer_entry',
            created._id,
            `${type === 'gave' ? 'You Gave' : 'You Got'} ₹${amount} ${type === 'gave' ? 'to' : 'from'} ${customer.name}`,
            created
        );
        res.status(201).json(created);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update an entry
router.put('/entry/:id', entryUpdateRules, validate, async (req, res, next) => {
    try {
        const { type, amount, entry_date, notes } = req.body;
        const update = {};
        if (type !== undefined) update.type = type;
        // '' means "not provided" (validator skips falsy) — don't save it as ₹0
        if (amount !== undefined && amount !== '') update.amount = Number(amount);
        if (entry_date !== undefined) update.entry_date = entry_date;
        if (notes !== undefined) update.notes = notes;

        const old = await CustomerEntry.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!old) return res.status(404).json({ error: 'Entry not found' });

        const updated = await CustomerEntry.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id },
            update,
            { new: true, runValidators: true }
        );
        const changedFields = Object.keys(update).filter(k => String(old[k]) !== String(updated[k]));
        logActivity(req.user.id, 'updated', 'customer_entry', updated._id, `Updated khata entry of ₹${updated.amount}`, updated, changedFields);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete an entry
router.delete('/entry/:id', entryIdRule, validate, async (req, res, next) => {
    try {
        const deleted = await CustomerEntry.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
        if (!deleted) return res.status(404).json({ error: 'Entry not found' });
        logActivity(req.user.id, 'deleted', 'customer_entry', deleted._id, `Deleted khata entry of ₹${deleted.amount}`, deleted);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;

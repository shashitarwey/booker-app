const express = require('express');
const router = express.Router();
const multer = require('multer');
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const SellerPayment = require('../models/SellerPayment');
const { PROFIT_EXPR } = require('../utils/profit');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { toObjectId, parsePagination, paginatedResponse } = require('../utils/helpers');
const { runningBalanceFeed, byId } = require('../utils/ledgerFeed');
const { logActivity } = require('../utils/activityLogger');
const { invalidateCache } = require('../utils/cache');
const validate = require('../middleware/validate');
const {
    createRules,
    updateRules,
    idRule,
    sellerIdRule,
    paymentCreateRules,
    paymentUpdateRules,
    paymentIdRule,
} = require('../validators/sellers.validator');

/**
 * @swagger
 * /sellers:
 *   get:
 *     summary: Get all sellers with aggregated stats
 *     tags: [Sellers]
 *     responses:
 *       200: { description: Array of sellers with total_amount_ordered, total_amount_get, due_balance, profit }
 *   post:
 *     summary: Create a new seller
 *     tags: [Sellers]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, city]
 *             properties:
 *               name: { type: string }
 *               city: { type: string }
 *               phone: { type: string }
 *     responses:
 *       201: { description: Seller created }
 * /sellers/{id}:
 *   get:
 *     summary: Get single seller with stats
 *     tags: [Sellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Seller object with stats }
 *   put:
 *     summary: Update a seller
 *     tags: [Sellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Seller updated }
 *   delete:
 *     summary: Delete a seller (fails if orders exist)
 *     tags: [Sellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Seller deleted }
 *       400: { description: Cannot delete — orders exist }
 * /sellers/{sellerId}/payment:
 *   get:
 *     summary: Get payment ledger for a seller
 *     tags: [Sellers]
 *     parameters:
 *       - in: path
 *         name: sellerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of payment objects }
 * /sellers/payment:
 *   post:
 *     summary: Add a seller payment (with optional receipt upload)
 *     tags: [Sellers]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [seller_id, amount, payment_date]
 *             properties:
 *               seller_id: { type: string }
 *               amount: { type: number }
 *               payment_date: { type: string, format: date }
 *               notes: { type: string }
 *               receipt: { type: string, format: binary }
 *     responses:
 *       201: { description: Payment created }
 * /sellers/payment/{id}:
 *   put:
 *     summary: Update a seller payment
 *     tags: [Sellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Payment updated }
 *   delete:
 *     summary: Delete a seller payment
 *     tags: [Sellers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Payment deleted }
 */

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 } // 1MB limit
});

// Get sellers with dynamically aggregated stats + server-side pagination
router.get('/', async (req, res, next) => {
    try {
        const { all } = req.query;
        const userId = toObjectId(req.user.id);
        const { pageNum, limitNum, skip } = parsePagination(req.query);

        let sellers, total;
        if (all === 'true') {
            sellers = await Seller.find({ user_id: req.user.id }).sort({ name: 1 });
            total = sellers.length;
        } else {
            [sellers, total] = await Promise.all([
                Seller.find({ user_id: req.user.id }).sort({ name: 1 }).skip(skip).limit(limitNum),
                Seller.countDocuments({ user_id: req.user.id })
            ]);
        }

        // Aggregate order stats per seller
        const stats = await Order.aggregate([
            { $match: { user_id: userId, delivery_status: 'Delivered' } },
            {
                $group: {
                    _id: '$seller_id',
                    total_amount_ordered: { $sum: '$order_amount' },
                    total_amount_get: { $sum: '$return_amount' },
                    total_cashback: { $sum: '$cashback' },
                    profit: { $sum: PROFIT_EXPR }
                }
            }
        ]);

        const statsMap = stats.reduce((acc, stat) => {
            acc[stat._id.toString()] = stat;
            return acc;
        }, {});

        // Aggregate payment stats from Khata book ledger
        const payments = await SellerPayment.aggregate([
            { $match: { user_id: userId } },
            {
                $group: {
                    _id: '$seller_id',
                    total_paid: { $sum: '$amount' }
                }
            }
        ]);

        const paymentsMap = payments.reduce((acc, p) => {
            acc[p._id.toString()] = p.total_paid;
            return acc;
        }, {});

        // Inject the dynamically calculated metrics directly
        const sellersWithStats = sellers.map(seller => {
            const stat = statsMap[seller._id.toString()] || { total_amount_ordered: 0, total_amount_get: 0, total_cashback: 0, profit: 0 };
            const total_paid = paymentsMap[seller._id.toString()] || 0;

            const total_amount_ordered = stat.total_amount_ordered;
            const total_amount_get = stat.total_amount_get;
            const profit = stat.profit;
            const due_balance = total_amount_get - total_paid;

            return {
                ...seller.toObject(),
                total_amount_ordered,
                total_amount_get,
                total_received: total_paid,
                due_balance,
                profit
            };
        });

        if (all === 'true') {
            res.json(sellersWithStats);
        } else {
            res.json(paginatedResponse(sellersWithStats, total, pageNum, limitNum));
        }
    } catch (err) { next(err); }
});

// Get a single seller by ID with stats
router.get('/:id', idRule, validate, async (req, res, next) => {
    try {
        const seller = await Seller.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!seller) return res.status(404).json({ error: 'Seller not found' });

        const userId = toObjectId(req.user.id);
        const sellerIdObj = toObjectId(seller._id);

        const [orderStat] = await Order.aggregate([
            { $match: { user_id: userId, seller_id: sellerIdObj, delivery_status: 'Delivered' } },
            { $group: { _id: null, total_amount_ordered: { $sum: '$order_amount' }, total_amount_get: { $sum: '$return_amount' }, total_cashback: { $sum: '$cashback' }, profit: { $sum: PROFIT_EXPR } } }
        ]);

        const [paymentStat] = await SellerPayment.aggregate([
            { $match: { user_id: userId, seller_id: sellerIdObj } },
            { $group: { _id: null, total_paid: { $sum: '$amount' } } }
        ]);

        const stat = orderStat || { total_amount_ordered: 0, total_amount_get: 0, total_cashback: 0, profit: 0 };
        const total_paid = paymentStat?.total_paid || 0;
        const profit = stat.profit;
        const due_balance = stat.total_amount_get - total_paid;

        res.json({
            ...seller.toObject(),
            total_amount_ordered: stat.total_amount_ordered,
            total_amount_get: stat.total_amount_get,
            total_received: total_paid,
            due_balance,
            profit
        });
    } catch (err) { next(err); }
});

// Add a seller
router.post('/', createRules, validate, async (req, res, next) => {
    try {
        const { name, city, phone } = req.body;
        const newSeller = new Seller({
            user_id: req.user.id,
            name,
            city,
            phone: phone || ''
        });
        const savedSeller = await newSeller.save();
        logActivity(req.user.id, 'created', 'seller', savedSeller._id, `Added seller: ${name}, ${city}`, savedSeller);
        res.status(201).json(savedSeller);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update a seller
router.put('/:id', updateRules, validate, async (req, res, next) => {
    try {
        const { name, city, phone } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (city !== undefined) update.city = city;
        if (phone !== undefined) update.phone = phone;

        const oldSeller = await Seller.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!oldSeller) return res.status(404).json({ error: 'Seller not found' });

        const updatedSeller = await Seller.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id },
            update,
            { new: true, runValidators: true }
        );
        const changedFields = Object.keys(update).filter(k => String(oldSeller[k]) !== String(updatedSeller[k]));
        logActivity(req.user.id, 'updated', 'seller', updatedSeller._id, `Updated seller: ${updatedSeller.name}`, updatedSeller, changedFields);
        invalidateCache(req, 'sellers');
        res.json(updatedSeller);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete a seller
router.delete('/:id', idRule, validate, async (req, res, next) => {
    try {
        const [ordersCount, paymentsCount] = await Promise.all([
            Order.countDocuments({ seller_id: req.params.id, user_id: req.user.id }),
            SellerPayment.countDocuments({ seller_id: req.params.id, user_id: req.user.id }),
        ]);
        if (ordersCount > 0) {
            return res.status(400).json({ error: 'Cannot delete buyer with existing orders. Please delete or reassign the orders first.' });
        }
        // Orphaned payments would keep counting in "receivable from buyers"
        if (paymentsCount > 0) {
            return res.status(400).json({ error: `This buyer has ${paymentsCount} payment(s). Delete them from the ledger first.` });
        }

        const deletedSeller = await Seller.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
        if (!deletedSeller) return res.status(404).json({ error: 'Seller not found' });
        logActivity(req.user.id, 'deleted', 'seller', deletedSeller._id, `Deleted seller: ${deletedSeller.name}`, deletedSeller);
        invalidateCache(req, 'sellers');
        res.json({ success: true });
    } catch (err) { next(err); }
});

// Get ledger for a specific seller
router.get('/:sellerId/payment', sellerIdRule, validate, async (req, res, next) => {
    try {
        const payments = await SellerPayment.find({
            seller_id: req.params.sellerId,
            user_id: req.user.id
        }).sort({ payment_date: -1, created_at: -1 });
        res.json(payments);
    } catch (err) { next(err); }
});

// Paginated merged ledger feed: orders + payments with running balance
// attached, sorted newest-first. The balance depends on the full chronological
// history, so MongoDB merges both collections ($unionWith), computes the
// running sum in a window and returns one page (utils/ledgerFeed.js); only the
// page's documents are then loaded in full and populated.
//
// Balance rules: a Delivered order adds its return_amount, pending/cancelled
// orders are listed but add nothing, payments subtract. Same-date rows are
// ordered by created_at (missing sorts first), then orders before payments,
// then _id — a deterministic version of the old in-memory stable sort.
const ORDER_CARD_POPULATE = {
    path: 'card_id',
    select: 'bank_name last_four_digit card_type holder_id',
    populate: { path: 'holder_id', select: 'name relation' },
};

const ledgerOrderItem = (o, runningBalance) => ({
    id: o._id,
    type: 'ORDER',
    date: o.order_date,
    description: `${o.model_ordered}${o.quantity > 1 ? ` ×${o.quantity}` : ''}`,
    amount: o.return_amount,
    // Who booked it: the holder of the card the order was placed on
    booker: o.card_id?.holder_id
        ? { _id: o.card_id.holder_id._id, name: o.card_id.holder_id.name, relation: o.card_id.holder_id.relation }
        : null,
    raw: o,
    isCancelled: o.delivery_status === 'Cancelled',
    isPending: o.delivery_status !== 'Delivered',
    runningBalance,
});

const ledgerPaymentItem = (p, runningBalance) => ({
    id: p._id,
    type: 'PAYMENT',
    date: p.payment_date,
    description: p.notes || 'Payment Received',
    amount: p.amount,
    raw: p,
    isCancelled: false,
    isPending: false,
    runningBalance,
});

router.get('/:sellerId/ledger-feed', sellerIdRule, validate, async (req, res, next) => {
    try {
        const { pageNum, limitNum, skip } = parsePagination(req.query);
        const match = { user_id: toObjectId(req.user.id), seller_id: toObjectId(req.params.sellerId) };

        // rank: orders before payments on a full date + created_at tie
        const { rows, total } = await runningBalanceFeed(Order, [
            { $match: match },
            { $project: {
                rank: { $literal: 0 }, date: '$order_date', created_at: 1,
                delta: { $cond: [{ $eq: ['$delivery_status', 'Delivered'] }, '$return_amount', 0] },
            } },
            { $unionWith: { coll: SellerPayment.collection.name, pipeline: [
                { $match: match },
                { $project: {
                    rank: { $literal: 1 }, date: '$payment_date', created_at: 1,
                    delta: { $subtract: [0, '$amount'] },
                } },
            ] } },
        ], { sortBy: { date: 1, created_at: 1, rank: 1, _id: 1 }, delta: '$delta', skip, limit: limitNum });

        // Hydrate just this page
        const idsOf = (rank) => rows.filter(r => r.rank === rank).map(r => r._id);
        const [orders, payments] = await Promise.all([
            Order.find({ _id: { $in: idsOf(0) }, user_id: req.user.id }).populate(ORDER_CARD_POPULATE).lean(),
            SellerPayment.find({ _id: { $in: idsOf(1) }, user_id: req.user.id }).lean(),
        ]);
        const orderById = byId(orders);
        const paymentById = byId(payments);

        const items = [];
        for (const r of rows) {
            // A document deleted between the two queries is simply dropped
            const doc = (r.rank === 0 ? orderById : paymentById).get(String(r._id));
            if (doc) items.push(r.rank === 0 ? ledgerOrderItem(doc, r.runningBalance) : ledgerPaymentItem(doc, r.runningBalance));
        }

        res.json(paginatedResponse(items, total, pageNum, limitNum));
    } catch (err) { next(err); }
});

// Add a payment
router.post('/payment', upload.single('receipt'), paymentCreateRules, validate, async (req, res, next) => {
    try {
        const { seller_id, amount, payment_date, notes } = req.body;

        // Verify seller belongs to current user
        const seller = await Seller.findOne({ _id: seller_id, user_id: req.user.id });
        if (!seller) return res.status(400).json({ error: 'Invalid seller_id — seller not found or not yours' });

        let receipt_url = '';
        if (req.file) {
            receipt_url = await uploadToCloudinary(req.file.buffer, 'analyzer_receipts');
        }

        const newPayment = new SellerPayment({
            user_id: req.user.id,
            seller_id,
            amount: Number(amount),
            payment_date,
            notes,
            receipt_url
        });
        const savedPayment = await newPayment.save();
        invalidateCache(req, 'seller_payments');
        logActivity(req.user.id, 'created', 'seller_payment', savedPayment._id, `Added payment of ₹${amount} to ${seller.name}`, savedPayment);
        res.status(201).json(savedPayment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update a payment
router.put('/payment/:id', upload.single('receipt'), paymentUpdateRules, validate, async (req, res, next) => {
    try {
        const { amount, payment_date, notes } = req.body;
        const update = {};
        // '' means "not provided" (validator skips falsy) — don't save it as ₹0
        if (amount !== undefined && amount !== '') update.amount = Number(amount);
        if (payment_date !== undefined) update.payment_date = payment_date;
        if (notes !== undefined) update.notes = notes;

        if (req.file) {
            update.receipt_url = await uploadToCloudinary(req.file.buffer, 'analyzer_receipts');
        } else if (req.body.remove_receipt === 'true') {
            update.receipt_url = '';
        }

        const oldPayment = await SellerPayment.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!oldPayment) return res.status(404).json({ error: 'Payment not found' });

        const updated = await SellerPayment.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id },
            update,
            { new: true, runValidators: true }
        );
        const changedFields = Object.keys(update).filter(k => String(oldPayment[k]) !== String(updated[k]));
        logActivity(req.user.id, 'updated', 'seller_payment', updated._id, `Updated payment of ₹${updated.amount}`, updated, changedFields);
        invalidateCache(req, 'seller_payments');
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete a payment
router.delete('/payment/:id', paymentIdRule, validate, async (req, res, next) => {
    try {
        const deletedPayment = await SellerPayment.findOneAndDelete({
            _id: req.params.id,
            user_id: req.user.id
        });
        if (!deletedPayment) return res.status(404).json({ error: 'Payment not found' });
        logActivity(req.user.id, 'deleted', 'seller_payment', deletedPayment._id, `Deleted payment of ₹${deletedPayment.amount}`, deletedPayment);
        invalidateCache(req, 'seller_payments');
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;

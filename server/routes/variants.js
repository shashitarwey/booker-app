const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const Variant = require('../models/Variant');
const validate = require('../middleware/validate');

/**
 * @swagger
 * /variants:
 *   get:
 *     summary: List variant options (built-in defaults + the user's custom variants)
 *     tags: [Variants]
 *     responses:
 *       200: { description: Array of variant name strings }
 *   post:
 *     summary: Add a custom variant (idempotent, case-insensitive)
 *     tags: [Variants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "3/32" }
 *     responses:
 *       201: { description: "Updated list of variant names" }
 */

const { DEFAULT_VARIANTS } = Variant;
const DEFAULT_KEYS = new Set(DEFAULT_VARIANTS.map(v => v.toLowerCase()));

async function listVariants(userId) {
    const custom = await Variant.find({ user_id: userId }).sort({ name: 1 }).lean();
    return [...DEFAULT_VARIANTS, ...custom.map(v => v.name).filter(n => !DEFAULT_KEYS.has(n.toLowerCase()))];
}

router.get('/', async (req, res, next) => {
    try {
        res.json(await listVariants(req.user.id));
    } catch (err) { next(err); }
});

router.post('/',
    body('name').isString().trim().notEmpty().withMessage('Variant name is required')
        .bail().isLength({ max: 30 }).withMessage('Variant must be 30 characters or fewer'),
    validate,
    async (req, res, next) => {
        try {
            const name = req.body.name.trim().replace(/\s+/g, ' ');
            const key = name.toLowerCase();
            if (!DEFAULT_KEYS.has(key)) {
                await Variant.updateOne(
                    { user_id: req.user.id, key },
                    { $setOnInsert: { user_id: req.user.id, key, name } },
                    { upsert: true }
                );
            }
            res.status(201).json(await listVariants(req.user.id));
        } catch (err) { next(err); }
    }
);

module.exports = router;

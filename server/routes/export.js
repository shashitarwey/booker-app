const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { exportAccount, importAccount } = require('../services/accountData');
const { invalidate } = require('../utils/cache');
const logger = require('../utils/logger');

/**
 * @swagger
 * /export:
 *   get:
 *     summary: Download all of the account's data as one JSON backup
 *     tags: [Backup]
 *     responses:
 *       200: { description: "{ format, version, exported_at, account, counts, data }" }
 * /export/import:
 *   post:
 *     summary: Restore a backup into this account (account must be empty)
 *     tags: [Backup]
 *     responses:
 *       200: { description: "{ restored: { <collection>: count } }" }
 *       400: { description: Not a backup, or the account already has data }
 */
router.get('/', async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id, 'name email').lean();
        const backup = await exportAccount(req.user.id, user);
        const stamp = backup.exported_at.slice(0, 10);
        res.setHeader('Content-Disposition', `attachment; filename="booker-backup-${stamp}.json"`);
        res.json(backup);
    } catch (err) { next(err); }
});

router.post('/import', async (req, res, next) => {
    try {
        const restored = await importAccount(req.user.id, req.body);
        invalidate(`route:${req.user.id}:*`).catch(() => {});
        logger.info('Account restored from backup', { userId: req.user.id, restored });
        res.json({ restored });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ error: err.message });
        next(err);
    }
});

module.exports = router;

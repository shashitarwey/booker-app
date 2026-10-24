const express = require('express');
const router = express.Router();
const { cacheMiddleware } = require('../utils/cache');
const { computeProfitAnalytics } = require('../services/analytics');

/**
 * @swagger
 * /analytics/profit:
 *   get:
 *     summary: Get profit analytics (monthly trend, by seller, by platform)
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Object with monthly, bySeller, byEcommSite, totals, fy
 */
// Response shape is documented in services/analytics.js.
router.get('/profit', cacheMiddleware(300), async (req, res, next) => {
    try {
        res.json(await computeProfitAnalytics(req.user.id, req.query));
    } catch (err) { next(err); }
});

module.exports = router;

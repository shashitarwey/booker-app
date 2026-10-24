const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Card = require('../models/Card');
const Seller = require('../models/Seller');
const SellerPayment = require('../models/SellerPayment');
const { toObjectId } = require('../utils/helpers');
const { todayLocal, todayAsUtcDate } = require('../utils/dates');
const { orderProfit, PROFIT_EXPR } = require('../utils/profit');
const { computeProfitAnalytics } = require('../services/analytics');
const logger = require('../utils/logger');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
// Recent orders are only for order-level questions; everything else is
// answered from pre-computed aggregates (same numbers the Analytics page shows).
const RECENT_ORDERS_IN_CONTEXT = 150;
const TOP_ITEMS = 25;

// Compact, pre-aggregated snapshot of the user's data for Gemini. Sending
// summaries instead of thousands of raw orders keeps token cost low and makes
// answers match the app exactly (the model doesn't have to re-add numbers).
async function buildUserDataSnapshot(userId) {
    const uid = toObjectId(userId);
    const [analytics, recent, orderTotal, cards, sellers, buyerDue, topItems] = await Promise.all([
        computeProfitAnalytics(userId, {}),
        Order.find({ user_id: uid })
            .sort({ order_date: -1, created_at: -1 })
            .limit(RECENT_ORDERS_IN_CONTEXT)
            .populate({ path: 'card_id', select: 'bank_name last_four_digit holder_id', populate: { path: 'holder_id', select: 'name relation' } })
            .populate('seller_id', 'name city')
            .lean(),
        Order.countDocuments({ user_id: uid }),
        Card.find({ user_id: uid }).populate('holder_id', 'name relation').lean(),
        Seller.find({ user_id: uid }).lean(),
        Promise.all([
            Order.aggregate([
                { $match: { user_id: uid, delivery_status: 'Delivered' } },
                { $group: { _id: '$seller_id', expected: { $sum: '$return_amount' } } },
            ]),
            SellerPayment.aggregate([
                { $match: { user_id: uid } },
                { $group: { _id: '$seller_id', received: { $sum: '$amount' } } },
            ]),
        ]),
        Order.aggregate([
            { $match: { user_id: uid, delivery_status: 'Delivered' } },
            { $group: {
                _id: { item: '$model_ordered', variant: '$variant' },
                orders: { $sum: 1 }, qty: { $sum: { $ifNull: ['$quantity', 1] } },
                order_amount: { $sum: '$order_amount' }, profit: { $sum: PROFIT_EXPR },
            } },
            { $sort: { profit: -1 } },
            { $limit: TOP_ITEMS },
        ]),
    ]);

    const [expectedRows, receivedRows] = buyerDue;
    const expected = new Map(expectedRows.map(r => [String(r._id), r.expected]));
    const received = new Map(receivedRows.map(r => [String(r._id), r.received]));
    const today = todayAsUtcDate();
    const fyStartYear = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;

    return {
        today: todayLocal(),
        fy_start: `${fyStartYear}-04-01`,
        meta: { order_count_total: orderTotal, recent_orders_included: recent.length },
        // All-time aggregates (delivered orders): totals, monthly trend,
        // profit by buyer / platform / booker, own-vs-booker split, cash position.
        analytics,
        buyers: sellers.map(s => {
            const exp = expected.get(String(s._id)) || 0;
            const rec = received.get(String(s._id)) || 0;
            return { name: s.name, city: s.city, phone: s.phone, expected: exp, received: rec, due: exp - rec };
        }),
        cards: cards.map(c => ({
            bank: c.bank_name, last_four: c.last_four_digit, network: c.card_network, card_type: c.card_type,
            holder: c.holder_id ? { name: c.holder_id.name, relation: c.holder_id.relation } : null,
            cashback_percent: c.cashback_enabled ? c.cashback_percent : 0, billing_day: c.billing_date, due_day: c.due_date,
        })),
        top_items: topItems.map(t => ({ item: t._id.item, variant: t._id.variant, orders: t.orders, qty: t.qty, order_amount: t.order_amount, profit: t.profit })),
        recent_orders: recent.map(o => ({
            date: o.order_date ? new Date(o.order_date).toISOString().slice(0, 10) : null,
            delivered_date: o.delivered_date ? new Date(o.delivered_date).toISOString().slice(0, 10) : null,
            item: o.model_ordered, variant: o.variant, qty: o.quantity,
            order_amount: o.order_amount, return_amount: o.return_amount, cashback: o.cashback,
            return_to_friend: o.friend_amount ?? null, advance_to_friend: o.advance_amount ?? null,
            profit: orderProfit(o),
            status: o.delivery_status, cleared: o.is_cleared, ecomm_site: o.ecomm_site,
            buyer: o.seller_id ? o.seller_id.name : null,
            card: o.card_id ? `${o.card_id.bank_name} ${o.card_id.last_four_digit}` : null,
            booker: o.card_id?.holder_id ? { name: o.card_id.holder_id.name, relation: o.card_id.holder_id.relation } : null,
            remark: o.remark || undefined,
        })),
    };
}

const SYSTEM_PROMPT = `You are Booker's financial analytics assistant for a reseller who books electronics on e-commerce sites for shopkeepers ("buyers") using cards held by themselves, family members and friends ("bookers").

RULES:
- Use ONLY the JSON data provided in the user message. Never invent numbers, buyers, cards, bookers or orders.
- Prefer the pre-computed "analytics" section (all-time, delivered orders only) for totals, trends and breakdowns; it matches what the app shows. analytics.byBooker groups by card holder; analytics.bySource splits own & family vs bookers; analytics.position holds current balances (receivable from buyers, payable to bookers).
- "buyers[].due" is what each buyer still owes. "top_items" ranks delivered items by profit.
- "recent_orders" only has the latest orders (see meta.recent_orders_included of meta.order_count_total). Use it for order-level questions and say so if the answer may need older orders.
- Profit already follows the app's rules: own/family card = return - order + cashback; friend (booker) card = return - return_to_friend. Bookers earn return_to_friend - order + cashback.
- "Delivered" means status === "Delivered". "Cleared" means the buyer has paid out that order.
- Format currency in Indian style with ₹ and Indian grouping (e.g. ₹1,23,456), whole rupees unless asked otherwise.
- Keep responses concise: lead with the answer, then 1-2 lines of context. Use bullets or compact tables for lists.
- If the data doesn't contain the answer, say so clearly. Do not guess.`;

// POST /api/ai/ask — multi-turn chat with the user's real data as context.
// Request body:
//   { question: string, history?: [{ role: 'user'|'model', content: string }] }
// Response:
//   { answer: string }
router.post('/ask', async (req, res, next) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'AI assistant is not configured. Set GEMINI_API_KEY on the server.' });
        }

        const { question, history } = req.body;
        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return res.status(400).json({ error: 'Question is required.' });
        }
        if (question.length > 1000) {
            return res.status(400).json({ error: 'Question is too long (max 1000 characters).' });
        }

        const snapshot = await buildUserDataSnapshot(req.user.id);

        // Build Gemini contents array. The data snapshot is bundled into the
        // current user turn so it always reflects fresh state; history holds
        // prior Q&A pairs to support follow-ups like "and what about last month?".
        const priorTurns = Array.isArray(history)
            ? history
                .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'model'))
                .slice(-10) // cap to last 10 exchanges to bound token cost
                .map(m => ({ role: m.role, parts: [{ text: m.content }] }))
            : [];

        const currentTurn = {
            role: 'user',
            parts: [{
                text: `DATA (JSON):\n${JSON.stringify(snapshot)}\n\nQUESTION: ${question.trim()}`,
            }],
        };

        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [...priorTurns, currentTurn],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1024,
            },
        };

        const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            logger.error('Gemini API error', { status: resp.status, body: errText.slice(0, 500) });
            if (resp.status === 429) {
                return res.status(429).json({ error: 'AI rate limit reached. Please wait a minute and try again.' });
            }
            if (resp.status === 401 || resp.status === 403) {
                return res.status(503).json({ error: 'AI key invalid or unauthorized. Check GEMINI_API_KEY.' });
            }
            return res.status(502).json({ error: 'AI service error. Please try again.' });
        }

        const data = await resp.json();
        const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        if (!answer) {
            return res.status(502).json({ error: 'AI returned an empty response.' });
        }

        res.json({ answer });
    } catch (err) { next(err); }
});

module.exports = router;
// Exposed for tests
module.exports.buildUserDataSnapshot = buildUserDataSnapshot;

/**
 * Characterization tests for the three paginated ledger feeds:
 *
 *   GET /api/sellers/:sellerId/ledger-feed
 *   GET /api/customers/:customerId/entries-feed
 *   GET /api/people/:id/khata
 *
 * They pin the exact response bytes (key order included) produced by the
 * original "load everything into JS, walk, reverse, slice" implementations so
 * the DB-side rewrite ($unionWith + $setWindowFields) can be proven identical.
 * Volatile values are normalised: ObjectIds become <idN> labels in order of
 * first appearance and updated_at becomes <ts>. created_at is set explicitly
 * on every document so same-day tie-breaks are deterministic.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
const Order = require('../models/Order');
const Card = require('../models/Card');
const SellerPayment = require('../models/SellerPayment');
const CustomerEntry = require('../models/CustomerEntry');
const BookerPayment = require('../models/BookerPayment');
require('./setup');

function normalize(body) {
  const ids = new Map();
  const label = (hex) => {
    if (!ids.has(hex)) ids.set(hex, `<id${ids.size}>`);
    return ids.get(hex);
  };
  return JSON.stringify(body, (k, v) => {
    if (k === 'updated_at') return '<ts>';
    if (typeof v === 'string') return v.replace(/\b[0-9a-f]{24}\b/g, label);
    return v;
  }, 2);
}

// Force a deterministic created_at (or remove it) bypassing mongoose timestamps
async function stamp(Model, id, iso) {
  const update = iso === null ? { $unset: { created_at: 1 } } : { $set: { created_at: new Date(iso) } };
  await Model.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(id)) }, update);
}

// Compact, human-readable view of a page — doubles as a spec of the semantics
const brief = (items) => items.map(i => [i.type, i.subtype || '', i.description, i.amount, i.isPending, i.isCancelled, i.runningBalance]);

describe('Ledger feeds (characterization)', () => {
  let token, user;

  const api = () => ({
    get: (url) => request(app).get(url).set(authHeader(token)),
    post: (url, body) => request(app).post(url).set(authHeader(token)).send(body),
  });

  const cardFor = (holder_id, last_four_digit) => ({
    bank_name: 'HDFC Bank', card_network: 'Visa', last_four_digit, name_on_card: 'X', holder_id,
  });

  beforeEach(async () => {
    ({ token, user } = await createTestUser());
  });

  // ── Seller (buyer) ledger feed ───────────────────────────────────────────
  describe('GET /api/sellers/:sellerId/ledger-feed', () => {
    let sellerId;

    beforeEach(async () => {
      sellerId = (await api().post('/api/sellers', { name: 'Shop', city: 'Patna' })).body._id;
      const otherSellerId = (await api().post('/api/sellers', { name: 'Other', city: 'Gaya' })).body._id;
      const friend = (await api().post('/api/people', { name: 'Ravi', relation: 'friend' })).body;
      const selfCard = (await api().post('/api/cards', cardFor(undefined, '1111'))).body;
      const friendCard = (await api().post('/api/cards', cardFor(friend._id, '2222'))).body;
      const doomedCard = (await api().post('/api/cards', cardFor(undefined, '3333'))).body;

      const order = async (o, createdAt) => {
        const res = await api().post('/api/orders', {
          seller_id: sellerId, order_amount: 900, cashback: 0, id_used: 'a@x.com', ecomm_site: 'Amazon',
          variant: '8/128', ...o,
        });
        expect(res.status).toBe(201);
        await stamp(Order, res.body._id, createdAt);
        return res.body;
      };
      const payment = async (p, createdAt) => {
        const res = await api().post('/api/sellers/payment', { seller_id: sellerId, ...p });
        expect(res.status).toBe(201);
        await stamp(SellerPayment, res.body._id, createdAt);
        return res.body;
      };

      // Same date, payment created earlier → payment sorts first chronologically
      await order({ card_id: selfCard._id, order_date: '2026-01-05', return_amount: 1000, model_ordered: 'O1', delivery_status: 'Delivered' }, '2026-01-05T10:00:00Z');
      await payment({ amount: 300, payment_date: '2026-01-05', notes: 'P1 cash' }, '2026-01-05T09:00:00Z');
      // Pending + cancelled + payment, all same date AND same created_at: insertion
      // order (orders first, then payments) decides
      await order({ card_id: friendCard._id, order_date: '2026-01-10', return_amount: 2000, friend_amount: 1900, quantity: 2, model_ordered: 'O2', delivery_status: 'Pending' }, '2026-01-10T10:00:00Z');
      await order({ card_id: selfCard._id, order_date: '2026-01-10', return_amount: 500, model_ordered: 'O3', delivery_status: 'Cancelled' }, '2026-01-10T10:00:00Z');
      await payment({ amount: 700, payment_date: '2026-01-10', notes: 'P2 upi' }, '2026-01-10T10:00:00Z');
      // Order whose card was deleted afterwards → card_id populates to null, booker null
      await order({ card_id: doomedCard._id, order_date: '2026-01-12', return_amount: 1500, model_ordered: 'O4', delivery_status: 'Delivered' }, '2026-01-12T08:00:00Z');
      await Card.deleteOne({ _id: doomedCard._id });
      await payment({ amount: 100, payment_date: '2026-01-12' }, '2026-01-12T07:00:00Z'); // no notes → default description
      await order({ card_id: friendCard._id, order_date: '2026-02-01', return_amount: 2500, friend_amount: 2400, quantity: 3, model_ordered: 'O5', delivery_status: 'Delivered' }, '2026-02-01T10:00:00Z');
      // Missing created_at counts as epoch → sorts before same-day payment
      await order({ card_id: selfCard._id, order_date: '2026-02-02', return_amount: 800, model_ordered: 'O6', delivery_status: 'Delivered' }, null);
      await payment({ amount: 50, payment_date: '2026-02-02', notes: 'P4' }, '2026-02-02T01:00:00Z');
      await order({ card_id: selfCard._id, order_date: '2026-02-03', return_amount: 1200.5, model_ordered: 'O7', delivery_status: 'Delivered' }, '2026-02-03T10:00:00Z');
      await payment({ amount: 0.1, payment_date: '2026-02-04', notes: 'P5' }, '2026-02-04T10:00:00Z');
      await payment({ amount: 0.2, payment_date: '2026-02-05', notes: 'P6' }, '2026-02-05T10:00:00Z');

      // Noise: another seller's order + payment must never appear
      await api().post('/api/orders', {
        seller_id: otherSellerId, card_id: selfCard._id, order_date: '2026-01-07', order_amount: 1, return_amount: 99999,
        model_ordered: 'NOISE', id_used: 'a', ecomm_site: 'Amazon', delivery_status: 'Delivered',
      });
      await api().post('/api/sellers/payment', { seller_id: otherSellerId, amount: 12345, payment_date: '2026-01-07' });
    });

    it('pages newest-first with running balance, tie-breaks and flags', async () => {
      const pages = [];
      for (let p = 1; p <= 4; p++) {
        const res = await api().get(`/api/sellers/${sellerId}/ledger-feed?page=${p}&limit=5`);
        expect(res.status).toBe(200);
        pages.push(res.body);
      }
      expect(pages.map(p => p.items.length)).toEqual([5, 5, 3, 0]);
      expect(pages[0].page).toEqual({ type: 'number', current: 1, size: 5, item_total: 13, has_next: true, has_previous: false });
      expect(pages[2].page).toEqual({ type: 'number', current: 3, size: 5, item_total: 13, has_next: false, has_previous: true });
      expect(pages[3].page).toEqual({ type: 'number', current: 4, size: 5, item_total: 13, has_next: false, has_previous: true });

      const all = pages.flatMap(p => p.items);
      expect(brief(all)).toEqual([
        ['PAYMENT', '', 'P6', 0.2, false, false, 5850.2],
        ['PAYMENT', '', 'P5', 0.1, false, false, 5850.4],
        ['ORDER', '', 'O7', 1200.5, false, false, 5850.5],
        ['PAYMENT', '', 'P4', 50, false, false, 4650],
        ['ORDER', '', 'O6', 800, false, false, 4700],              // no created_at → before same-day P4
        ['ORDER', '', 'O5 ×3', 2500, false, false, 3900],
        ['ORDER', '', 'O4', 1500, false, false, 1400],
        ['PAYMENT', '', 'Payment Received', 100, false, false, -100], // created before same-day O4
        ['PAYMENT', '', 'P2 upi', 700, false, false, 0],
        ['ORDER', '', 'O3', 500, true, true, 700],                 // cancelled: isPending too, never counts
        ['ORDER', '', 'O2 ×2', 2000, true, false, 700],            // pending: listed, not counted
        ['ORDER', '', 'O1', 1000, false, false, 700],
        ['PAYMENT', '', 'P1 cash', 300, false, false, -300],
      ]);

      // Key order of items is part of the contract
      expect(Object.keys(all.find(i => i.type === 'ORDER'))).toEqual(['id', 'type', 'date', 'description', 'amount', 'booker', 'raw', 'isCancelled', 'isPending', 'runningBalance']);
      expect(Object.keys(all.find(i => i.type === 'PAYMENT'))).toEqual(['id', 'type', 'date', 'description', 'amount', 'raw', 'isCancelled', 'isPending', 'runningBalance']);

      const o5 = all.find(i => i.description === 'O5 ×3');
      expect(o5.booker).toMatchObject({ name: 'Ravi', relation: 'friend' });
      expect(Object.keys(o5.raw.card_id)).toEqual(['_id', 'holder_id', 'card_type', 'bank_name', 'last_four_digit']);
      expect(Object.keys(o5.raw.card_id.holder_id)).toEqual(['_id', 'name', 'relation']);
      const o4 = all.find(i => i.description === 'O4');
      expect(o4.booker).toBeNull();
      expect(o4.raw.card_id).toBeNull();
      expect(all.find(i => i.description === 'O1').booker.relation).toBe('self');

      expect(normalize(pages)).toMatchSnapshot();
    });

    it('defaults to limit 10 and caps limit at 100', async () => {
      const def = await api().get(`/api/sellers/${sellerId}/ledger-feed`);
      expect(def.body.items).toHaveLength(10);
      expect(def.body.page).toMatchObject({ current: 1, size: 10, item_total: 13, has_next: true });

      const big = await api().get(`/api/sellers/${sellerId}/ledger-feed?limit=1000`);
      expect(big.body.items).toHaveLength(13);
      expect(big.body.page).toMatchObject({ size: 100, item_total: 13, has_next: false });
      expect(normalize(big.body)).toMatchSnapshot();
    });

    it('returns an empty page for a seller with no history or of another user', async () => {
      const empty = (await api().post('/api/sellers', { name: 'Empty', city: 'X' })).body._id;
      const res = await api().get(`/api/sellers/${empty}/ledger-feed`);
      expect(res.body).toEqual({ items: [], page: { type: 'number', current: 1, size: 10, item_total: 0, has_next: false, has_previous: false } });

      const other = await createTestUser({ email: 'other@example.com' });
      const theirs = await request(app).get(`/api/sellers/${sellerId}/ledger-feed`).set(authHeader(other.token));
      expect(theirs.body.items).toEqual([]);
      expect(theirs.body.page.item_total).toBe(0);
    });

    it('full payment list (used for PDFs) is unchanged', async () => {
      const res = await api().get(`/api/sellers/${sellerId}/payment`);
      expect(res.status).toBe(200);
      expect(res.body.map(p => p.amount)).toEqual([0.2, 0.1, 50, 100, 700, 300]);
      expect(Object.keys(res.body[0])).toEqual(['_id', 'user_id', 'seller_id', 'amount', 'payment_date', 'notes', 'receipt_url', 'created_at', 'updated_at', '__v']);
    });
  });

  // ── Customer khata entries feed ──────────────────────────────────────────
  describe('GET /api/customers/:customerId/entries-feed', () => {
    let customerId;

    beforeEach(async () => {
      customerId = (await api().post('/api/customers', { name: 'Amit' })).body._id;
      const otherId = (await api().post('/api/customers', { name: 'Noise' })).body._id;
      const entry = async (e, createdAt) => {
        const res = await api().post('/api/customers/entry', { customer_id: customerId, ...e });
        expect(res.status).toBe(201);
        await stamp(CustomerEntry, res.body._id, createdAt);
      };
      await entry({ type: 'gave', amount: 1000, entry_date: '2026-01-01', notes: 'E1' }, '2026-01-01T10:00:00Z');
      await entry({ type: 'got', amount: 400, entry_date: '2026-01-01', notes: 'E2' }, '2026-01-01T09:00:00Z');
      await entry({ type: 'gave', amount: 250, entry_date: '2026-01-03', notes: 'E3' }, '2026-01-03T10:00:00Z');
      await entry({ type: 'got', amount: 100, entry_date: '2026-01-03', notes: 'E4' }, '2026-01-03T10:00:00Z');
      await entry({ type: 'gave', amount: 50.5, entry_date: '2026-01-04' }, null);
      await entry({ type: 'got', amount: 0.1, entry_date: '2026-01-05', notes: 'E6' }, '2026-01-05T10:00:00Z');
      await entry({ type: 'got', amount: 0.2, entry_date: '2026-01-06', notes: 'E7' }, '2026-01-06T10:00:00Z');
      await api().post('/api/customers/entry', { customer_id: otherId, type: 'gave', amount: 999, entry_date: '2026-01-02' });
    });

    it('pages newest-first with running balance and tie-breaks', async () => {
      const pages = [];
      for (let p = 1; p <= 4; p++) {
        const res = await api().get(`/api/customers/${customerId}/entries-feed?page=${p}&limit=3`);
        expect(res.status).toBe(200);
        pages.push(res.body);
      }
      expect(pages.map(p => p.items.length)).toEqual([3, 3, 1, 0]);
      expect(pages[1].page).toEqual({ type: 'number', current: 2, size: 3, item_total: 7, has_next: true, has_previous: true });

      const all = pages.flatMap(p => p.items);
      expect(all.map(e => [e.notes, e.type, e.amount, e.runningBalance])).toEqual([
        // The JS implementation returned 800.1999999999999 here (naive `+=`); MongoDB's
        // $sum is compensated and yields the correctly rounded 800.2. Accepted:
        // the UI rounds to whole rupees and integer amounts are unaffected.
        ['E7', 'got', 0.2, 800.2],
        ['E6', 'got', 0.1, 800.4],
        ['', 'gave', 50.5, 800.5],
        ['E4', 'got', 100, 750],
        ['E3', 'gave', 250, 850],
        ['E1', 'gave', 1000, 600],
        ['E2', 'got', 400, -400],
      ]);
      expect(Object.keys(all[0])).toEqual(['_id', 'user_id', 'customer_id', 'type', 'amount', 'entry_date', 'notes', 'created_at', 'updated_at', '__v', 'runningBalance']);
      expect(Object.keys(all[2])).not.toContain('created_at');

      expect(normalize(pages)).toMatchSnapshot();
    });

    it('defaults to limit 10, caps at 100, and is empty for other users', async () => {
      const def = await api().get(`/api/customers/${customerId}/entries-feed`);
      expect(def.body.page).toEqual({ type: 'number', current: 1, size: 10, item_total: 7, has_next: false, has_previous: false });
      const big = await api().get(`/api/customers/${customerId}/entries-feed?limit=101`);
      expect(big.body.page.size).toBe(100);
      expect(normalize(big.body.items)).toBe(normalize(def.body.items));

      const other = await createTestUser({ email: 'other@example.com' });
      const theirs = await request(app).get(`/api/customers/${customerId}/entries-feed`).set(authHeader(other.token));
      expect(theirs.body.items).toEqual([]);
    });

    it('full entries list (used for PDFs) is unchanged', async () => {
      const res = await api().get(`/api/customers/${customerId}/entries`);
      expect(res.status).toBe(200);
      expect(res.body.map(e => e.amount)).toEqual([0.2, 0.1, 50.5, 250, 100, 1000, 400]);
    });
  });

  // ── Booker (friend) khata ────────────────────────────────────────────────
  describe('GET /api/people/:id/khata', () => {
    let friend;

    beforeEach(async () => {
      const sellerId = (await api().post('/api/sellers', { name: 'Shop', city: 'Patna' })).body._id;
      friend = (await api().post('/api/people', { name: 'Ravi', relation: 'friend' })).body;
      const sam = (await api().post('/api/people', { name: 'Sam', relation: 'friend' })).body;
      const c1 = (await api().post('/api/cards', cardFor(friend._id, '1111'))).body;
      const c2 = (await api().post('/api/cards', cardFor(friend._id, '2222'))).body;
      const samCard = (await api().post('/api/cards', cardFor(sam._id, '3333'))).body;

      const order = async (o, createdAt) => {
        const res = await api().post('/api/orders', {
          seller_id: sellerId, order_amount: 900, return_amount: 1000, id_used: 'a', ecomm_site: 'Amazon', ...o,
        });
        expect(res.status).toBe(201);
        await stamp(Order, res.body._id, createdAt);
        return res.body;
      };
      const pay = async (p, createdAt) => {
        const res = await api().post(`/api/people/${friend._id}/payments`, p);
        expect(res.status).toBe(201);
        await stamp(BookerPayment, res.body._id, createdAt);
      };

      await order({ card_id: c1._id, order_date: '2026-03-01', friend_amount: 50300, advance_amount: 10000, model_ordered: 'B1', delivery_status: 'Delivered' }, '2026-03-01T10:00:00Z');
      await order({ card_id: c2._id, order_date: '2026-03-02', friend_amount: 20000, advance_amount: 5000, model_ordered: 'B2', delivery_status: 'Pending' }, '2026-03-02T10:00:00Z');
      // Cancelled + delivered + payment on the same date and same created_at
      await order({ card_id: c1._id, order_date: '2026-03-03', friend_amount: 9000, advance_amount: 9000, model_ordered: 'B3', delivery_status: 'Cancelled' }, '2026-03-03T10:00:00Z');
      await order({ card_id: c2._id, order_date: '2026-03-03', friend_amount: 3000, model_ordered: 'B4', delivery_status: 'Delivered' }, '2026-03-03T10:00:00Z');
      await pay({ amount: 15000, payment_date: '2026-03-03', notes: 'UPI' }, '2026-03-03T10:00:00Z');
      await pay({ amount: 0.1, payment_date: '2026-03-04' }, '2026-03-04T10:00:00Z');
      await order({ card_id: c1._id, order_date: '2026-03-05', friend_amount: 7000, advance_amount: 7000, quantity: 2, model_ordered: 'B5', delivery_status: 'Delivered' }, null);
      // Payment created before the same-day order → sorts before it
      await pay({ amount: 0.2, payment_date: '2026-03-05', notes: 'early' }, '2026-03-05T01:00:00Z');

      // Excluded: friend-card order without friend_amount, and another friend's order
      await Order.create({
        user_id: user._id, card_id: c1._id, seller_id: sellerId, order_date: new Date('2026-03-04'), order_amount: 1, return_amount: 1,
        model_ordered: 'NOFRIEND', id_used: 'a', ecomm_site: 'Amazon', delivery_status: 'Delivered',
      });
      await order({ card_id: samCard._id, order_date: '2026-03-04', friend_amount: 111, advance_amount: 11, model_ordered: 'SAM', delivery_status: 'Delivered' }, '2026-03-04T10:00:00Z');
    });

    const TOTALS = { total_due: 60300, total_advance: 22000, total_payments: 15000.3, total_paid: 37000.3, pending_dues: 23299.699999999997 };

    it('pages newest-first with advances, payments, running balance and totals', async () => {
      const pages = [];
      for (let p = 1; p <= 4; p++) {
        const res = await api().get(`/api/people/${friend._id}/khata?page=${p}&limit=4`);
        expect(res.status).toBe(200);
        pages.push(res.body);
      }
      expect(pages.map(p => p.items.length)).toEqual([4, 4, 4, 0]);
      expect(Object.keys(pages[0])).toEqual(['items', 'page', 'totals']);
      expect(pages[0].page).toEqual({ type: 'number', current: 1, size: 4, item_total: 12, has_next: true, has_previous: false });
      for (const p of pages) expect(p.totals).toEqual(TOTALS);

      const all = pages.flatMap(p => p.items);
      expect(brief(all)).toEqual([
        ['PAYMENT', 'payment', 'early', 0.2, false, false, 23299.7],
        ['PAYMENT', 'advance', 'Advance · B5 ×2 · Shop', 7000, false, false, 23299.9],
        ['ORDER', '', 'B5 ×2 · Shop', 7000, false, false, 30299.9], // no created_at → first that day
        ['PAYMENT', 'payment', 'Payment made', 0.1, false, false, 23299.9],
        ['PAYMENT', 'payment', 'UPI', 15000, false, false, 23300],
        ['ORDER', '', 'B4 · Shop', 3000, false, false, 38300],
        ['PAYMENT', 'advance', 'Advance · B3 · Shop', 9000, false, true, 35300], // advance of cancelled order
        ['ORDER', '', 'B3 · Shop', 9000, false, true, 35300],
        ['PAYMENT', 'advance', 'Advance · B2 · Shop', 5000, false, false, 35300], // advance of pending order counts
        ['ORDER', '', 'B2 · Shop', 20000, true, false, 40300],
        ['PAYMENT', 'advance', 'Advance · B1 · Shop', 10000, false, false, 40300],
        ['ORDER', '', 'B1 · Shop', 50300, false, false, 50300],
      ]);

      const adv = all.find(i => i.subtype === 'advance');
      expect(Object.keys(adv)).toEqual(['id', 'type', 'subtype', 'order_id', 'date', 'amount', 'description', 'isPending', 'isCancelled', 'raw', 'runningBalance']);
      expect(adv.id).toBe(`${adv.order_id}-adv`);
      expect(Object.keys(all.find(i => i.type === 'ORDER'))).toEqual(['id', 'type', 'date', 'amount', 'description', 'isPending', 'isCancelled', 'raw', 'runningBalance']);
      expect(Object.keys(all.find(i => i.subtype === 'payment'))).toEqual(['id', 'type', 'subtype', 'date', 'amount', 'description', 'isPending', 'isCancelled', 'raw', 'runningBalance']);
      const b1 = all.find(i => i.description === 'B1 · Shop');
      expect(Object.keys(b1.raw.seller_id)).toEqual(['_id', 'name', 'city']);
      expect(Object.keys(b1.raw.card_id)).toEqual(['_id', 'bank_name', 'last_four_digit']);

      expect(normalize(pages)).toMatchSnapshot();
    });

    it('?all=true returns every item newest-first with totals and no page', async () => {
      const res = await api().get(`/api/people/${friend._id}/khata?all=true&limit=2`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['items', 'totals']);
      expect(res.body.items).toHaveLength(12);
      expect(res.body.totals).toEqual(TOTALS);

      const paged = await api().get(`/api/people/${friend._id}/khata?limit=100`);
      expect(normalize(res.body.items)).toBe(normalize(paged.body.items));
      expect(normalize(res.body)).toMatchSnapshot();
    });

    it('friend with no cards gets an empty khata', async () => {
      const lonely = (await api().post('/api/people', { name: 'Lonely', relation: 'friend' })).body;
      const res = await api().get(`/api/people/${lonely._id}/khata`);
      expect(res.body).toEqual({
        items: [],
        page: { type: 'number', current: 1, size: 10, item_total: 0, has_next: false, has_previous: false },
        totals: { total_due: 0, total_advance: 0, total_payments: 0, total_paid: 0, pending_dues: 0 },
      });
    });
  });
});

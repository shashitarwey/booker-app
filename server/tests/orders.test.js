const request = require('supertest');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
const ActivityLog = require('../models/ActivityLog');
require('./setup');

describe('Orders Routes', () => {
  let token, cardId, sellerId;

  beforeEach(async () => {
    const testUser = await createTestUser();
    token = testUser.token;

    const card = await request(app).post('/api/cards').set(authHeader(token)).send({
      bank_name: 'ICICI Bank', card_network: 'Mastercard',
      last_four_digit: '5678', name_on_card: 'TEST',
    });
    cardId = card.body._id;

    const seller = await request(app).post('/api/sellers').set(authHeader(token)).send({
      name: 'Test Seller', city: 'Mumbai',
    });
    sellerId = seller.body._id;
  });

  const makeOrder = (overrides = {}) => ({
    order_date: '2026-03-01',
    order_amount: 10000,
    return_amount: 10500,
    quantity: 1,
    cashback: 0,
    variant: 'NA',
    model_ordered: 'iPhone 15',
    id_used: 'test@email.com',
    delivery_status: 'Pending',
    ecomm_site: 'Amazon',
    ...overrides,
  });

  describe('POST /api/orders', () => {
    it('should create an order', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));
      expect(res.status).toBe(201);
      expect(res.body.model_ordered).toBe('iPhone 15');
    });

    it('should reject without card_id', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set(authHeader(token))
        .send(makeOrder({ seller_id: sellerId }));
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/orders', () => {
    it('should return orders with filters', async () => {
      await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));

      const res = await request(app)
        .get('/api/orders')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should filter by seller', async () => {
      await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));

      const res = await request(app)
        .get('/api/orders')
        .query({ seller_id: sellerId })
        .set(authHeader(token));
      expect(res.body.items).toHaveLength(1);
    });
  });

  describe('GET /api/orders search (model_ordered param)', () => {
    it('should not 500 on regex special characters and match them literally', async () => {
      await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId, model_ordered: 'Pixel (8) [Pro]' }));
      await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId, model_ordered: 'Galaxy S24' }));

      for (const term of ['(', '[', '*', '+?', '\\', '.*']) {
        const res = await request(app).get('/api/orders').query({ model_ordered: term }).set(authHeader(token));
        expect(res.status).toBe(200);
      }

      const lit = await request(app).get('/api/orders').query({ model_ordered: '(8) [' }).set(authHeader(token));
      expect(lit.body.items).toHaveLength(1);
      expect(lit.body.items[0].model_ordered).toBe('Pixel (8) [Pro]');

      // ".*" must be literal, not "match everything"
      const dotStar = await request(app).get('/api/orders').query({ model_ordered: '.*' }).set(authHeader(token));
      expect(dotStar.body.items).toHaveLength(0);
      expect(dotStar.body.summary.total_order_amount).toBe(0);
    });

    it('should find orders by remark (case-insensitive) and scope the summary to the match', async () => {
      await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId, remark: 'Gift for Diwali', order_amount: 7000 }));
      await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId, remark: 'restock', order_amount: 3000 }));

      const res = await request(app).get('/api/orders').query({ model_ordered: 'diwali' }).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].remark).toBe('Gift for Diwali');
      expect(res.body.summary.total_order_amount).toBe(7000);
    });

    it('should search variant, id_used and ecomm_site too, but never another user\'s orders', async () => {
      await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId, variant: '256GB', id_used: 'buyer1@mail.com', ecomm_site: 'Flipkart' }));

      for (const term of ['256gb', 'BUYER1@', 'flipk']) {
        const res = await request(app).get('/api/orders').query({ model_ordered: term }).set(authHeader(token));
        expect(res.body.items).toHaveLength(1);
      }

      const other = await createTestUser({ email: 'search-other@test.com' });
      const res = await request(app).get('/api/orders').query({ model_ordered: 'flipk' }).set(authHeader(other.token));
      expect(res.body.items).toHaveLength(0);
    });
  });

  describe('activity snapshots', () => {
    // logActivity is fire-and-forget — poll briefly for the entry
    const waitForLog = async (entityId, action) => {
      for (let i = 0; i < 50; i++) {
        const log = await ActivityLog.findOne({ entity_id: entityId, action }).lean();
        if (log) return log;
        await new Promise(r => setTimeout(r, 20));
      }
      throw new Error(`no ${action} log for ${entityId}`);
    };

    it('should label card_id and seller_id on create, update and delete', async () => {
      const created = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));
      const id = created.body._id;
      const expected = { card_id: 'ICICI Bank •••• 5678', seller_id: 'Test Seller, Mumbai' };

      expect((await waitForLog(id, 'created')).snapshot).toMatchObject(expected);

      // Partial update: neither card nor seller is loaded by the handler, so
      // labels come from the populate on the update query
      const upd = await request(app).put(`/api/orders/${id}`).set(authHeader(token)).send({ remark: 'note' });
      expect(upd.body.card_id).toBe(cardId); // response stays unpopulated
      expect(upd.body.seller_id).toBe(sellerId);
      const updLog = await waitForLog(id, 'updated');
      expect(updLog.snapshot).toMatchObject({ ...expected, remark: 'note' });
      expect(updLog.changed_fields).toEqual(['remark']);

      await request(app).delete(`/api/orders/${id}`).set(authHeader(token));
      expect((await waitForLog(id, 'deleted')).snapshot).toMatchObject(expected);
    });
  });

  describe('PUT /api/orders/:id', () => {
    it('should update an order', async () => {
      const created = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));

      const res = await request(app)
        .put(`/api/orders/${created.body._id}`)
        .set(authHeader(token))
        .send({ delivery_status: 'Delivered', delivered_date: '2026-03-05' });
      expect(res.status).toBe(200);
      expect(res.body.delivery_status).toBe('Delivered');
    });
  });

  describe('DELETE /api/orders/:id', () => {
    it('should delete an order', async () => {
      const created = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));

      const res = await request(app)
        .delete(`/api/orders/${created.body._id}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
    });
  });

  // ── Bulk actions ─────────────────────────────────────────────────────────
  describe('POST /api/orders/bulk/status', () => {
    it('should bulk update delivery status', async () => {
      const o1 = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId, model_ordered: 'A' }));
      const o2 = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId, model_ordered: 'B' }));

      const res = await request(app)
        .post('/api/orders/bulk/status')
        .set(authHeader(token))
        .send({ ids: [o1.body._id, o2.body._id], delivery_status: 'Delivered', delivered_date: '2026-04-10' });
      expect(res.status).toBe(200);
      expect(res.body.modified).toBe(2);

      const check = await request(app).get('/api/orders?all=true').set(authHeader(token));
      expect(check.body.every(o => o.delivery_status === 'Delivered')).toBe(true);
    });

    it('should reject empty ids array', async () => {
      const res = await request(app)
        .post('/api/orders/bulk/status')
        .set(authHeader(token))
        .send({ ids: [], delivery_status: 'Delivered' });
      expect(res.status).toBe(400);
    });

    it('should not update another users orders', async () => {
      const o = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));

      const other = await createTestUser({ email: 'other@test.com' });
      const res = await request(app)
        .post('/api/orders/bulk/status')
        .set(authHeader(other.token))
        .send({ ids: [o.body._id], delivery_status: 'Delivered' });
      expect(res.body.modified).toBe(0);
    });
  });

  describe('POST /api/orders/bulk/clear', () => {
    it('should bulk mark orders as cleared', async () => {
      const o1 = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));
      const o2 = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));

      const res = await request(app)
        .post('/api/orders/bulk/clear')
        .set(authHeader(token))
        .send({ ids: [o1.body._id, o2.body._id], is_cleared: true });
      expect(res.status).toBe(200);
      expect(res.body.modified).toBe(2);

      const check = await request(app).get('/api/orders?all=true').set(authHeader(token));
      expect(check.body.every(o => o.is_cleared === true)).toBe(true);
    });
  });

  describe('POST /api/orders/bulk/delete', () => {
    it('should bulk delete orders', async () => {
      const o1 = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));
      const o2 = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));

      const res = await request(app)
        .post('/api/orders/bulk/delete')
        .set(authHeader(token))
        .send({ ids: [o1.body._id, o2.body._id] });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(2);

      const check = await request(app).get('/api/orders').set(authHeader(token));
      expect(check.body.items).toHaveLength(0);
    });

    it('should not delete another users orders', async () => {
      const o = await request(app).post('/api/orders').set(authHeader(token))
        .send(makeOrder({ card_id: cardId, seller_id: sellerId }));

      const other = await createTestUser({ email: 'other@test.com' });
      const res = await request(app)
        .post('/api/orders/bulk/delete')
        .set(authHeader(other.token))
        .send({ ids: [o.body._id] });
      expect(res.body.deleted).toBe(0);

      // Original order still exists
      const check = await request(app).get('/api/orders').set(authHeader(token));
      expect(check.body.items).toHaveLength(1);
    });
  });
});

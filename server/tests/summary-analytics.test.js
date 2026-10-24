const request = require('supertest');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
require('./setup');

describe('Summary & Analytics Routes', () => {
  let token, cardId, sellerId;

  beforeEach(async () => {
    const testUser = await createTestUser();
    token = testUser.token;

    const card = await request(app).post('/api/cards').set(authHeader(token)).send({
      bank_name: 'HDFC Bank', card_network: 'Visa',
      last_four_digit: '1111', name_on_card: 'TEST',
    });
    cardId = card.body._id;

    const seller = await request(app).post('/api/sellers').set(authHeader(token)).send({
      name: 'Analytics Seller', city: 'Pune',
    });
    sellerId = seller.body._id;
  });

  describe('GET /api/summary', () => {
    it('should return summary with cards and banks', async () => {
      await request(app).post('/api/transactions').set(authHeader(token))
        .send({ card_id: cardId, amount: 5000, description: 'Test spend' });

      const res = await request(app)
        .get('/api/summary')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('cards');
      expect(res.body).toHaveProperty('banks');
      expect(res.body).toHaveProperty('grand_total');
    });

    it('should filter by date range', async () => {
      const res = await request(app)
        .get('/api/summary')
        .query({ from_date: '2026-01-01', to_date: '2026-12-31' })
        .set(authHeader(token));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/analytics/profit', () => {
    it('should return analytics data', async () => {
      // Create a delivered order for analytics
      await request(app).post('/api/orders').set(authHeader(token)).send({
        card_id: cardId, seller_id: sellerId,
        order_date: '2026-02-01', delivered_date: '2026-02-05',
        order_amount: 10000, return_amount: 10500,
        model_ordered: 'Samsung S24', id_used: 'test@mail.com',
        delivery_status: 'Delivered', ecomm_site: 'Amazon',
      });

      const res = await request(app)
        .get('/api/analytics/profit')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totals');
      expect(res.body).toHaveProperty('monthly');
      expect(res.body).toHaveProperty('bySeller');
      expect(res.body.totals.order_count).toBe(1);
      expect(res.body.totals.profit).toBe(500);
    });

    it('should return empty totals with no delivered orders', async () => {
      const res = await request(app)
        .get('/api/analytics/profit')
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.totals.order_count).toBe(0);
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('mongo');
    });
  });
});

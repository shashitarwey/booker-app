const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Transaction = require('../models/Transaction');
const { createTestUser, authHeader } = require('./helpers');
require('./setup');

describe('Transactions Routes', () => {
  let token, cardId, userId;

  beforeEach(async () => {
    const testUser = await createTestUser();
    token = testUser.token;
    userId = String(testUser.user._id);

    const card = await request(app).post('/api/cards').set(authHeader(token)).send({
      bank_name: 'Axis Bank', card_network: 'Visa',
      last_four_digit: '4321', name_on_card: 'TEST',
    });
    cardId = card.body._id;
  });

  describe('POST /api/transactions', () => {
    it('should create a transaction', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set(authHeader(token))
        .send({ card_id: cardId, amount: 500, description: 'Groceries', date: '2026-03-15' });
      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(500);
      expect(res.body.user_id).toBe(userId);
    });

    it('should reject invalid amount', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set(authHeader(token))
        .send({ card_id: cardId, amount: 0 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/transactions', () => {
    it('should return merged transactions + orders', async () => {
      await request(app).post('/api/transactions').set(authHeader(token))
        .send({ card_id: cardId, amount: 1000, description: 'Test' });

      const res = await request(app)
        .get('/api/transactions')
        .query({ cardId })
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DELETE /api/transactions/:id', () => {
    it('should delete a transaction', async () => {
      const created = await request(app).post('/api/transactions').set(authHeader(token))
        .send({ card_id: cardId, amount: 200, description: 'Delete me' });

      const res = await request(app)
        .delete(`/api/transactions/${created.body._id}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
    });

    it('should not delete another users transaction', async () => {
      const created = await request(app).post('/api/transactions').set(authHeader(token))
        .send({ card_id: cardId, amount: 200 });
      const other = await createTestUser({ email: 'other@test.com' });
      const res = await request(app)
        .delete(`/api/transactions/${created.body._id}`)
        .set(authHeader(other.token));
      expect(res.status).toBe(404);
      expect(await Transaction.exists({ _id: created.body._id })).toBeTruthy();
    });

    it('should still delete (and list) a legacy transaction without user_id', async () => {
      // Pre-backfill doc: only card_id, written straight to the collection
      const { insertedId } = await Transaction.collection.insertOne({
        card_id: new mongoose.Types.ObjectId(cardId), amount: 300, description: 'Legacy', date: new Date(),
      });

      const list = await request(app).get('/api/transactions').set(authHeader(token));
      expect(list.body.items.map(i => i.description)).toContain('Legacy');

      const other = await createTestUser({ email: 'other2@test.com' });
      const denied = await request(app).delete(`/api/transactions/${insertedId}`).set(authHeader(other.token));
      expect(denied.status).toBe(404);

      const res = await request(app).delete(`/api/transactions/${insertedId}`).set(authHeader(token));
      expect(res.status).toBe(200);
      expect(await Transaction.exists({ _id: insertedId })).toBeNull();
    });
  });
});

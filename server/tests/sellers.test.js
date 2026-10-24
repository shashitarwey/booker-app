const request = require('supertest');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
require('./setup');

describe('Sellers Routes', () => {
  let token;

  beforeEach(async () => {
    const testUser = await createTestUser();
    token = testUser.token;
  });

  describe('POST /api/sellers', () => {
    it('should create a seller', async () => {
      const res = await request(app)
        .post('/api/sellers')
        .set(authHeader(token))
        .send({ name: 'Prakash', city: 'Delhi', phone: '9876543210' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Prakash');
    });

    it('should reject without name', async () => {
      const res = await request(app)
        .post('/api/sellers')
        .set(authHeader(token))
        .send({ city: 'Delhi' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/sellers', () => {
    it('should return sellers with stats', async () => {
      await request(app).post('/api/sellers').set(authHeader(token))
        .send({ name: 'A', city: 'X' });
      const res = await request(app).get('/api/sellers').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toHaveProperty('due_balance');
    });
  });

  describe('GET /api/sellers/:id', () => {
    it('should return a single seller', async () => {
      const created = await request(app).post('/api/sellers').set(authHeader(token))
        .send({ name: 'B', city: 'Y' });
      const res = await request(app)
        .get(`/api/sellers/${created.body._id}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('B');
    });
  });

  describe('PUT /api/sellers/:id', () => {
    it('should update a seller', async () => {
      const created = await request(app).post('/api/sellers').set(authHeader(token))
        .send({ name: 'Old', city: 'Old City' });
      const res = await request(app)
        .put(`/api/sellers/${created.body._id}`)
        .set(authHeader(token))
        .send({ name: 'New Name' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
    });
  });

  describe('DELETE /api/sellers/:id', () => {
    it('should delete a seller with no orders', async () => {
      const created = await request(app).post('/api/sellers').set(authHeader(token))
        .send({ name: 'Delete Me', city: 'Z' });
      const res = await request(app)
        .delete(`/api/sellers/${created.body._id}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
    });

    it('should reject deleting seller with orders', async () => {
      const seller = await request(app).post('/api/sellers').set(authHeader(token))
        .send({ name: 'HasOrders', city: 'Z' });
      const card = await request(app).post('/api/cards').set(authHeader(token))
        .send({ bank_name: 'SBI', card_network: 'Visa', last_four_digit: '9999', name_on_card: 'T' });

      await request(app).post('/api/orders').set(authHeader(token)).send({
        card_id: card.body._id, seller_id: seller.body._id,
        order_date: '2026-01-01', order_amount: 1000, return_amount: 1100,
        model_ordered: 'Test', id_used: 'test', ecomm_site: 'Amazon',
      });

      const res = await request(app)
        .delete(`/api/sellers/${seller.body._id}`)
        .set(authHeader(token));
      expect(res.status).toBe(400);
    });
  });

  describe('Seller Payments', () => {
    it('should add and list payments', async () => {
      const seller = await request(app).post('/api/sellers').set(authHeader(token))
        .send({ name: 'PaySeller', city: 'Pay City' });

      const addRes = await request(app)
        .post('/api/sellers/payment')
        .set(authHeader(token))
        .field('seller_id', seller.body._id)
        .field('amount', '5000')
        .field('payment_date', '2026-03-15');
      expect(addRes.status).toBe(201);

      const listRes = await request(app)
        .get(`/api/sellers/${seller.body._id}/payment`)
        .set(authHeader(token));
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].amount).toBe(5000);
    });

    it('should delete a payment', async () => {
      const seller = await request(app).post('/api/sellers').set(authHeader(token))
        .send({ name: 'DelPay', city: 'C' });
      const payment = await request(app)
        .post('/api/sellers/payment')
        .set(authHeader(token))
        .field('seller_id', seller.body._id)
        .field('amount', '3000')
        .field('payment_date', '2026-03-10');

      const res = await request(app)
        .delete(`/api/sellers/payment/${payment.body._id}`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
    });
  });

  describe('integrity guards', () => {
    it('blocks deleting a buyer that has payments, and ignores an empty amount on payment edit', async () => {
      const seller = (await request(app).post('/api/sellers').set(authHeader(token)).send({ name: 'Pay Only', city: 'X' })).body;
      const pay = (await request(app).post('/api/sellers/payment').set(authHeader(token)).send({ seller_id: seller._id, amount: 5000, payment_date: '2026-03-01' })).body;
      const del = await request(app).delete(`/api/sellers/${seller._id}`).set(authHeader(token));
      expect(del.status).toBe(400);
      const edit = await request(app).put(`/api/sellers/payment/${pay._id}`).set(authHeader(token)).send({ amount: '', notes: 'x' });
      expect(edit.status).toBe(200);
      expect(edit.body.amount).toBe(5000);
    });
  });
});

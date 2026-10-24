const request = require('supertest');
const app = require('../app');
const { buildUserDataSnapshot } = require('../routes/ai');
const { createTestUser, authHeader } = require('./helpers');
require('./setup');

describe('AI data snapshot', () => {
  it('sends aggregates (analytics, buyer dues, top items) plus a bounded set of recent orders', async () => {
    const { user, token } = await createTestUser();
    const h = authHeader(token);
    const friend = (await request(app).post('/api/people').set(h).send({ name: 'Ravi', relation: 'friend' })).body;
    const own = (await request(app).post('/api/cards').set(h).send({ bank_name: 'HDFC Bank', card_network: 'Visa', last_four_digit: '1111', name_on_card: 'X' })).body;
    const fr = (await request(app).post('/api/cards').set(h).send({ bank_name: 'Axis Bank', card_network: 'Visa', last_four_digit: '2222', name_on_card: 'X', holder_id: friend._id })).body;
    const seller = (await request(app).post('/api/sellers').set(h).send({ name: 'Shop', city: 'Patna' })).body;
    const order = (card_id, extra) => request(app).post('/api/orders').set(h).send({
      card_id, seller_id: seller._id, order_date: '2026-05-01', order_amount: 1000, return_amount: 1100,
      model_ordered: 'Phone', id_used: 'a', ecomm_site: 'Amazon', delivery_status: 'Delivered', ...extra,
    });
    await order(own._id);
    await order(fr._id, { friend_amount: 1050 });
    await request(app).post('/api/sellers/payment').set(h).send({ seller_id: seller._id, amount: 200, payment_date: '2026-05-02' });

    const snap = await buildUserDataSnapshot(String(user._id));
    expect(snap.analytics.totals.profit).toBe(150);          // 100 own + 50 booker
    expect(snap.analytics.bySource.bookers.profit).toBe(50);
    expect(snap.buyers[0]).toMatchObject({ name: 'Shop', expected: 2200, received: 200, due: 2000 });
    expect(snap.top_items[0]).toMatchObject({ item: 'Phone', orders: 2, profit: 150 });
    expect(snap.recent_orders).toHaveLength(2);
    expect(snap.recent_orders.find(o => o.return_to_friend === 1050).booker).toMatchObject({ name: 'Ravi', relation: 'friend' });
    expect(snap.meta).toMatchObject({ order_count_total: 2, recent_orders_included: 2 });
  });
});

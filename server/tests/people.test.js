const request = require('supertest');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
require('./setup');

describe('People, holder cards & friend orders', () => {
  let token, sellerId;

  const api = () => ({
    get: (url) => request(app).get(url).set(authHeader(token)),
    post: (url, body) => request(app).post(url).set(authHeader(token)).send(body),
    put: (url, body) => request(app).put(url).set(authHeader(token)).send(body),
    del: (url) => request(app).delete(url).set(authHeader(token)),
  });

  const cardFor = (holder_id, overrides = {}) => ({
    bank_name: 'HDFC Bank', card_network: 'Visa', last_four_digit: '1111', name_on_card: 'X',
    holder_id, ...overrides,
  });

  const makeOrder = (card_id, overrides = {}) => ({
    card_id, seller_id: sellerId,
    order_date: '2026-03-01', order_amount: 50000, return_amount: 51000, cashback: 2500,
    model_ordered: 'Galaxy S25', id_used: 'acc@x.com', ecomm_site: 'Amazon', delivery_status: 'Delivered',
    ...overrides,
  });

  beforeEach(async () => {
    ({ token } = await createTestUser());
    sellerId = (await api().post('/api/sellers', { name: 'Shop', city: 'Patna' })).body._id;
  });

  describe('people CRUD', () => {
    it('auto-creates exactly one self person', async () => {
      await api().get('/api/people');
      const res = await api().get('/api/people');
      expect(res.status).toBe(200);
      expect(res.body.filter(p => p.relation === 'self')).toHaveLength(1);
    });

    it('creates family and friends, sorted self → family → friend', async () => {
      await api().post('/api/people', { name: 'Zed', relation: 'friend' });
      await api().post('/api/people', { name: 'Mom', relation: 'family' });
      const res = await api().get('/api/people');
      expect(res.body.map(p => p.relation)).toEqual(['self', 'family', 'friend']);
    });

    it('rejects creating another self', async () => {
      const res = await api().post('/api/people', { name: 'Me 2', relation: 'self' });
      expect(res.status).toBe(400);
    });

    it('cannot delete self, and cannot delete a person who still holds cards', async () => {
      const self = (await api().get('/api/people')).body[0];
      expect((await api().del(`/api/people/${self._id}`)).status).toBe(400);

      const friend = (await api().post('/api/people', { name: 'Ravi', relation: 'friend' })).body;
      const card = (await api().post('/api/cards', cardFor(friend._id))).body;
      expect((await api().del(`/api/people/${friend._id}`)).status).toBe(400);

      await api().del(`/api/cards/${card._id}`);
      expect((await api().del(`/api/people/${friend._id}`)).status).toBe(200);
    });
  });

  describe('cards', () => {
    it('defaults holder to self and returns populated holder', async () => {
      const res = await api().post('/api/cards', cardFor(undefined));
      expect(res.status).toBe(201);
      expect(res.body.holder_id.relation).toBe('self');
      expect(res.body.card_type).toBe('primary');
    });

    it('filters cards by holder', async () => {
      const mom = (await api().post('/api/people', { name: 'Mom', relation: 'family' })).body;
      await api().post('/api/cards', cardFor(mom._id));
      await api().post('/api/cards', cardFor(undefined, { last_four_digit: '2222' }));
      const res = await api().get(`/api/cards?holder_id=${mom._id}`);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].holder_id.name).toBe('Mom');
    });

    it('links an add-on to a primary card and rejects add-on → add-on', async () => {
      const mom = (await api().post('/api/people', { name: 'Mom', relation: 'family' })).body;
      const primary = (await api().post('/api/cards', cardFor(undefined))).body;
      const addon = await api().post('/api/cards', cardFor(mom._id, { card_type: 'addon', primary_card_id: primary._id, last_four_digit: '3333' }));
      expect(addon.status).toBe(201);
      expect(addon.body.primary_card_id).toBe(primary._id);

      const bad = await api().post('/api/cards', cardFor(mom._id, { card_type: 'addon', primary_card_id: addon.body._id }));
      expect(bad.status).toBe(400);
    });

    it("rejects another user's person as holder", async () => {
      const other = await createTestUser({ email: 'other@example.com' });
      const theirFriend = await request(app).post('/api/people').set(authHeader(other.token)).send({ name: 'X', relation: 'friend' });
      const res = await api().post('/api/cards', cardFor(theirFriend.body._id));
      expect(res.status).toBe(400);
    });
  });

  describe('friend orders & profit', () => {
    let friend, friendCard, ownCard;

    beforeEach(async () => {
      friend = (await api().post('/api/people', { name: 'Ravi', relation: 'friend' })).body;
      friendCard = (await api().post('/api/cards', cardFor(friend._id))).body;
      ownCard = (await api().post('/api/cards', cardFor(undefined, { last_four_digit: '9999' }))).body;
    });

    it("requires friend_amount on a friend's card", async () => {
      const res = await api().post('/api/orders', makeOrder(friendCard._id));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/return amount to friend/i);
    });

    it('ignores friend_amount on own cards', async () => {
      const res = await api().post('/api/orders', makeOrder(ownCard._id, { friend_amount: 50300 }));
      expect(res.status).toBe(201);
      expect(res.body.friend_amount).toBeNull();
    });

    it('computes my profit = return − given to friend; own = return − order + cashback', async () => {
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300 }));
      await api().post('/api/orders', makeOrder(ownCard._id));

      const friendView = await api().get(`/api/orders?person_id=${friend._id}`);
      expect(friendView.body.items).toHaveLength(1);
      expect(friendView.body.summary.total_profit).toBe(700);           // 51000 − 50300
      expect(friendView.body.summary.total_friend_amount).toBe(50300);
      expect(friendView.body.summary.total_friend_earning).toBe(2800); // 50300 − 50000 + 2500
      expect(friendView.body.items[0].card_id.holder_id.relation).toBe('friend');

      const all = await api().get('/api/orders');
      expect(all.body.summary.total_profit).toBe(700 + 3500);          // own: 51000 − 50000 + 2500

      const analytics = await api().get('/api/analytics/profit');
      expect(analytics.body.totals.profit).toBe(4200);

      const sellers = await api().get('/api/sellers?all=true');
      expect(sellers.body[0].profit).toBe(4200);

      const people = (await api().get('/api/people')).body;
      expect(people.find(p => p._id === friend._id)).toMatchObject({ card_count: 1, order_count: 1, delivered_count: 1, my_profit: 700, friend_earning: 2800, pending_dues: 50300 });
      expect(people.find(p => p.relation === 'self')).toMatchObject({ my_profit: 3500 });
    });

    it('pending dues only count delivered friend orders', async () => {
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300 }));
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 20000, delivery_status: 'Pending' }));
      const p = (await api().get('/api/people')).body.find(x => x._id === friend._id);
      expect(p).toMatchObject({ delivered_count: 1, pending_count: 1, pending_dues: 50300 });
    });

    it('advance reduces pending dues and cannot exceed return to friend', async () => {
      const bad = await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300, advance_amount: 60000 }));
      expect(bad.status).toBe(400);

      const ok = await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300, advance_amount: 20000 }));
      expect(ok.status).toBe(201);
      expect(ok.body.advance_amount).toBe(20000);

      const p = (await api().get('/api/people')).body.find(x => x._id === friend._id);
      expect(p).toMatchObject({ total_advance: 20000, pending_dues: 30300, my_profit: 700 });

      const orders = await api().get(`/api/orders?person_id=${friend._id}`);
      expect(orders.body.summary.total_advance).toBe(20000);

      // Removing the advance on edit
      const edited = await api().put(`/api/orders/${ok.body._id}`, { advance_amount: 0 });
      expect(edited.body.advance_amount).toBeNull();
    });

    it('drops advance on own cards', async () => {
      const res = await api().post('/api/orders', makeOrder(ownCard._id, { advance_amount: 5000 }));
      expect(res.body.advance_amount).toBeNull();
    });

    it('buyer ledger feed shows who booked each order', async () => {
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300 }));
      const feed = await api().get(`/api/sellers/${sellerId}/ledger-feed`);
      expect(feed.body.items[0].booker).toMatchObject({ name: 'Ravi', relation: 'friend' });
    });

    it('booker khata: delivered orders owed, advances + payments paid, running balance', async () => {
      await api().post('/api/orders', makeOrder(friendCard._id, { order_date: '2026-03-01', friend_amount: 50300, advance_amount: 10000 }));
      // Pending order with advance: advance counts, the order does not (yet)
      await api().post('/api/orders', makeOrder(friendCard._id, { order_date: '2026-03-02', friend_amount: 20000, advance_amount: 5000, delivery_status: 'Pending' }));
      // Cancelled order + its advance never count
      await api().post('/api/orders', makeOrder(friendCard._id, { order_date: '2026-03-03', friend_amount: 9000, advance_amount: 9000, delivery_status: 'Cancelled' }));
      const pay = await api().post(`/api/people/${friend._id}/payments`, { amount: 15000, payment_date: '2026-03-05', notes: 'UPI' });
      expect(pay.status).toBe(201);

      const khata = await api().get(`/api/people/${friend._id}/khata`);
      expect(khata.status).toBe(200);
      expect(khata.body.totals).toMatchObject({ total_due: 50300, total_advance: 15000, total_payments: 15000, total_paid: 30000, pending_dues: 20300 });
      // newest first; first item is the payment, its running balance is the final balance
      expect(khata.body.items[0]).toMatchObject({ type: 'PAYMENT', subtype: 'payment', runningBalance: 20300 });
      expect(khata.body.items.filter(i => i.subtype === 'advance')).toHaveLength(3);

      const p = (await api().get('/api/people')).body.find(x => x._id === friend._id);
      expect(p.pending_dues).toBe(20300);

      // edit + delete payment
      const edited = await api().put(`/api/people/payments/${pay.body._id}`, { amount: 300 });
      expect(edited.body.amount).toBe(300);
      expect((await api().get(`/api/people/${friend._id}/khata`)).body.totals.pending_dues).toBe(35000);
      expect((await api().del(`/api/people/payments/${pay.body._id}`)).status).toBe(200);
    });

    it('khata is only for friends and rejects bad payments', async () => {
      const self = (await api().get('/api/people')).body.find(x => x.relation === 'self');
      expect((await api().get(`/api/people/${self._id}/khata`)).status).toBe(400);
      expect((await api().post(`/api/people/${friend._id}/payments`, { amount: 0, payment_date: '2026-03-05' })).status).toBe(400);
    });

    it('analytics: profit by booker, own vs bookers, cash position', async () => {
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300, advance_amount: 10000 }));
      await api().post('/api/orders', makeOrder(ownCard._id));
      await api().post('/api/orders', makeOrder(ownCard._id, { delivery_status: 'Pending', order_amount: 1000, return_amount: 1200 }));
      await api().post('/api/sellers/payment', { seller_id: sellerId, amount: 2000, payment_date: '2026-03-02' });

      const a = (await api().get('/api/analytics/profit')).body;
      expect(a.byBooker.find(b => b.name === 'Ravi')).toMatchObject({ relation: 'friend', profit: 700, profit_percent: 1.4, friend_earning: 2800, pending_dues: 40300 });
      expect(a.bySource.own.profit).toBe(3500);
      expect(a.bySource.bookers.profit).toBe(700);
      // receivable: 2 delivered × 51000 − 2000 paid; payable: 50300 − 10000 advance
      expect(a.position).toMatchObject({ receivable: 100000, payable: 40300, pending_orders: 1, pending_order_amount: 1000, net: 59700 });
    });

    it("person_id=family / holder_id=family cover self + family, not bookers", async () => {
      const mom = (await api().post('/api/people', { name: 'Mom', relation: 'family' })).body;
      const momCard = (await api().post('/api/cards', cardFor(mom._id, { last_four_digit: '7777' }))).body;
      await api().post('/api/orders', makeOrder(ownCard._id));
      await api().post('/api/orders', makeOrder(momCard._id));
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300 }));

      const orders = await api().get('/api/orders?person_id=family');
      expect(orders.status).toBe(200);
      expect(orders.body.items).toHaveLength(2);
      expect(orders.body.summary.total_profit).toBe(7000);

      const cards = await api().get('/api/cards?holder_id=family');
      expect(cards.body.map(c => c.last_four_digit).sort()).toEqual(['7777', '9999']);
    });

    it('summary returns per-card profit for the period', async () => {
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300 }));
      await api().post('/api/orders', makeOrder(ownCard._id));
      await api().post('/api/orders', makeOrder(ownCard._id, { delivery_status: 'Cancelled' }));
      const sum = (await api().get('/api/summary?from_date=2026-01-01&to_date=2026-12-31')).body;
      expect(sum.cards.find(c => c._id === friendCard._id)).toMatchObject({ profit: 700, order_count: 1 });
      expect(sum.cards.find(c => c._id === ownCard._id)).toMatchObject({ profit: 3500, order_count: 1 });
    });

    it('blocks deleting a card that still has orders', async () => {
      const o = (await api().post('/api/orders', makeOrder(ownCard._id))).body;
      const res = await api().del(`/api/cards/${ownCard._id}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1 order/);
      await api().del(`/api/orders/${o._id}`);
      expect((await api().del(`/api/cards/${ownCard._id}`)).status).toBe(200);
    });

    it('booker payments refresh cached people stats (scoped cache invalidation)', async () => {
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300 }));
      const before = (await api().get('/api/people')).body.find(p => p._id === friend._id);
      expect(before.pending_dues).toBe(50300);
      await api().post(`/api/people/${friend._id}/payments`, { amount: 300, payment_date: '2026-03-05' });
      await new Promise(r => setTimeout(r, 50)); // invalidation is fire-and-forget
      const after = (await api().get('/api/people')).body.find(p => p._id === friend._id);
      expect(after.pending_dues).toBe(50000);
    });

    it('coupon cashback adds to profit only when coupon_in_profit is true', async () => {
      const own = (await api().post('/api/orders', makeOrder(ownCard._id, { coupon_cashback: 1000 }))).body;
      expect(own).toMatchObject({ coupon_cashback: 1000, coupon_in_profit: true });
      await api().post('/api/orders', makeOrder(ownCard._id, { coupon_cashback: 400, coupon_in_profit: false }));
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300, coupon_cashback: 200 }));

      const all = (await api().get('/api/orders')).body.summary;
      // own: 3500 + 1000 coupon, own w/ excluded coupon: 3500, friend: 700 + 200 coupon
      expect(all.total_profit).toBe(4500 + 3500 + 900);
      // a coupon never changes what the booker earns
      expect(all.total_friend_earning).toBe(2800);
      const a = (await api().get('/api/analytics/profit')).body;
      expect(a.totals.profit).toBe(8900);
    });

    it('cashback-cycle reports earned and remaining for the order date, excluding the edited order', async () => {
      const cb = (await api().post('/api/cards', cardFor(undefined, {
        last_four_digit: '5555', cashback_enabled: true, cashback_percent: 5, cashback_limit: 3000,
        cashback_period: 'monthly', cashback_reset_day: 1,
      }))).body;
      const o = (await api().post('/api/orders', makeOrder(cb._id, { order_date: '2026-05-10', cashback: 2500 }))).body;
      await api().post('/api/orders', makeOrder(cb._id, { order_date: '2026-06-02', cashback: 900 })); // next cycle
      await api().post('/api/orders', makeOrder(cb._id, { order_date: '2026-05-20', cashback: 999, delivery_status: 'Cancelled' }));

      const may = (await api().get(`/api/cards/${cb._id}/cashback-cycle?date=2026-05-25`)).body;
      expect(may).toMatchObject({ limit: 3000, earned: 2500, remaining: 500, cycle: { start: '2026-05-01', end: '2026-06-01' } });
      const editing = (await api().get(`/api/cards/${cb._id}/cashback-cycle?date=2026-05-25&exclude_order=${o._id}`)).body;
      expect(editing.remaining).toBe(3000);
      const noLimit = (await api().get(`/api/cards/${ownCard._id}/cashback-cycle`)).body;
      expect(noLimit.remaining).toBeNull();
    });

    it("blocks moving a card with orders to/from a booker, and friend↔family changes with orders", async () => {
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300 }));
      const self = (await api().get('/api/people')).body.find(p => p.relation === 'self');
      const move = await api().put(`/api/cards/${friendCard._id}`, { holder_id: self._id });
      expect(move.status).toBe(400);
      expect(move.body.error).toMatch(/Move those orders/);
      const rel = await api().put(`/api/people/${friend._id}`, { relation: 'family' });
      expect(rel.status).toBe(400);
      // renaming is still fine
      expect((await api().put(`/api/people/${friend._id}`, { name: 'Ravi K' })).status).toBe(200);
    });

    it('booker payable sums only what is owed (advances do not cancel other dues)', async () => {
      const amit = (await api().post('/api/people', { name: 'Amit', relation: 'friend' })).body;
      const amitCard = (await api().post('/api/cards', cardFor(amit._id, { last_four_digit: '6666' }))).body;
      await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 5000 }));            // owe Ravi 5000
      await api().post('/api/orders', makeOrder(amitCard._id, { friend_amount: 5000, advance_amount: 5000, delivery_status: 'Pending' })); // Amit holds 5000 advance
      const pos = (await api().get('/api/analytics/profit')).body.position;
      expect(pos.payable).toBe(5000);
      expect(pos.advance_with_bookers).toBe(5000);
    });

    it('partial updates on friend orders do not require friend_amount again', async () => {
      const order = (await api().post('/api/orders', makeOrder(friendCard._id, { friend_amount: 50300 }))).body;
      const res = await api().put(`/api/orders/${order._id}`, { remark: 'call shop' });
      expect(res.status).toBe(200);
      expect(res.body.friend_amount).toBe(50300);
      expect(res.body.remark).toBe('call shop');
    });

    it('person_id scoping excludes cards of other people and mismatched card_id', async () => {
      await api().post('/api/orders', makeOrder(ownCard._id));
      const res = await api().get(`/api/orders?person_id=${friend._id}&card_id=${ownCard._id}`);
      expect(res.body.items).toHaveLength(0);
    });

    it('accepts remark on create', async () => {
      const res = await api().post('/api/orders', makeOrder(ownCard._id, { remark: 'urgent' }));
      expect(res.body.remark).toBe('urgent');
    });
  });
});

describe('Variants', () => {
  let token;
  beforeEach(async () => { ({ token } = await createTestUser()); });

  it('lists defaults and adds a custom variant once (case-insensitive)', async () => {
    const before = await request(app).get('/api/variants').set(authHeader(token));
    expect(before.body).toContain('NA');
    expect(before.body).not.toContain('16/512');

    await request(app).post('/api/variants').set(authHeader(token)).send({ name: '16/512' });
    const res = await request(app).post('/api/variants').set(authHeader(token)).send({ name: '16/512 ' });
    expect(res.status).toBe(201);
    expect(res.body.filter(v => v === '16/512')).toHaveLength(1);
  });

  it('keeps custom variants per user', async () => {
    await request(app).post('/api/variants').set(authHeader(token)).send({ name: '1/16' });
    const other = await createTestUser({ email: 'o@example.com' });
    const res = await request(app).get('/api/variants').set(authHeader(other.token));
    expect(res.body).not.toContain('1/16');
  });
});

describe('People stats date range', () => {
  it('scopes order stats to from_date/to_date and counts pending', async () => {
    const { token } = await createTestUser();
    const h = authHeader(token);
    const seller = (await request(app).post('/api/sellers').set(h).send({ name: 'S', city: 'C' })).body;
    const card = (await request(app).post('/api/cards').set(h).send({ bank_name: 'HDFC Bank', card_network: 'Visa', last_four_digit: '1234', name_on_card: 'X' })).body;
    const order = (date, status) => request(app).post('/api/orders').set(h).send({
      card_id: card._id, seller_id: seller._id, order_date: date, order_amount: 100, return_amount: 150,
      model_ordered: 'M', id_used: 'a', ecomm_site: 'Amazon', delivery_status: status,
    });
    await order('2026-01-10', 'Delivered');
    await order('2026-02-10', 'Pending');

    const all = (await request(app).get('/api/people').set(h)).body[0];
    expect(all).toMatchObject({ order_count: 2, pending_count: 1, my_profit: 100 });

    const feb = (await request(app).get('/api/people?from_date=2026-02-01&to_date=2026-02-28').set(h)).body[0];
    expect(feb).toMatchObject({ order_count: 1, pending_count: 1, my_profit: 50, card_count: 1 });
  });
});

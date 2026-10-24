const request = require('supertest');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
require('./setup');

describe('GET /api/reports/spends', () => {
  let h, self, mom, friend, sellerId, hdfc, hdfcAddon, icici, friendCard;

  const post = (url, body) => request(app).post(url).set(h).send(body);
  const card = (holder_id, bank_name, last_four_digit, extra = {}) =>
    post('/api/cards', { bank_name, card_network: 'Visa', last_four_digit, name_on_card: 'X', holder_id, ...extra }).then(r => r.body);
  const order = (card_id, order_date, order_amount, extra = {}) => post('/api/orders', {
    card_id, seller_id: sellerId, order_date, order_amount, return_amount: order_amount + 500,
    model_ordered: 'Phone', id_used: 'a', ecomm_site: 'Amazon', delivery_status: 'Delivered', ...extra,
  });
  const report = (q = '') => request(app).get(`/api/reports/spends?from_date=2026-04-01&to_date=2027-03-31${q}`).set(h);

  beforeEach(async () => {
    const { token } = await createTestUser();
    h = authHeader(token);
    self = (await request(app).get('/api/people').set(h)).body[0];
    mom = (await post('/api/people', { name: 'Mom', relation: 'family' })).body;
    friend = (await post('/api/people', { name: 'Ravi', relation: 'friend' })).body;
    sellerId = (await post('/api/sellers', { name: 'S', city: 'C' })).body._id;

    hdfc = await card(self._id, 'HDFC Bank', '1111');
    hdfcAddon = await card(mom._id, 'HDFC Bank', '2222', { card_type: 'addon', primary_card_id: hdfc._id });
    icici = await card(self._id, 'ICICI Bank', '3333');
    friendCard = await card(friend._id, 'Axis Bank', '4444');

    await order(hdfc._id, '2026-04-10', 600000);
    await order(hdfc._id, '2026-05-10', 300000);
    await order(hdfc._id, '2026-05-11', 999999, { delivery_status: 'Cancelled' }); // excluded
    await order(hdfc._id, '2026-03-31', 50000);                                    // previous FY, excluded
    await post('/api/transactions', { card_id: hdfc._id, amount: 20000, description: 'Rent', date: '2026-06-01' });
    await order(hdfcAddon._id, '2026-06-15', 150000);
    await order(icici._id, '2026-07-01', 40000);
    await order(friendCard._id, '2026-07-01', 70000, { friend_amount: 70300 });
  });

  it('requires a date range', async () => {
    const res = await request(app).get('/api/reports/spends').set(h);
    expect(res.status).toBe(400);
  });

  it('groups self + family by bank and card, excluding friends', async () => {
    const res = await report();
    expect(res.status).toBe(200);
    expect(res.body.months).toHaveLength(12);
    expect(res.body.people.map(p => p.name)).toEqual(['Test User', 'Mom']);

    const me = res.body.people[0];
    expect(me.total_spend).toBe(600000 + 300000 + 20000 + 40000);
    const hdfcBank = me.banks.find(b => b.bank_name === 'HDFC Bank');
    const hdfcRow = hdfcBank.cards[0];
    expect(hdfcRow).toMatchObject({ txn_total: 20000, order_total: 900000, total_spend: 920000, addon_spend: 150000, billed_total: 1070000 });
    expect(hdfcRow.monthly[0]).toBe(600000); // Apr
    expect(hdfcRow.monthly[1]).toBe(300000); // May
    expect(hdfcBank.sft_reportable).toBe(true);
    expect(me.banks.find(b => b.bank_name === 'ICICI Bank').sft_reportable).toBe(false);

    const momRow = res.body.people[1].banks[0].cards[0];
    expect(momRow).toMatchObject({ card_type: 'addon', total_spend: 150000 });
    expect(momRow.primary_card).toMatchObject({ last_four_digit: '1111', holder_name: 'Test User' });
    // An add-on's spend is billed to the primary, not to the add-on holder
    expect(res.body.people[1].billed_total).toBe(0);
  });

  it('filters to one person and returns line items', async () => {
    const res = await report(`&person_id=${mom._id}&include_items=true`);
    expect(res.body.people).toHaveLength(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ source: 'Order', amount: 150000 });
  });

  it('can include friends when asked', async () => {
    const res = await report('&relations=self,family,friend');
    expect(res.body.people.map(p => p.relation)).toContain('friend');
  });
});

const request = require('supertest');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
const { ipoShares, summarize } = require('../utils/ipo');
require('./setup');

describe('IPO profit sharing (utils/ipo)', () => {
  it('splits sell − lot by the applicant share', () => {
    expect(ipoShares({ allotted: true, lot_price: 14000, sell_price: 20000, profit_share_percent: 30 }))
      .toEqual({ profit: 6000, their_share: 1800, my_share: 4200 });
  });
  it('shares a loss the same way', () => {
    expect(ipoShares({ allotted: true, lot_price: 15000, sell_price: 14000, profit_share_percent: 50 }))
      .toEqual({ profit: -1000, their_share: -500, my_share: -500 });
  });
  it('has no profit until allotted and sold', () => {
    expect(ipoShares({ allotted: false, lot_price: 15000, sell_price: 20000, profit_share_percent: 50 }).profit).toBeNull();
    expect(ipoShares({ allotted: true, lot_price: 15000, sell_price: null, profit_share_percent: 50 }).profit).toBeNull();
  });
  it('summarizes counts and totals', () => {
    expect(summarize([
      { allotted: false, lot_price: 15000, profit_share_percent: 30 },
      { allotted: true, lot_price: 15000, sell_price: null, profit_share_percent: 30 },
      { allotted: true, lot_price: 14000, sell_price: 20000, profit_share_percent: 30 },
    ])).toEqual({ applications: 3, allotted: 2, sold: 1, awaiting_sale: 1, invested: 29000, profit: 6000, their_share: 1800, my_share: 4200 });
  });
});

describe('IPO routes', () => {
  let h;
  const post = (url, body) => request(app).post(url).set(h).send(body);
  const bank = async (holder_name, bank_name = 'HDFC Bank') => (await post('/api/bank-accounts', { holder_name, bank_name })).body;
  beforeEach(async () => {
    const { token } = await createTestUser();
    h = authHeader(token);
  });

  it('applies one IPO for several applicants, each from their own bank, and tracks allotment → sale', async () => {
    const raviBank = await bank('Ravi', 'SBI');
    const momBank = await bank('Mom');
    const ravi = (await post('/api/ipo/applicants', { name: 'Ravi', broker: 'Zerodha', default_bank_account_id: raviBank._id })).body;
    expect(ravi).toMatchObject({ broker: 'Zerodha', default_bank_account_id: raviBank._id });
    expect(ravi.phone).toBeUndefined();
    const mom = (await post('/api/ipo/applicants', { name: 'Mom' })).body;
    const res = await post('/api/ipo/applications', {
      entries: [{ applicant_id: ravi._id, bank_account_id: raviBank._id }, { applicant_id: mom._id, bank_account_id: momBank._id }],
      ipo_name: 'Tata Tech', lot_price: 15000, profit_share_percent: 30,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    const r = res.body.find(a => a.applicant_name === 'Ravi');
    expect(r).toMatchObject({ status: 'applied', allotted: false, sell_price: null, profit: null, bank_label: 'Ravi · SBI' });

    const id = r._id;
    // A sell price is ignored while not allotted
    let upd = await request(app).put(`/api/ipo/applications/${id}`).set(h).send({ sell_price: 20000 });
    expect(upd.body).toMatchObject({ allotted: false, sell_price: null });
    upd = await request(app).put(`/api/ipo/applications/${id}`).set(h).send({ allotted: true });
    expect(upd.body).toMatchObject({ status: 'allotted', profit: null });
    upd = await request(app).put(`/api/ipo/applications/${id}`).set(h).send({ sell_price: 21000 });
    expect(upd.body).toMatchObject({ status: 'sold', profit: 6000, their_share: 1800, my_share: 4200 });

    const list = (await request(app).get('/api/ipo/applications').set(h)).body;
    expect(list.items).toHaveLength(2);
    expect(list.items.find(a => a._id === id).bank_label).toBe('Ravi · SBI');
    expect(list.summary).toMatchObject({ applications: 2, allotted: 1, sold: 1, profit: 6000, my_share: 4200 });
    const sold = (await request(app).get('/api/ipo/applications?status=sold').set(h)).body;
    expect(sold.items.map(a => a.applicant_name)).toEqual(['Ravi']);

    const applicants = (await request(app).get('/api/ipo/applicants').set(h)).body;
    expect(applicants.find(p => p.name === 'Ravi').stats).toMatchObject({ applications: 1, sold: 1, their_share: 1800 });

    // Un-allotting clears the sell price
    upd = await request(app).put(`/api/ipo/applications/${id}`).set(h).send({ allotted: false });
    expect(upd.body).toMatchObject({ status: 'applied', sell_price: null });
  });

  it('validates input', async () => {
    const b = await bank('A');
    const p = (await post('/api/ipo/applicants', { name: 'A' })).body;
    const base = { entries: [{ applicant_id: p._id, bank_account_id: b._id }], ipo_name: 'X', lot_price: 15000, profit_share_percent: 30 };
    expect((await post('/api/ipo/applicants', { name: ' ' })).status).toBe(400);
    expect((await post('/api/ipo/applications', { ...base, entries: [] })).status).toBe(400);
    expect((await post('/api/ipo/applications', { ...base, entries: [{ applicant_id: p._id }] })).status).toBe(400);
    expect((await post('/api/ipo/applications', { ...base, entries: [base.entries[0], base.entries[0]] })).status).toBe(400);
    expect((await post('/api/ipo/applications', { ...base, ipo_name: '' })).status).toBe(400);
    expect((await post('/api/ipo/applications', { ...base, lot_price: -1 })).status).toBe(400);
    expect((await post('/api/ipo/applications', { ...base, profit_share_percent: 101 })).status).toBe(400);
    expect((await post('/api/ipo/applications', { ...base, allotted: true, sell_price: -5 })).status).toBe(400);
    expect((await post('/api/ipo/applications', base)).status).toBe(201);
  });

  it('blocks deleting an applicant or bank account that is in use', async () => {
    const b = await bank('A');
    const p = (await post('/api/ipo/applicants', { name: 'A' })).body;
    const [a] = (await post('/api/ipo/applications', { entries: [{ applicant_id: p._id, bank_account_id: b._id }], ipo_name: 'X', lot_price: 1, profit_share_percent: 0 })).body;
    expect((await request(app).delete(`/api/ipo/applicants/${p._id}`).set(h)).status).toBe(400);
    const del = await request(app).delete(`/api/bank-accounts/${b._id}`).set(h);
    expect(del.status).toBe(400);
    expect(del.body.error).toMatch(/IPO application/);
    expect((await request(app).get('/api/bank-accounts').set(h)).body[0]).toMatchObject({ usage_count: 1, label: 'A · HDFC Bank' });
    await request(app).delete(`/api/ipo/applications/${a._id}`).set(h).expect(200);
    await request(app).delete(`/api/ipo/applicants/${p._id}`).set(h).expect(200);
    await request(app).delete(`/api/bank-accounts/${b._id}`).set(h).expect(200);
  });

  it("never touches another user's data", async () => {
    const b = await bank('Mine');
    const p = (await post('/api/ipo/applicants', { name: 'Mine' })).body;
    const [a] = (await post('/api/ipo/applications', { entries: [{ applicant_id: p._id, bank_account_id: b._id }], ipo_name: 'X', lot_price: 1, profit_share_percent: 0 })).body;
    const other = authHeader((await createTestUser({ email: 'other@example.com' })).token);
    expect((await request(app).get('/api/ipo/applicants').set(other)).body).toHaveLength(0);
    expect((await request(app).get('/api/bank-accounts').set(other)).body).toHaveLength(0);
    expect((await request(app).put(`/api/ipo/applications/${a._id}`).set(other).send({ allotted: true })).status).toBe(404);
    expect((await request(app).delete(`/api/ipo/applicants/${p._id}`).set(other)).status).toBe(404);
    expect((await request(app).delete(`/api/bank-accounts/${b._id}`).set(other)).status).toBe(404);
    // Can't use someone else's applicant or bank account
    const ob = (await request(app).post('/api/bank-accounts').set(other).send({ holder_name: 'O', bank_name: 'ICICI' })).body;
    expect((await request(app).post('/api/ipo/applications').set(other)
      .send({ entries: [{ applicant_id: p._id, bank_account_id: ob._id }], ipo_name: 'Y', lot_price: 1, profit_share_percent: 0 })).status).toBe(400);
    expect((await request(app).put(`/api/ipo/applications/${a._id}`).set(h).send({ bank_account_id: ob._id })).status).toBe(400);
    expect((await request(app).post('/api/ipo/applicants').set(other).send({ name: 'Z', default_bank_account_id: b._id })).status).toBe(400);
  });
});

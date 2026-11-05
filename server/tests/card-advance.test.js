const request = require('supertest');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
require('./setup');

describe('order card advance (paid to the card from a bank account)', () => {
  let h, card, seller, bank;
  const order = (extra = {}) => request(app).post('/api/orders').set(h).send({
    card_id: card._id, seller_id: seller._id, order_date: '2026-11-01', order_amount: 60000, return_amount: 61000,
    model_ordered: 'iPhone', id_used: 'a', ecomm_site: 'Amazon', ...extra,
  });

  beforeEach(async () => {
    h = authHeader((await createTestUser()).token);
    card = (await request(app).post('/api/cards').set(h).send({ bank_name: 'HDFC Bank', card_network: 'Visa', last_four_digit: '1111', name_on_card: 'X' })).body;
    seller = (await request(app).post('/api/sellers').set(h).send({ name: 'Shop', city: 'Patna' })).body;
    bank = (await request(app).post('/api/bank-accounts').set(h).send({ holder_name: 'Me', bank_name: 'SBI' })).body;
  });

  it('records the advance, its bank account and the returned flag; profit is unchanged', async () => {
    const res = await order({ card_advance_amount: 40000, card_advance_bank_id: bank._id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ card_advance_amount: 40000, card_advance_bank_id: bank._id, card_advance_returned: false });

    let accounts = (await request(app).get('/api/bank-accounts').set(h)).body;
    expect(accounts[0]).toMatchObject({ advance_to_return: 40000, advance_to_return_count: 1, usage_count: 1 });
    // Account summary keeps advances apart from money received, with buyer + card
    const sum = (await request(app).get(`/api/bank-accounts/${bank._id}/summary`).set(h)).body;
    expect(sum.received.total).toBe(0);
    expect(sum.advanced).toMatchObject({ total: 40000, to_return: 40000, returned: 0, count: 1 });
    expect(sum.advanced.items[0]).toMatchObject({ seller_name: 'Shop', card_label: 'HDFC Bank ••1111', card_holder: 'You', item: 'iPhone', amount: 40000, returned: false });
    expect(sum.advanced.by_seller).toEqual([{ seller_id: seller._id, name: 'Shop', amount: 40000, to_return: 40000, count: 1 }]);
    expect((await request(app).get('/api/orders?card_advance=pending').set(h)).body.items).toHaveLength(1);

    const upd = await request(app).put(`/api/orders/${res.body._id}`).set(h).send({ card_advance_returned: true });
    expect(upd.body).toMatchObject({ card_advance_returned: true, card_advance_amount: 40000 });
    accounts = (await request(app).get('/api/bank-accounts').set(h)).body;
    expect(accounts[0].advance_to_return).toBe(0);
    const after = (await request(app).get(`/api/bank-accounts/${bank._id}/summary`).set(h)).body.advanced;
    expect(after).toMatchObject({ total: 40000, to_return: 0, returned: 40000 });
    expect((await request(app).get('/api/orders?card_advance=pending').set(h)).body.items).toHaveLength(0);
    expect((await request(app).get('/api/orders?card_advance=returned').set(h)).body.items).toHaveLength(1);

    // In use → can't delete the bank account
    expect((await request(app).delete(`/api/bank-accounts/${bank._id}`).set(h)).status).toBe(400);

    // Clearing the amount clears the bank and flag
    const cleared = await request(app).put(`/api/orders/${res.body._id}`).set(h).send({ card_advance_amount: '' });
    expect(cleared.body).toMatchObject({ card_advance_amount: null, card_advance_bank_id: null, card_advance_returned: false });
  });

  it('needs a bank account of your own when there is an advance', async () => {
    expect((await order({ card_advance_amount: 1000 })).status).toBe(400);
    const other = authHeader((await createTestUser({ email: 'o@example.com' })).token);
    const theirs = (await request(app).post('/api/bank-accounts').set(other).send({ holder_name: 'O', bank_name: 'ICICI' })).body;
    expect((await order({ card_advance_amount: 1000, card_advance_bank_id: theirs._id })).status).toBe(400);
    expect((await order({ card_advance_amount: -5, card_advance_bank_id: bank._id })).status).toBe(400);
    // No advance → no bank needed, nothing stored
    const plain = await order();
    expect(plain.status).toBe(201);
    expect(plain.body).toMatchObject({ card_advance_amount: null, card_advance_bank_id: null });
  });
});

describe('buyer payments received into a bank account', () => {
  it('tracks how much each buyer paid into an account', async () => {
    const h = authHeader((await createTestUser({ email: 'recv@example.com' })).token);
    const mummy = (await request(app).post('/api/bank-accounts').set(h).send({ holder_name: 'Mummy', bank_name: 'SBI' })).body;
    const other = (await request(app).post('/api/bank-accounts').set(h).send({ holder_name: 'Me', bank_name: 'HDFC Bank' })).body;
    const seller = async (name) => (await request(app).post('/api/sellers').set(h).send({ name, city: 'Patna' })).body;
    const [a, b, c] = [await seller('Seller A'), await seller('Seller B'), await seller('Seller C')];
    const pay = (s, amount, bank, date = '2026-11-02') => request(app).post('/api/sellers/payment').set(h)
      .send({ seller_id: s._id, amount, payment_date: date, bank_account_id: bank?._id });

    expect((await pay(a, 20000, mummy)).status).toBe(201);
    await pay(b, 30000, mummy);
    await pay(c, 50000, mummy);
    await pay(a, 5000, mummy, '2026-10-01');
    await pay(c, 9999, other);
    expect((await pay(b, 100, null)).status).toBe(400); // account is required

    const list = (await request(app).get('/api/bank-accounts').set(h)).body;
    expect(list.find(x => x._id === mummy._id)).toMatchObject({ received_total: 105000, usage_count: 4 });

    const sum = (await request(app).get(`/api/bank-accounts/${mummy._id}/summary`).set(h)).body;
    expect(sum.received.total).toBe(105000);
    expect(sum.received.by_seller.map(r => [r.name, r.amount, r.count])).toEqual([
      ['Seller C', 50000, 1], ['Seller B', 30000, 1], ['Seller A', 25000, 2],
    ]);
    expect(sum.received.payments).toHaveLength(4);
    expect(sum.advanced.total).toBe(0);

    const nov = (await request(app).get(`/api/bank-accounts/${mummy._id}/summary?from_date=2026-11-01&to_date=2026-11-30`).set(h)).body;
    expect(nov.received.total).toBe(100000);

    // Ledger shows where it was received; edit can move or clear the account
    const feed = (await request(app).get(`/api/sellers/${a._id}/ledger-feed`).set(h)).body;
    expect(feed.items.find(i => i.type === 'PAYMENT').bank_label).toBe('Mummy · SBI');
    const p = (await request(app).get(`/api/sellers/${a._id}/payment`).set(h)).body[0];
    const moved = await request(app).put(`/api/sellers/payment/${p._id}`).set(h).send({ bank_account_id: other._id });
    expect(String(moved.body.bank_account_id)).toBe(other._id);
    expect((await request(app).put(`/api/sellers/payment/${p._id}`).set(h).send({ bank_account_id: '' })).status).toBe(400);

    // Someone else's account is rejected; in-use accounts can't be deleted
    const stranger = authHeader((await createTestUser({ email: 'x@example.com' })).token);
    const theirs = (await request(app).post('/api/bank-accounts').set(stranger).send({ holder_name: 'X', bank_name: 'ICICI' })).body;
    expect((await pay(a, 1, theirs)).status).toBe(400);
    expect((await request(app).get(`/api/bank-accounts/${mummy._id}/summary`).set(stranger)).status).toBe(404);
    expect((await request(app).delete(`/api/bank-accounts/${mummy._id}`).set(h)).status).toBe(400);
  });
});

describe('bank accounts grouped by person', () => {
  it('combines a person\'s accounts, breaks them down per bank, and renames them together', async () => {
    const h = authHeader((await createTestUser({ email: 'grp@example.com' })).token);
    const add = (holder_name, bank_name) => request(app).post('/api/bank-accounts').set(h).send({ holder_name, bank_name }).then(r => r.body);
    const sbi = await add('Mummy', 'SBI');
    const pnb = await add(' mummy ', 'PNB'); // same person despite case/spaces
    await add('Papa', 'HDFC Bank');
    const s = (await request(app).post('/api/sellers').set(h).send({ name: 'A', city: 'Patna' })).body;
    const card = (await request(app).post('/api/cards').set(h).send({ bank_name: 'Axis Bank', card_network: 'Visa', last_four_digit: '2222', name_on_card: 'X' })).body;
    const pay = (bank, amount) => request(app).post('/api/sellers/payment').set(h).send({ seller_id: s._id, amount, payment_date: '2026-11-02', bank_account_id: bank._id });
    await pay(sbi, 20000);
    await pay(pnb, 7000);
    await request(app).post('/api/orders').set(h).send({
      card_id: card._id, seller_id: s._id, order_date: '2026-11-01', order_amount: 50000, return_amount: 51000,
      model_ordered: 'TV', id_used: 'a', ecomm_site: 'Amazon', card_advance_amount: 15000, card_advance_bank_id: pnb._id,
    });

    const sum = (await request(app).get('/api/bank-accounts/summary?holder=MUMMY').set(h)).body;
    expect(sum.received.total).toBe(27000);
    expect(sum.advanced).toMatchObject({ total: 15000, to_return: 15000 });
    expect(pnb.holder_name).toBe('Mummy');
    expect(sum.advanced.items[0]).toMatchObject({ bank_label: 'Mummy · PNB', card_label: 'Axis Bank ••2222' });
    const byBank = Object.fromEntries(sum.accounts.map(a => [a.bank_name, [a.received, a.advanced, a.to_return]]));
    expect(byBank).toEqual({ PNB: [7000, 15000, 15000], SBI: [20000, 0, 0] });

    // IPOs from the account are their own section, apart from received / advanced
    const neha = (await request(app).post('/api/ipo/applicants').set(h).send({ name: 'Neha' })).body;
    const [ipo] = (await request(app).post('/api/ipo/applications').set(h).send({
      entries: [{ applicant_id: neha._id, bank_account_id: sbi._id }], ipo_name: 'Tata Tech', lot_price: 15000, profit_share_percent: 30, allotted: true,
    })).body;
    await request(app).put(`/api/ipo/applications/${ipo._id}`).set(h).send({ sell_price: 21000 });
    const withIpo = (await request(app).get('/api/bank-accounts/summary?holder=Mummy').set(h)).body;
    expect(withIpo.ipo).toMatchObject({ applications: 1, allotted: 1, invested: 15000, profit: 6000, my_share: 4200, their_share: 1800 });
    expect(withIpo.ipo.items[0]).toMatchObject({ ipo_name: 'Tata Tech', applicant_name: 'Neha', status: 'sold', bank_label: 'Mummy · SBI', my_share: 4200 });
    expect(withIpo.received.total).toBe(27000); // unchanged by the IPO
    expect(withIpo.accounts.find(a => a.bank_name === 'SBI')).toMatchObject({ ipo_count: 1, ipo_invested: 15000 });
    const pnbOnly = (await request(app).get(`/api/bank-accounts/${pnb._id}/summary`).set(h)).body;
    expect(pnbOnly.ipo.applications).toBe(0);

    expect((await request(app).get('/api/bank-accounts/summary?holder=Nobody').set(h)).status).toBe(404);
    const ren = await request(app).put('/api/bank-accounts/holder').set(h).send({ from: 'Mummy', to: 'Maa' });
    expect(ren.body).toMatchObject({ updated: 2 });
    const names = (await request(app).get('/api/bank-accounts').set(h)).body.map(a => a.holder_name).sort();
    expect(names).toEqual(['Maa', 'Maa', 'Papa']);
  });
});

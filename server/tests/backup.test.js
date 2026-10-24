const request = require('supertest');
const app = require('../app');
const { createTestUser, authHeader } = require('./helpers');
require('./setup');

// Build a realistic account through the API, export it, restore it into a
// brand-new account, and check every number the app shows is identical.
async function seed(h) {
  const post = (url, body) => request(app).post(url).set(h).send(body).then(r => { if (r.status >= 300) throw new Error(`${url} ${r.status} ${JSON.stringify(r.body)}`); return r.body; });
  const self = (await request(app).get('/api/people').set(h)).body.find(p => p.relation === 'self');
  const friend = await post('/api/people', { name: 'Ravi', relation: 'friend' });
  const mom = await post('/api/people', { name: 'Mom', relation: 'family' });
  const own = await post('/api/cards', { bank_name: 'HDFC Bank', card_network: 'Visa', last_four_digit: '1111', name_on_card: 'X', holder_id: self._id, cashback_enabled: true, cashback_percent: 5, cashback_limit: 5000 });
  await post('/api/cards', { bank_name: 'HDFC Bank', card_network: 'Visa', last_four_digit: '2222', name_on_card: 'M', holder_id: mom._id, card_type: 'addon', primary_card_id: own._id });
  const fc = await post('/api/cards', { bank_name: 'Axis Bank', card_network: 'Visa', last_four_digit: '3333', name_on_card: 'R', holder_id: friend._id });
  const seller = await post('/api/sellers', { name: 'Shop', city: 'Patna' });
  const order = (card_id, extra) => post('/api/orders', { card_id, seller_id: seller._id, order_date: '2026-05-01', order_amount: 10000, return_amount: 10600, model_ordered: 'Phone', id_used: 'a', ecomm_site: 'Amazon', delivery_status: 'Delivered', ...extra });
  await order(own._id, { cashback: 500, coupon_cashback: 200 });
  await order(fc._id, { friend_amount: 10300, advance_amount: 3000 });
  await order(fc._id, { friend_amount: 5000, delivery_status: 'Pending' });
  await post('/api/transactions', { card_id: own._id, amount: 1500, description: 'Fuel', date: '2026-05-02' });
  await post('/api/sellers/payment', { seller_id: seller._id, amount: 4000, payment_date: '2026-05-03', notes: 'UPI' });
  await post(`/api/people/${friend._id}/payments`, { amount: 2000, payment_date: '2026-05-04' });
  const cust = await post('/api/customers', { name: 'Ramesh' });
  await post('/api/customers/entry', { customer_id: cust._id, type: 'gave', amount: 700, entry_date: '2026-05-05' });
  await post('/api/variants', { name: '16/512' });
}

// The numbers a user sees, with ids stripped so two accounts compare equal
async function snapshotNumbers(h) {
  const get = (url) => request(app).get(url).set(h).then(r => r.body);
  const people = (await get('/api/people')).map(p => ({ name: p.relation === 'self' ? 'SELF' : p.name, relation: p.relation, card_count: p.card_count, order_count: p.order_count, my_profit: p.my_profit, pending_dues: p.pending_dues, total_paid: p.total_paid }));
  const orders = (await get('/api/orders')).summary;
  const sellers = (await get('/api/sellers?all=true')).map(s => ({ name: s.name, due: s.due_balance, profit: s.profit }));
  const a = await get('/api/analytics/profit');
  const report = await get('/api/reports/spends?from_date=2026-04-01&to_date=2027-03-31');
  const customers = (await get('/api/customers')).items.map(c => ({ name: c.name, balance: c.balance }));
  const variants = await get('/api/variants');
  return {
    people: people.sort((x, y) => x.name.localeCompare(y.name)), orders, sellers, customers, variants,
    analytics: { totals: a.totals, position: a.position, bySource: a.bySource },
    report: report.people.map(p => ({ total: p.total_spend, billed: p.billed_total, banks: p.banks.map(b => [b.bank_name, b.total_spend, b.billed_total]) })),
  };
}

describe('account backup & restore', () => {
  it('round-trips an account into a new account with identical numbers', async () => {
    const a = await createTestUser({ email: 'a@example.com' });
    await seed(authHeader(a.token));
    const backup = (await request(app).get('/api/export').set(authHeader(a.token))).body;
    expect(backup.format).toBe('booker-account-backup');
    expect(backup.counts).toMatchObject({ people: 3, cards: 3, orders: 3, transactions: 1, seller_payments: 1, booker_payments: 1, customer_entries: 1, variants: 1 });
    expect(JSON.stringify(backup)).not.toContain('"user_id"');

    const b = await createTestUser({ email: 'b@example.com' });
    const res = await request(app).post('/api/export/import').set(authHeader(b.token)).send(backup);
    expect(res.status).toBe(200);
    expect(res.body.restored).toMatchObject({ people: 2, cards: 3, orders: 3 });

    const before = await snapshotNumbers(authHeader(a.token));
    const after = await snapshotNumbers(authHeader(b.token));
    expect(after).toEqual(before);
  });

  it('refuses to restore into an account that already has data', async () => {
    const a = await createTestUser({ email: 'c@example.com' });
    await seed(authHeader(a.token));
    const backup = (await request(app).get('/api/export').set(authHeader(a.token))).body;
    const res = await request(app).post('/api/export/import').set(authHeader(a.token)).send(backup);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty account/);
  });

  it('rejects non-backups and broken references without writing anything', async () => {
    const b = await createTestUser({ email: 'd@example.com' });
    const h = authHeader(b.token);
    expect((await request(app).post('/api/export/import').set(h).send({ hello: 1 })).status).toBe(400);
    const broken = {
      format: 'booker-account-backup', version: 1,
      data: { cards: [{ _id: '6a0000000000000000000001', bank_name: 'X', card_network: 'Visa', last_four_digit: '1234', name_on_card: 'Y', holder_id: '6a0000000000000000000099' }] },
    };
    const res = await request(app).post('/api/export/import').set(h).send(broken);
    expect(res.status).toBe(400);
    expect((await request(app).get('/api/cards').set(h)).body).toHaveLength(0);
  });
});

describe('encrypted database dump', () => {
  const mongoose = require('mongoose');
  const { encryptDump, decryptDump, dumpDatabase, restoreDatabase } = require('../scripts/lib/backupFile');
  const PASS = 'correct horse battery';

  it('dumps, encrypts, and restores into an empty database with exact types', async () => {
    const a = await createTestUser({ email: 'e@example.com' });
    await seed(authHeader(a.token));
    const file = encryptDump(await dumpDatabase(mongoose.connection.db), PASS);
    expect(file.includes(Buffer.from('Ravi'))).toBe(false); // nothing readable in the file

    const dump = decryptDump(file, PASS);
    const target = mongoose.connection.useDb('booker_restore_test').db;
    const counts = await restoreDatabase(target, dump);
    expect(counts.orders).toBe(3);
    const original = await mongoose.connection.db.collection('orders').find({}).sort({ _id: 1 }).toArray();
    const restored = await target.collection('orders').find({}).sort({ _id: 1 }).toArray();
    expect(restored).toEqual(original);
    expect(restored[0]._id).toBeInstanceOf(mongoose.mongo.ObjectId);
    expect(restored[0].order_date).toBeInstanceOf(Date);

    // Not empty any more: refuses without force, replaces with force
    await expect(restoreDatabase(target, dump)).rejects.toThrow(/not empty/);
    await expect(restoreDatabase(target, dump, { force: true })).resolves.toMatchObject({ orders: 3 });
    expect(await target.collection('orders').countDocuments()).toBe(3);
    await target.dropDatabase();
  });

  it('rejects a wrong passphrase or a tampered file', () => {
    const file = encryptDump({ format: 'booker-db-dump', collections: {} }, PASS);
    expect(() => decryptDump(file, 'wrong passphrase!')).toThrow(/Wrong passphrase/);
    const tampered = Buffer.from(file); tampered[tampered.length - 1] ^= 1;
    expect(() => decryptDump(tampered, PASS)).toThrow(/Wrong passphrase|damaged/);
    expect(() => encryptDump({}, 'short')).toThrow(/at least 12/);
  });
});

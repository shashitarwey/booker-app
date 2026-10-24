const mongoose = require('mongoose');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const { runMigrations } = require('../utils/migrations');
const { createTestUser } = require('./helpers');
require('./setup');

describe('runMigrations — transaction user_id backfill', () => {
  let user, otherUser, card, otherCard;

  beforeEach(async () => {
    ({ user } = await createTestUser());
    ({ user: otherUser } = await createTestUser({ email: 'other@test.com' }));
    const base = { card_network: 'Visa', name_on_card: 'TEST', holder_id: new mongoose.Types.ObjectId() };
    card = await Card.create({ ...base, user_id: user._id, bank_name: 'HDFC Bank', last_four_digit: '1111' });
    otherCard = await Card.create({ ...base, user_id: otherUser._id, bank_name: 'SBI', last_four_digit: '2222' });
  });

  // Write straight to the collection so the docs look like pre-user_id data
  const insertLegacy = (docs) => Transaction.collection.insertMany(
    docs.map(d => ({ amount: 100, description: '', date: new Date(), ...d }))
  );

  it('sets user_id from the card, leaves orphans and existing values alone, and is idempotent', async () => {
    const orphanCardId = new mongoose.Types.ObjectId();
    const { insertedIds } = await insertLegacy([
      { card_id: card._id },
      { card_id: card._id, user_id: null },
      { card_id: otherCard._id },
      { card_id: orphanCardId },
    ]);
    const [mine, mineNull, theirs, orphan] = Object.values(insertedIds);
    const already = await Transaction.create({ user_id: user._id, card_id: card._id, amount: 5 });

    const first = await runMigrations();
    expect(first.transaction_user_id_backfill).toEqual({ updated: 3, orphaned: 1 });

    const byId = async (id) => (await Transaction.findById(id).lean()).user_id;
    expect(String(await byId(mine))).toBe(String(user._id));
    expect(String(await byId(mineNull))).toBe(String(user._id));
    expect(String(await byId(theirs))).toBe(String(otherUser._id));
    expect(await byId(orphan)).toBeUndefined();
    expect(String(await byId(already._id))).toBe(String(user._id));

    // Second run changes nothing
    const second = await runMigrations();
    expect(second.transaction_user_id_backfill).toEqual({ updated: 0, orphaned: 1 });
  });

  it('handles more rows than one batch', async () => {
    await insertLegacy(Array.from({ length: 1203 }, () => ({ card_id: card._id })));
    const res = await runMigrations();
    expect(res.transaction_user_id_backfill.updated).toBe(1203);
    expect(await Transaction.countDocuments({ user_id: null })).toBe(0);
  });

  it('never throws — a failing migration is reported, not raised', async () => {
    const spy = jest.spyOn(Transaction, 'find').mockImplementation(() => { throw new Error('boom'); });
    try {
      const res = await runMigrations();
      expect(res.transaction_user_id_backfill).toEqual({ error: 'boom' });
    } finally {
      spy.mockRestore();
    }
  });
});

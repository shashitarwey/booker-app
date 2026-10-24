/**
 * Startup data migrations.
 *
 * Every migration here must be idempotent (safe to run on every boot) and
 * backward compatible with documents written by older code — the live DB
 * already holds real user data. runMigrations() never throws: a failure is
 * logged and the server keeps running on the un-migrated data.
 *
 * Not wired into app.js on purpose, so tests only run it when they call it.
 */
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const logger = require('./logger');

const BATCH_SIZE = 500;

/**
 * Backfill Transaction.user_id from the owning card.
 *
 * Transactions created before user_id existed only have card_id. Walk the
 * ones still missing user_id in _id order and set it from their card in
 * bulkWrite batches. Orphans (card already deleted) can't be attributed —
 * they're left untouched and skipped via the _id cursor, so they never
 * loop forever and were already invisible to every card-scoped query.
 */
async function backfillTransactionUserId() {
    // { user_id: null } matches both missing and explicit-null, and can use
    // the { user_id, date } index — so re-running after a full backfill is cheap.
    const missing = { user_id: null };
    let lastId = null;
    let updated = 0;
    let orphaned = 0;

    for (;;) {
        const filter = lastId ? { ...missing, _id: { $gt: lastId } } : missing;
        const batch = await Transaction.find(filter, '_id card_id').sort({ _id: 1 }).limit(BATCH_SIZE).lean();
        if (batch.length === 0) break;
        lastId = batch[batch.length - 1]._id;

        const cardIds = [...new Set(batch.map(t => String(t.card_id)))];
        const cards = await Card.find({ _id: { $in: cardIds } }, 'user_id').lean();
        const ownerByCard = new Map(cards.map(c => [String(c._id), c.user_id]));

        const ops = [];
        for (const t of batch) {
            const owner = ownerByCard.get(String(t.card_id));
            if (!owner) { orphaned++; continue; }
            ops.push({
                updateOne: {
                    // Re-check "missing" in the filter so a concurrent write
                    // that already set user_id is never overwritten.
                    filter: { _id: t._id, ...missing },
                    update: { $set: { user_id: owner } },
                },
            });
        }
        if (ops.length) {
            const res = await Transaction.bulkWrite(ops, { ordered: false });
            updated += res.modifiedCount;
        }
        if (batch.length < BATCH_SIZE) break;
    }

    return { updated, orphaned };
}

const MIGRATIONS = [
    ['transaction_user_id_backfill', backfillTransactionUserId],
];

/**
 * Run all startup migrations in order. Resolves to a { name: result } map;
 * a failing migration is logged with its error and the rest still run.
 */
async function runMigrations() {
    const results = {};
    for (const [name, fn] of MIGRATIONS) {
        try {
            const result = await fn();
            results[name] = result;
            logger.info(`Migration ${name} complete`, result);
        } catch (err) {
            results[name] = { error: err.message };
            logger.error(`Migration ${name} failed`, { error: err.message, stack: err.stack });
        }
    }
    return results;
}

module.exports = { runMigrations, backfillTransactionUserId };

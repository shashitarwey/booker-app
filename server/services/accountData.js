const mongoose = require('mongoose');
const Person = require('../models/Person');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const Seller = require('../models/Seller');
const SellerPayment = require('../models/SellerPayment');
const Customer = require('../models/Customer');
const CustomerEntry = require('../models/CustomerEntry');
const BookerPayment = require('../models/BookerPayment');
const Variant = require('../models/Variant');
const { ensureSelfPerson } = require('../utils/people');

/**
 * Per-account backup ("Download all my data") and restore.
 *
 * Export: every document the user owns, without user_id/__v, ids as strings.
 * Restore: only into an account that has no data yet (so it can never
 * overwrite or mix), with fresh _ids and every reference remapped — which
 * also makes it the migration path to a new database.
 */

const FORMAT = 'booker-account-backup';
const VERSION = 1;

// Order matters for restore: referenced collections first
const COLLECTIONS = [
    ['people', Person],
    ['cards', Card],
    ['sellers', Seller],
    ['customers', Customer],
    ['orders', Order],
    ['transactions', Transaction],
    ['seller_payments', SellerPayment],
    ['customer_entries', CustomerEntry],
    ['booker_payments', BookerPayment],
    ['variants', Variant],
];

// Reference fields per collection → which collection's id map they point into
const REFS = {
    cards: { holder_id: 'people', primary_card_id: 'cards' },
    orders: { card_id: 'cards', seller_id: 'sellers' },
    transactions: { card_id: 'cards' },
    seller_payments: { seller_id: 'sellers' },
    customer_entries: { customer_id: 'customers' },
    booker_payments: { person_id: 'people' },
};

const clean = (doc) => {
    const { user_id, __v, ...rest } = doc; // eslint-disable-line no-unused-vars
    return rest;
};

async function exportAccount(userId, user) {
    const uid = new mongoose.Types.ObjectId(userId);
    const data = {};
    await Promise.all(COLLECTIONS.map(async ([key, Model]) => {
        // Transactions from before user_id existed are reached via their cards
        const filter = key === 'transactions'
            ? { $or: [{ user_id: uid }, { card_id: { $in: (await Card.find({ user_id: uid }, '_id').lean()).map(c => c._id) } }] }
            : { user_id: uid };
        data[key] = (await Model.find(filter).lean()).map(clean);
    }));
    return {
        format: FORMAT,
        version: VERSION,
        exported_at: new Date().toISOString(),
        account: { name: user?.name || '', email: user?.email || '' },
        counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
        data,
    };
}

class RestoreError extends Error {
    constructor(message) { super(message); this.status = 400; }
}

/** True when the account has nothing but the auto-created "self" person. */
async function isEmptyAccount(userId) {
    const counts = await Promise.all([
        Card.countDocuments({ user_id: userId }),
        Order.countDocuments({ user_id: userId }),
        Seller.countDocuments({ user_id: userId }),
        Customer.countDocuments({ user_id: userId }),
        Person.countDocuments({ user_id: userId, relation: { $ne: 'self' } }),
    ]);
    return counts.every(n => n === 0);
}

async function importAccount(userId, payload) {
    if (!payload || payload.format !== FORMAT || !payload.data) throw new RestoreError('Not a Booker backup file');
    if (payload.version > VERSION) throw new RestoreError('This backup was made by a newer version of Booker');
    if (!(await isEmptyAccount(userId))) {
        throw new RestoreError('Restore only works on an empty account. Create a new account (or start from a fresh one) and restore there.');
    }

    const uid = new mongoose.Types.ObjectId(userId);
    const self = await ensureSelfPerson(userId);
    const idMaps = Object.fromEntries(COLLECTIONS.map(([k]) => [k, new Map()]));
    const prepared = {};

    // 1. Allocate new ids (backup "self" maps onto this account's self person)
    for (const [key] of COLLECTIONS) {
        const rows = Array.isArray(payload.data[key]) ? payload.data[key] : [];
        for (const row of rows) {
            if (!row || !row._id) throw new RestoreError(`Bad ${key} entry in backup`);
            const isSelf = key === 'people' && row.relation === 'self';
            idMaps[key].set(String(row._id), isSelf ? self._id : new mongoose.Types.ObjectId());
        }
    }

    // 2. Rewrite ids + references and validate every document before writing anything
    for (const [key, Model] of COLLECTIONS) {
        const rows = Array.isArray(payload.data[key]) ? payload.data[key] : [];
        const refs = REFS[key] || {};
        prepared[key] = [];
        for (const row of rows) {
            if (key === 'people' && row.relation === 'self') continue; // already exists
            const doc = { ...clean(row), _id: idMaps[key].get(String(row._id)), user_id: uid };
            for (const [field, target] of Object.entries(refs)) {
                if (doc[field] == null) continue;
                const mapped = idMaps[target].get(String(doc[field]));
                if (!mapped) {
                    if (field === 'primary_card_id') { doc[field] = null; continue; } // link to a missing card: drop it
                    throw new RestoreError(`${key} entry points to a ${target} record that isn't in the backup`);
                }
                doc[field] = mapped;
            }
            const instance = new Model(doc);
            await instance.validate().catch(err => { throw new RestoreError(`Invalid ${key} entry: ${err.message}`); });
            prepared[key].push(instance.toObject({ depopulate: true }));
        }
    }

    // 3. Insert in dependency order; on failure remove what was inserted
    const inserted = [];
    try {
        for (const [key, Model] of COLLECTIONS) {
            if (!prepared[key].length) continue;
            await Model.collection.insertMany(prepared[key], { ordered: true });
            inserted.push([Model, prepared[key].map(d => d._id)]);
        }
    } catch (err) {
        await Promise.all(inserted.map(([Model, ids]) => Model.deleteMany({ _id: { $in: ids } }).catch(() => {})));
        throw err;
    }

    return Object.fromEntries(COLLECTIONS.map(([k]) => [k, prepared[k].length]));
}

module.exports = { exportAccount, importAccount, isEmptyAccount, FORMAT, VERSION };

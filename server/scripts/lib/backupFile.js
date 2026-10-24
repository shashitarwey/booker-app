const crypto = require('crypto');
const zlib = require('zlib');
const { EJSON } = require('mongoose').mongo.BSON;

/**
 * Encrypted database dump file:
 *   "BKP1" | salt(16) | iv(12) | authTag(16) | AES-256-GCM( gzip( EJSON ) )
 * The key is scrypt(passphrase, salt). EJSON keeps ObjectId/Date/Decimal types
 * exact, so a restore is byte-for-byte the same data.
 */
const MAGIC = Buffer.from('BKP1');

function deriveKey(passphrase, salt) {
    if (!passphrase || passphrase.length < 12) throw new Error('BACKUP_PASSPHRASE must be at least 12 characters');
    return crypto.scryptSync(passphrase, salt, 32);
}

function encryptDump(dump, passphrase) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    const body = Buffer.concat([cipher.update(zlib.gzipSync(EJSON.stringify(dump, { relaxed: false }))), cipher.final()]);
    return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

function decryptDump(buf, passphrase) {
    if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('Not a Booker backup file');
    const salt = buf.subarray(4, 20);
    const iv = buf.subarray(20, 32);
    const tag = buf.subarray(32, 48);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    decipher.setAuthTag(tag);
    let plain;
    try {
        plain = Buffer.concat([decipher.update(buf.subarray(48)), decipher.final()]);
    } catch {
        throw new Error('Wrong passphrase or the file is damaged');
    }
    return EJSON.parse(zlib.gunzipSync(plain).toString('utf8'), { relaxed: false });
}

/** Read every non-system collection of a connected database. */
async function dumpDatabase(db) {
    const collections = {};
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
        if (name.startsWith('system.')) continue;
        collections[name] = await db.collection(name).find({}).toArray();
    }
    return { format: 'booker-db-dump', version: 1, created_at: new Date(), db: db.databaseName, collections };
}

/**
 * Write a dump into a database. Refuses if any target collection already has
 * documents unless `force` (which empties those collections first).
 */
async function restoreDatabase(db, dump, { force = false } = {}) {
    if (dump?.format !== 'booker-db-dump') throw new Error('Not a database dump');
    const names = Object.keys(dump.collections);
    const busy = [];
    for (const name of names) {
        if (await db.collection(name).estimatedDocumentCount() > 0) busy.push(name);
    }
    if (busy.length && !force) {
        throw new Error(`Target database is not empty (${busy.join(', ')}). Re-run with --force to replace these collections.`);
    }
    const counts = {};
    for (const name of names) {
        const docs = dump.collections[name];
        if (busy.includes(name)) await db.collection(name).deleteMany({});
        for (let i = 0; i < docs.length; i += 1000) {
            await db.collection(name).insertMany(docs.slice(i, i + 1000), { ordered: true });
        }
        counts[name] = docs.length;
    }
    return counts;
}

module.exports = { encryptDump, decryptDump, dumpDatabase, restoreDatabase };

#!/usr/bin/env node
/**
 * Restore an encrypted backup made by scripts/backup.js.
 *
 *   MONGO_URI=... BACKUP_PASSPHRASE=... npm run restore -- <file.bkp> [--force]
 *
 * Refuses to write into collections that already have data unless --force,
 * which replaces those collections. Tip: restore into a new database first
 * (change the db name in MONGO_URI), check it, then point the app at it.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const mongoose = require('mongoose');
const { decryptDump, restoreDatabase } = require('./lib/backupFile');

async function main() {
    const file = process.argv.slice(2).find(a => !a.startsWith('--'));
    if (!file) throw new Error('Usage: npm run restore -- <file.bkp> [--force]');
    const { MONGO_URI, BACKUP_PASSPHRASE } = process.env;
    if (!MONGO_URI) throw new Error('MONGO_URI is not set');

    const dump = decryptDump(fs.readFileSync(file), BACKUP_PASSPHRASE);
    await mongoose.connect(MONGO_URI);
    try {
        const counts = await restoreDatabase(mongoose.connection.db, dump, { force: process.argv.includes('--force') });
        console.log(`Restored backup from ${new Date(dump.created_at).toISOString()} into ${mongoose.connection.db.databaseName}`);
        console.log(Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(err => { console.error(`Restore failed: ${err.message}`); process.exit(1); });

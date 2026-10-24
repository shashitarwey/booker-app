#!/usr/bin/env node
/**
 * Encrypted full-database backup.
 *
 *   MONGO_URI=... BACKUP_PASSPHRASE=... npm run backup [-- --out backups]
 *
 * Writes backups/booker-<timestamp>.bkp (gzip + AES-256-GCM). Keep the
 * passphrase somewhere safe — without it the file cannot be restored.
 * BACKUP_KEEP (default 14) old files are kept in the output folder.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { encryptDump, dumpDatabase } = require('./lib/backupFile');

async function main() {
    const outIdx = process.argv.indexOf('--out');
    const outDir = path.resolve(outIdx > -1 ? process.argv[outIdx + 1] : path.join(__dirname, '..', 'backups'));
    const { MONGO_URI, BACKUP_PASSPHRASE } = process.env;
    if (!MONGO_URI) throw new Error('MONGO_URI is not set');

    await mongoose.connect(MONGO_URI);
    const dump = await dumpDatabase(mongoose.connection.db);
    await mongoose.disconnect();

    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(outDir, `booker-${stamp}.bkp`);
    fs.writeFileSync(file, encryptDump(dump, BACKUP_PASSPHRASE));

    const keep = Number(process.env.BACKUP_KEEP) || 14;
    const old = fs.readdirSync(outDir).filter(f => /^booker-.*\.bkp$/.test(f)).sort().reverse().slice(keep);
    old.forEach(f => fs.unlinkSync(path.join(outDir, f)));

    const counts = Object.entries(dump.collections).map(([k, v]) => `${k}=${v.length}`).join(' ');
    console.log(`Backup written: ${file}\n${counts}`);
}

main().catch(err => { console.error(`Backup failed: ${err.message}`); process.exit(1); });

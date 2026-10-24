require('./config/db');

const mongoose = require('mongoose');
const app = require('./app');
const logger = require('./utils/logger');

// Idempotent data migrations, once Mongo is up. Lives here rather than in
// app.js so tests (which import app.js) only run them when they ask to.
// Fire-and-forget: reads stay correct on un-migrated data, and a failure must
// never take the server down — runMigrations() logs its own errors, the catch
// is a last-resort guard.
mongoose.connection.asPromise()
    .then(() => require('./utils/migrations').runMigrations())
    .catch(err => logger.error('Startup migrations crashed', { error: err.message }));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    logger.info(`Server running at http://localhost:${PORT}`);

    // Start background account cleanup (deletes accounts 7 days after deletion request)
    const { startCleanupScheduler } = require('./utils/accountCleanup');
    startCleanupScheduler();
});

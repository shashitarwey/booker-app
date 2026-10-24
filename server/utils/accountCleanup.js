/**
 * Account Cleanup Job
 *
 * Deletes user accounts (and ALL related data) where deletion was requested
 * more than 7 days ago. Runs on a configurable interval via setInterval.
 */
const User = require('../models/User');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const Seller = require('../models/Seller');
const SellerPayment = require('../models/SellerPayment');
const Customer = require('../models/Customer');
const CustomerEntry = require('../models/CustomerEntry');
const ActivityLog = require('../models/ActivityLog');
const Person = require('../models/Person');
const Variant = require('../models/Variant');
const BookerPayment = require('../models/BookerPayment');
const logger = require('./logger');

const GRACE_PERIOD_DAYS = 7;

/**
 * Purge a single user and all their related data.
 */
async function purgeUser(user) {
    const userId = user._id;
    const cardIds = (await Card.find({ user_id: userId }, '_id')).map(c => c._id);

    // Delete transactions linked to the user's cards
    if (cardIds.length > 0) {
        const txResult = await Transaction.deleteMany({ card_id: { $in: cardIds } });
        logger.info('Deleted transactions', { userId, count: txResult.deletedCount });
    }

    // Delete orders, seller payments, sellers, khata entries, customers, cards, activity logs
    const ordResult = await Order.deleteMany({ user_id: userId });
    const spResult = await SellerPayment.deleteMany({ user_id: userId });
    const selResult = await Seller.deleteMany({ user_id: userId });
    const ceResult = await CustomerEntry.deleteMany({ user_id: userId });
    const custResult = await Customer.deleteMany({ user_id: userId });
    const cardResult = await Card.deleteMany({ user_id: userId });
    await Person.deleteMany({ user_id: userId });
    await Variant.deleteMany({ user_id: userId });
    await BookerPayment.deleteMany({ user_id: userId });
    await ActivityLog.deleteMany({ user_id: userId });

    logger.info('Purged user data', {
        userId,
        orders: ordResult.deletedCount,
        sellerPayments: spResult.deletedCount,
        sellers: selResult.deletedCount,
        customerEntries: ceResult.deletedCount,
        customers: custResult.deletedCount,
        cards: cardResult.deletedCount,
    });

    // Finally, delete the user
    await User.findByIdAndDelete(userId);
    logger.info('Deleted user account', { userId, email: user.email });
}

/**
 * Find and delete all accounts past their grace period.
 */
async function runCleanup() {
    const cutoffDate = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const expiredUsers = await User.find({
        deletion_requested_at: { $ne: null, $lte: cutoffDate },
    });

    if (expiredUsers.length === 0) return;

    logger.info(`Account cleanup: found ${expiredUsers.length} expired account(s)`);

    for (const user of expiredUsers) {
        try {
            await purgeUser(user);
        } catch (err) {
            logger.error('Failed to purge user', { userId: user._id, error: err.message });
        }
    }
}

/**
 * Start the background cleanup loop.
 * Default: checks every 6 hours.
 */
function startCleanupScheduler(intervalMs = 6 * 60 * 60 * 1000) {
    logger.info(`Account cleanup scheduler started (interval: ${intervalMs / 3600000}h)`);
    // Run once at startup after a short delay
    setTimeout(() => runCleanup(), 10_000);
    // Then repeat on interval
    setInterval(() => runCleanup(), intervalMs);
}

module.exports = { runCleanup, purgeUser, startCleanupScheduler };

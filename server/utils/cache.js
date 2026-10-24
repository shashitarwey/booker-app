/**
 * Redis Cache Utility
 *
 * Provides caching with automatic JSON serialization and graceful degradation
 * when Redis is not available (all operations become silent no-ops).
 *
 * Configure via: REDIS_URL (default: redis://localhost:6379)
 */
const Redis = require('ioredis');
const logger = require('./logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL = 300; // 5 minutes

let redis = null;
let isConnected = false;

function getClient() {
    if (redis) return redis;

    redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
            if (times > 3) return null; // stop retrying after 3 attempts
            return Math.min(times * 500, 3000);
        },
        lazyConnect: true,
        enableOfflineQueue: false,
    });

    redis.on('connect', () => {
        isConnected = true;
        logger.info('Redis connected', { host: new URL(REDIS_URL).host }); // never log credentials
    });

    redis.on('error', (err) => {
        if (isConnected) {
            logger.warn('Redis error', { error: err.message });
        }
        isConnected = false;
    });

    redis.on('close', () => {
        isConnected = false;
    });

    // Attempt connection (non-blocking)
    redis.connect().catch(() => {
        logger.warn('Redis unavailable — caching disabled, running without cache');
    });

    return redis;
}

/**
 * Get a cached value.
 * @returns parsed JSON or null
 */
async function get(key) {
    if (!isConnected) return null;
    try {
        const data = await getClient().get(key);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

/**
 * Set a cached value.
 * @param {string} key
 * @param {*} value — will be JSON-stringified
 * @param {number} ttl — seconds (default 300 = 5 min)
 */
async function set(key, value, ttl = DEFAULT_TTL) {
    if (!isConnected) return;
    try {
        await getClient().set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
        // silently ignore
    }
}

/**
 * Delete keys matching a pattern (e.g. "summary:userId:*").
 */
async function invalidate(pattern) {
    if (!isConnected) return;
    try {
        // SCAN instead of KEYS: KEYS blocks Redis while it walks every key
        const client = getClient();
        let cursor = '0';
        let count = 0;
        do {
            const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
            cursor = next;
            if (keys.length) {
                await client.del(...keys);
                count += keys.length;
            }
        } while (cursor !== '0');
        if (count) logger.info('Cache invalidated', { pattern, count });
    } catch {
        // silently ignore
    }
}

/**
 * Delete a specific key.
 */
async function del(key) {
    if (!isConnected) return;
    try {
        await getClient().del(key);
    } catch {
        // silently ignore
    }
}

/**
 * Express middleware: cache GET responses.
 * Usage: router.get('/path', cacheMiddleware(ttl), handler)
 *
 * Cache key format: "route:userId:url"
 */
function cacheMiddleware(ttl = DEFAULT_TTL) {
    return async (req, res, next) => {
        if (!isConnected) return next();

        const key = `route:${req.user?.id || 'anon'}:${req.originalUrl}`;
        try {
            const cached = await get(key);
            if (cached) {
                return res.json(cached);
            }
        } catch {
            return next();
        }

        // Intercept res.json to cache the response
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            // Only cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                set(key, body, ttl).catch(() => { });
            }
            return originalJson(body);
        };

        next();
    };
}

// Cached GET endpoints, by area (cacheMiddleware keys are "route:<user>:<url>")
const CACHED_AREAS = {
    summary: '/api/summary',
    analytics: '/api/analytics',
    people: '/api/people',
    reports: '/api/reports',
};

// Which cached areas each kind of write makes stale. One place to reason
// about cache correctness instead of every route guessing.
const AFFECTS = {
    orders:          ['summary', 'analytics', 'people', 'reports'],
    cards:           ['summary', 'analytics', 'people', 'reports'],
    people:          ['summary', 'analytics', 'people', 'reports'],
    transactions:    ['summary', 'reports'],
    sellers:         ['analytics', 'people', 'reports'], // buyer names: profit-by-buyer, booker khata, report entries
    seller_payments: ['analytics'],          // receivable from buyers
    booker_payments: ['analytics', 'people'], // payable to bookers, pending dues
};

/**
 * Invalidate only the cached areas a write affects.
 * Usage: invalidateCache(req, 'orders')
 */
function invalidateCache(req, change) {
    const uid = req.user?.id;
    if (!uid) return;
    const areas = AFFECTS[change];
    if (!areas) {
        logger.warn('invalidateCache: unknown change type, clearing all', { change });
        invalidate(`route:${uid}:*`).catch(() => { });
        return;
    }
    for (const area of areas) invalidate(`route:${uid}:${CACHED_AREAS[area]}*`).catch(() => { });
}

/**
 * Express middleware: invalidate ALL of a user's cached data after mutations.
 * Prefer invalidateCache(req, change), which only clears affected areas.
 * Usage: router.post('/path', handler, invalidateSummaryCache)
 */
function invalidateSummaryCache(req, res, next) {
    // Run invalidation after the response is sent
    if (req.user?.id) {
        invalidate(`route:${req.user.id}:*`).catch(() => { });
    }
    if (next) next();
}

/** Check if Redis is connected */
function isRedisConnected() {
    return isConnected;
}

// Initialize the client on module load
getClient();

module.exports = {
    get, set, del, invalidate,
    cacheMiddleware, invalidateSummaryCache, invalidateCache,
    isRedisConnected,
};

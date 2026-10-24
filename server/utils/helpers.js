const mongoose = require('mongoose');
const { todayAsUtcDate } = require('./dates');

/**
 * Pick only the specified fields from an object.
 * Prevents mass-assignment by whitelisting allowed properties.
 *
 * @param {Object} source - The source object (typically req.body)
 * @param {string[]} allowedFields - Array of field names to pick
 * @returns {Object} A new object containing only the allowed fields
 */
function pickFields(source, allowedFields) {
    const result = {};
    for (const key of allowedFields) {
        if (source[key] !== undefined) result[key] = source[key];
    }
    return result;
}

/**
 * Convert a string ID to a Mongoose ObjectId.
 * Shorthand for `new mongoose.Types.ObjectId(id)`.
 *
 * @param {string} id - The string ID to convert
 * @returns {mongoose.Types.ObjectId}
 */
function toObjectId(id) {
    return new mongoose.Types.ObjectId(id);
}

/**
 * Build a date range filter object for Mongoose queries.
 *
 * @param {string} [fromDate] - Start date in YYYY-MM-DD format
 * @param {string} [toDate]   - End date in YYYY-MM-DD format
 * @returns {Object|null} A Mongoose query filter { $gte, $lte } or null if no dates provided
 */
function buildDateRange(fromDate, toDate) {
    if (!fromDate && !toDate) return null;
    const range = {};
    if (fromDate) range.$gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (toDate) range.$lte = new Date(`${toDate}T23:59:59.999Z`);
    return range;
}

// Clamp a day-of-month to the month's length (e.g. 31 in Feb → 28/29), at UTC midnight
const clampDay = (year, month, day) => {
    const max = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, max)));
};

// All cycle start dates around refDate, ascending
function cycleStarts(resetDay, period, startMonth, refDate) {
    const y = refDate.getUTCFullYear();
    if (period === 'monthly') {
        const out = [];
        for (let k = -13; k <= 13; k++) out.push(clampDay(y, refDate.getUTCMonth() + k, resetDay));
        return out;
    }
    // quarterly / half-yearly / yearly: anchored to startMonth
    // e.g. startMonth=3 (March), quarterly, resetDay=16 → Mar 16, Jun 16, Sep 16, Dec 16…
    const step = { 'quarterly': 3, 'half-yearly': 6, 'yearly': 12 }[period] || 3;
    const anchor = startMonth - 1;
    const out = [];
    for (let baseYear = y - 2; baseYear <= y + 1; baseYear++) {
        for (let mo = anchor; mo < anchor + 12; mo += step) out.push(clampDay(baseYear, mo, resetDay));
    }
    return out.sort((a, b) => a - b);
}

/**
 * Cashback cycle containing refDate: { start, end } (end exclusive), UTC midnight.
 * @param {number} resetDay    - Day of month the cycle resets (1-31)
 * @param {string} period      - 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
 * @param {number} startMonth  - Month when the first cycle begins (1-12); non-monthly only
 * @param {Date}   [refDate]   - defaults to today in the business timezone
 */
function getCashbackCycle(resetDay = 1, period = 'monthly', startMonth = 1, refDate = todayAsUtcDate()) {
    const starts = cycleStarts(resetDay || 1, period || 'monthly', startMonth || 1, refDate);
    let idx = 0;
    for (let k = 0; k < starts.length; k++) if (starts[k] <= refDate) idx = k;
    return { start: starts[idx], end: starts[idx + 1] };
}

/** Start of the cashback cycle containing refDate (default: today). */
function getCashbackCycleStart(resetDay = 1, period = 'monthly', startMonth = 1, refDate = todayAsUtcDate()) {
    return getCashbackCycle(resetDay, period, startMonth, refDate).start;
}

/**
 * Parse page/limit from query params and return skip, pageNum, limitNum.
 * @param {Object} query - req.query
 * @returns {{ pageNum: number, limitNum: number, skip: number }}
 */
function parsePagination(query) {
    const pageNum = Math.max(1, parseInt(query.page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
    return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
}

/**
 * Build a standardized paginated response.
 * @param {Array} items - The data items for the current page
 * @param {number} total - Total item count across all pages
 * @param {number} current - Current page number
 * @param {number} size - Page size
 * @returns {{ items: Array, page: Object }}
 */
function paginatedResponse(items, total, current, size) {
    return {
        items,
        page: {
            type: 'number',
            current,
            size,
            item_total: total,
            has_next: current * size < total,
            has_previous: current > 1
        }
    };
}

/**
 * Escape a user-supplied string for literal use inside a RegExp, so search
 * input like "(" or ".*" can't throw or act as a pattern.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { pickFields, toObjectId, buildDateRange, getCashbackCycleStart, getCashbackCycle, parsePagination, paginatedResponse, escapeRegex };

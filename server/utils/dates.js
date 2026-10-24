/**
 * "Today" in the business timezone. Stored dates are calendar days saved as
 * UTC midnight (from 'YYYY-MM-DD'), so "today" must be the local calendar day
 * — otherwise in India the server thinks it's yesterday until 05:30.
 * Override with APP_TZ (IANA name).
 */
const APP_TZ = process.env.APP_TZ || 'Asia/Kolkata';

/** Local calendar date as 'YYYY-MM-DD'. */
function todayLocal(now = new Date()) {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Local calendar date as a Date at UTC midnight (same representation as stored dates). */
function todayAsUtcDate(now = new Date()) {
    return new Date(`${todayLocal(now)}T00:00:00.000Z`);
}

module.exports = { APP_TZ, todayLocal, todayAsUtcDate };

/**
 * Running-balance ledger feeds, computed inside MongoDB.
 *
 * Every ledger feed (buyer ledger, customer khata, booker khata) has the same
 * shape: merge one or more collections into a single timeline, walk it oldest
 * → newest keeping a running balance, then return one page newest-first.
 * Doing that walk in JS means loading a party's whole history on every page
 * request, so instead the database does it:
 *
 *   $unionWith (in the caller's pipeline)  → one merged stream
 *   $setWindowFields                       → running sum in chronological order
 *   $sort (exact reverse of the window)    → newest-first
 *   $facet { rows: $skip/$limit, total }   → one page + item count, one round-trip
 *
 * The caller's pipeline should project rows down to the fields the sort and
 * delta need (plus ids to hydrate the page with) so the window stage stays
 * cheap; only the ≤100 rows of the page are then loaded in full.
 *
 * Note: MongoDB's $sum uses compensated (double-double) summation, so for
 * fractional amounts the balance can differ from naive JS `+=` in the last
 * floating-point digit (e.g. 800.2 instead of 800.1999999999999). For whole
 * rupee/paise-free amounts the results are identical.
 */

const reverseSort = (sortBy) => Object.fromEntries(Object.entries(sortBy).map(([k, dir]) => [k, -dir]));

/**
 * @param {mongoose.Model} Model     - collection the pipeline starts from
 * @param {Object[]} pipeline        - $match/$project/$unionWith stages producing ledger rows
 * @param {Object} opts
 * @param {Object} opts.sortBy       - chronological (ascending) sort spec; must be a total order
 * @param {Object} opts.delta        - aggregation expression: signed effect of a row on the balance
 * @param {number} [opts.skip]       - rows to skip (newest-first)
 * @param {number} [opts.limit]      - page size; omit to return every row (PDF exports)
 * @returns {Promise<{ rows: Object[], total: number }>} rows newest-first, each with `runningBalance`
 */
async function runningBalanceFeed(Model, pipeline, { sortBy, delta, skip = 0, limit }) {
    const stages = [
        ...pipeline,
        {
            $setWindowFields: {
                sortBy,
                output: { runningBalance: { $sum: delta, window: { documents: ['unbounded', 'current'] } } },
            },
        },
        { $sort: reverseSort(sortBy) },
    ];

    // Unpaginated export: no $facet, its single output document is capped at 16MB
    if (limit === undefined) {
        const rows = await Model.aggregate(stages).allowDiskUse(true);
        return { rows, total: rows.length };
    }

    const [out] = await Model.aggregate([
        ...stages,
        { $facet: { rows: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'n' }] } },
    ]).allowDiskUse(true);
    return { rows: out.rows, total: out.total[0]?.n || 0 };
}

/** Map `_id` → document for re-attaching full documents to page rows. */
const byId = (docs) => new Map(docs.map(d => [String(d._id), d]));

module.exports = { runningBalanceFeed, byId };

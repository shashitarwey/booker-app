// Shared statement-PDF helpers used by both the seller ledger report
// (ledgerPdf.js) and the khata book report (khataPdf.js). Keeps the CSS,
// helpers, and HTML skeleton in one place so both reports stay in sync.

export const fmtAmt = (n) =>
    (n || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

export const escapeHtml = (str) =>
    String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

/**
 * Split a signed balance into its printable magnitude + Dr/Cr suffix.
 * Positive = Dr (they owe), negative = Cr (advance).
 * @param {number} n
 * @returns {{ text: string, suffix: string }}
 */
export const balanceParts = (n) => ({
    text: fmtAmt(Math.abs(n)),
    suffix: n === 0 ? '' : (n > 0 ? ' Dr' : ' Cr'),
});

/**
 * Split chronologically-sorted entries into the ones carried forward (before
 * `from`) and the ones inside the selected window. Entries after `to` are
 * dropped. Both bounds are inclusive and optional.
 *
 * @param {Array}  sorted   - entries sorted ascending, each with a `date` Date
 * @param {?Date}  from     - start of window (null = no lower bound)
 * @param {?Date}  to       - end of window (null = no upper bound)
 * @returns {{ before: Array, within: Array }}
 */
export const splitByRange = (sorted, from, to) => {
    const before = [];
    const within = [];
    for (const item of sorted) {
        if (from && item.date < from) { before.push(item); continue; }
        if (to && item.date > to) break;
        within.push(item);
    }
    return { before, within };
};

const STATEMENT_STYLES = `
    @page {
        size: A4;
        margin: 14mm 12mm 18mm 12mm;
        @bottom-right {
            content: "Page " counter(page) " of " counter(pages);
            font-size: 10px;
            color: #777;
        }
    }
    * { box-sizing: border-box; }
    body {
        font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
        color: #1a1a1a;
        margin: 0;
        padding: 8px 4px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        font-size: 12px;
    }
    .brand-bar {
        background: #1d4ed8;
        color: #fff;
        padding: 10px 16px;
        border-radius: 6px;
        margin-bottom: 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
    }
    .brand-bar .brand-name {
        font-weight: 700;
        font-size: 14px;
        letter-spacing: 0.3px;
    }
    .statement-title {
        text-align: center;
        font-size: 18px;
        font-weight: 700;
        margin: 4px 0 4px;
    }
    .statement-subtitle {
        text-align: center;
        font-size: 12px;
        color: #444;
        margin-bottom: 18px;
    }
    .summary {
        display: flex;
        width: 100%;
        border: 1px solid #d8d8d8;
        border-radius: 8px;
        margin-bottom: 14px;
    }
    .summary-cell {
        flex: 1 1 0;
        min-width: 0;
        padding: 14px 16px;
        border-right: 1px solid #ececec;
    }
    .summary-cell:last-child { border-right: none; }
    .summary-label {
        font-size: 11px;
        color: #555;
        margin-bottom: 6px;
    }
    .summary-value {
        font-size: 15px;
        font-weight: 700;
        color: #1a1a1a;
    }
    .summary-value.red { color: #c62828; }
    .summary-sub {
        font-size: 10px;
        color: #888;
        margin-top: 4px;
    }
    .dr-suffix {
        font-size: 10px;
        color: #c62828;
        font-weight: 500;
        margin-left: 2px;
    }
    .entries-count {
        font-size: 12px;
        color: #444;
        margin: 6px 2px 6px;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #d8d8d8;
        border-radius: 6px;
        overflow: hidden;
    }
    thead th {
        background: #f3f4f6;
        padding: 10px 10px;
        font-size: 11px;
        text-align: left;
        font-weight: 700;
        color: #333;
        border-bottom: 1px solid #d0d0d0;
    }
    thead th.amt { text-align: right; }
    .month-row td {
        background: #fafafa;
        padding: 9px 10px;
        font-weight: 700;
        font-size: 12px;
        border-bottom: 1px solid #e5e5e5;
        border-top: 1px solid #e5e5e5;
    }
    .month-row .opening {
        font-weight: 400;
        color: #666;
        font-size: 11px;
        text-align: right;
    }
    .opening-row td {
        background: #eef2ff;
        border-bottom: 1px solid #d5dcf5;
    }
    tbody td {
        padding: 11px 10px;
        border-bottom: 1px solid #ececec;
        font-size: 12px;
        vertical-align: middle;
    }
    .amt {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .debit-cell { background: #fde8e8; }
    .credit-cell { background: #e4f5e7; }
    .balance-red { color: #c62828; font-weight: 600; }
    .grand-total td {
        background: #f3f4f6;
        font-weight: 700;
        padding: 12px 10px;
        border-top: 2px solid #c0c0c0;
        font-size: 12px;
    }
    .empty-msg {
        text-align: center;
        color: #888;
        padding: 20px;
        font-size: 12px;
    }
    .report-footer {
        margin-top: 14px;
        font-size: 10px;
        color: #888;
    }
    @media print {
        body { padding: 0; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tr { page-break-inside: avoid; }
        .month-row { page-break-after: avoid; }
        .brand-bar { page-break-after: avoid; }
    }
`;

const buildBodyRows = (groups, emptyMsg, showDeliveryDate, openingRow) => {
    const colspanTotal = showDeliveryDate ? 6 : 5;
    const colspanOpening = showDeliveryDate ? 4 : 3;

    // Carry-forward row shown above the first month when a date filter is on,
    // so the first in-range balance is traceable back to something.
    const openingRowHtml = openingRow ? `
        <tr class="month-row opening-row">
            <td colspan="${colspanTotal - 1}">Opening Balance (as on ${escapeHtml(openingRow.date)})</td>
            <td class="amt balance-red">${openingRow.balance}<span class="dr-suffix">${openingRow.suffix}</span></td>
        </tr>` : '';

    if (groups.length === 0) {
        return openingRowHtml +
            `<tr><td colspan="${colspanTotal}" class="empty-msg">${escapeHtml(emptyMsg)}</td></tr>`;
    }
    return openingRowHtml + groups.map(group => {
        const monthHeader = `
            <tr class="month-row">
                <td colspan="2">${escapeHtml(group.monthLabel)}</td>
                <td colspan="${colspanOpening}" class="opening">(Opening Balance: ${group.opening})</td>
            </tr>`;
        const entryRows = group.entries.map(e => `
            <tr>
                <td>${e.dateLabel}</td>
                <td>${escapeHtml(e.details)}</td>
                ${showDeliveryDate ? `<td>${escapeHtml(e.deliveredDate || '')}</td>` : ''}
                <td class="amt debit-cell">${e.debit}</td>
                <td class="amt credit-cell">${e.credit}</td>
                <td class="amt balance-red">${e.balance}<span class="dr-suffix">${e.suffix}</span></td>
            </tr>`).join('');
        return monthHeader + entryRows;
    }).join('');
};

/**
 * Build a complete HTML statement document.
 * Callers transform their domain entries into generic { date, description,
 * debit?, credit? } shape and pass everything already-formatted here.
 *
 * @param {Object} config
 * @param {string} config.documentTitle     - browser <title> (also appears in print header)
 * @param {string} config.brandSubtitle     - right side of brand bar, e.g. "Khata Statement"
 * @param {string} config.statementTitle    - centered heading, e.g. "Vaibhav (Gandey) Statement"
 * @param {string} config.dateRange         - parenthesized subtitle (e.g. "30 Mar 2026 - 10 Apr 2026")
 * @param {string} config.openingDate       - "30 Mar 2026"
 * @param {string} [config.openingBalance]  - formatted carry-forward amount, defaults to "0.00"
 * @param {string} [config.openingSuffix]   - " Dr" / " Cr" / "" for the carry-forward amount
 * @param {boolean} [config.filtered]       - true when a date filter narrowed the entries
 * @param {Array}  config.groups            - month groups from buildMonthGroups()
 * @param {number} config.entriesCount
 * @param {Object} config.summary           - { debitLabel, creditLabel, debit, credit, balance, balanceSuffix, balanceLine }
 * @param {Object} config.columns           - { debitHeader, creditHeader } for the table
 * @param {string} config.generatedAt       - "hh:mm am | dd MMM 'yy"
 * @param {string} config.emptyMsg          - shown when groups is empty
 */
export const buildStatementHtml = ({
    documentTitle,
    brandSubtitle,
    statementTitle,
    dateRange,
    openingDate,
    openingBalance = '0.00',
    openingSuffix = '',
    filtered = false,
    groups,
    entriesCount,
    summary,
    columns,
    generatedAt,
    emptyMsg,
}) => {
    const showDeliveryDate = !!columns.deliveryHeader;
    // Only worth a dedicated table row when a filter is on — an unfiltered
    // report always opens at zero, which the first month header already says.
    const openingRow = filtered
        ? { date: openingDate, balance: openingBalance, suffix: openingSuffix }
        : null;
    const bodyRows = buildBodyRows(groups, emptyMsg, showDeliveryDate, openingRow);
    const grandTotalRow = groups.length === 0 ? '' : `
        <tr class="grand-total">
            <td colspan="${showDeliveryDate ? 3 : 2}">Grand Total</td>
            <td class="amt">${summary.debit}</td>
            <td class="amt">${summary.credit}</td>
            <td class="amt balance-red">${summary.balance}<span class="dr-suffix">${summary.balanceSuffix}</span></td>
        </tr>`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(documentTitle)}</title>
<style>${STATEMENT_STYLES}</style>
</head>
<body>
    <div class="brand-bar">
        <div class="brand-name">Booker</div>
        <div>${escapeHtml(brandSubtitle)}</div>
    </div>

    <div class="statement-title">${escapeHtml(statementTitle)}</div>
    <div class="statement-subtitle">(${escapeHtml(dateRange)})</div>

    <div class="summary">
        <div class="summary-cell">
            <div class="summary-label">Opening Balance</div>
            <div class="summary-value">Rs. ${openingBalance}<span class="dr-suffix">${openingSuffix}</span></div>
            <div class="summary-sub">(on ${escapeHtml(openingDate)})</div>
        </div>
        <div class="summary-cell">
            <div class="summary-label">${escapeHtml(summary.debitLabel)}</div>
            <div class="summary-value">Rs. ${summary.debit}</div>
        </div>
        <div class="summary-cell">
            <div class="summary-label">${escapeHtml(summary.creditLabel)}</div>
            <div class="summary-value">Rs. ${summary.credit}</div>
        </div>
        <div class="summary-cell">
            <div class="summary-label">Net Balance</div>
            <div class="summary-value red">Rs. ${summary.balance}<span class="dr-suffix">${summary.balanceSuffix}</span></div>
            <div class="summary-sub">(${escapeHtml(summary.balanceLine)})</div>
        </div>
    </div>

    <div class="entries-count">No. of Entries: ${entriesCount} (${filtered ? 'Filtered' : 'All'})</div>

    <table>
        <thead>
            <tr>
                <th style="width: 12%;">Date</th>
                <th>Details</th>
                ${showDeliveryDate ? `<th style="width: 12%; white-space: nowrap;">${escapeHtml(columns.deliveryHeader)}</th>` : ''}
                <th class="amt" style="width: 15%;">${escapeHtml(columns.debitHeader)}</th>
                <th class="amt" style="width: 15%;">${escapeHtml(columns.creditHeader)}</th>
                <th class="amt" style="width: 17%;">Balance</th>
            </tr>
        </thead>
        <tbody>
            ${bodyRows}
            ${grandTotalRow}
        </tbody>
    </table>

    <div class="report-footer">Report Generated : ${escapeHtml(generatedAt)}</div>
</body>
</html>`;
};

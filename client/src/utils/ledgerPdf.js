import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { printHtmlInIframe } from './printHtml';
import { buildStatementHtml, fmtAmt, balanceParts, splitByRange } from './pdfStatement';

/**
 * Build and print the seller/buyer ledger statement.
 *
 * @param {Object} seller
 * @param {Array}  items  - merged orders + payments (full history)
 * @param {Object} [range] - { from, to } as 'yyyy-MM-dd'. Entries outside the
 *   window are excluded from the table and totals; everything before `from`
 *   is rolled into the opening (previous) balance so the running balance
 *   stays continuous with the full ledger.
 */
export const downloadLedgerPdf = (seller, items, range = {}, opts = {}) => {
    // Only delivered orders + all payments. Pending and cancelled orders excluded.
    const filtered = items.filter(item =>
        item.type === 'PAYMENT' || (!item.isPending && !item.isCancelled)
    );

    const sorted = [...filtered].sort((a, b) => a.date - b.date);

    const from = range.from ? startOfDay(parseISO(range.from)) : null;
    const to = range.to ? endOfDay(parseISO(range.to)) : null;
    const isFiltered = Boolean(from || to);

    const { before, within } = splitByRange(sorted, from, to);

    // Everything before the window collapses into a single carry-forward figure.
    const openingBalance = before.reduce(
        (bal, item) => item.type === 'ORDER' ? bal + item.amount : bal - item.amount,
        0
    );

    // Group by calendar month, walking forward so each group's "opening"
    // snapshots the balance before its first entry.
    const groups = [];
    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;
    let currentGroup = null;

    within.forEach(item => {
        const key = format(item.date, 'yyyy-MM');
        if (!currentGroup || currentGroup.key !== key) {
            const open = balanceParts(runningBalance);
            currentGroup = {
                key,
                monthLabel: format(item.date, 'MMMM yyyy'),
                opening: runningBalance === 0 ? '0.00' : `${open.text}${open.suffix}`,
                entries: [],
            };
            groups.push(currentGroup);
        }

        const isOrder = item.type === 'ORDER';
        if (isOrder) {
            runningBalance += item.amount;
            totalDebit += item.amount;
        } else {
            runningBalance -= item.amount;
            totalCredit += item.amount;
        }

        // Delivery date only makes sense for orders. Pull it from the raw
        // document — only delivered orders are included by the filter above.
        const deliveredDate = isOrder && item.raw?.delivered_date
            ? format(new Date(item.raw.delivered_date), 'dd MMM')
            : '';

        const bal = balanceParts(runningBalance);
        currentGroup.entries.push({
            dateLabel: format(item.date, 'dd MMM'),
            details: item.description,
            deliveredDate,
            debit: isOrder ? fmtAmt(item.amount) : '',
            credit: isOrder ? '' : fmtAmt(item.amount),
            balance: bal.text,
            suffix: bal.suffix,
        });
    });

    const netBalance = openingBalance + totalDebit - totalCredit;
    const today = new Date();
    // With a filter the header shows the requested window, not the data extent,
    // so an empty month still reads as "nothing happened in this period".
    const firstDate = from || (within.length > 0 ? within[0].date : today);
    const lastDate = to || (within.length > 0 ? within[within.length - 1].date : today);
    const net = balanceParts(netBalance);
    const opening = balanceParts(openingBalance);
    const balanceVerb = netBalance > 0 ? 'will give' : netBalance < 0 ? 'will get' : 'is clear';
    // opts lets other ledgers (booker khata) reuse this layout with their own wording
    const balanceLine = opts.balanceLine ? opts.balanceLine(netBalance) : `${seller.name} ${balanceVerb}`;

    const html = buildStatementHtml({
        documentTitle: `${seller.name} - Ledger Statement`,
        brandSubtitle: opts.brandSubtitle || 'Ledger Statement',
        statementTitle: `${seller.name}${seller.city ? ` (${seller.city})` : ''} Statement`,
        dateRange: `${format(firstDate, 'dd MMM yyyy')} - ${format(lastDate, 'dd MMM yyyy')}`,
        openingDate: format(firstDate, 'dd MMM yyyy'),
        openingBalance: opening.text,
        openingSuffix: opening.suffix,
        filtered: isFiltered,
        groups,
        entriesCount: within.length,
        summary: {
            debitLabel: opts.debitLabel || 'Total Debit(-)',
            creditLabel: opts.creditLabel || 'Total Credit(+)',
            debit: fmtAmt(totalDebit),
            credit: fmtAmt(totalCredit),
            balance: net.text,
            balanceSuffix: net.suffix,
            balanceLine,
        },
        columns: {
            debitHeader: opts.debitHeader || 'Debit(-)',
            creditHeader: opts.creditHeader || 'Credit(+)',
            deliveryHeader: 'Delivery Date',
        },
        generatedAt: format(today, "hh:mm a | dd MMM ''yy"),
        emptyMsg: isFiltered
            ? 'No delivered orders or payments in the selected period.'
            : 'No delivered orders or payments to show.',
    });

    return printHtmlInIframe(html);
};

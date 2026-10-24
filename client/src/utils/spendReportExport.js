import { format, parseISO } from 'date-fns';
import { toCSV, downloadCSV } from './csv';
import { printHtmlInIframe } from './printHtml';
import { fmtAmt, escapeHtml } from './pdfStatement';
import { RELATIONS } from '../constants';

// 'YYYY-MM' → 'Apr 26'
export const monthLabel = (key) => format(parseISO(`${key}-01`), 'MMM yy');

const dmy = (iso) => format(new Date(iso), 'dd-MM-yyyy');

export const cardName = (c) => `${c.bank_name} •••• ${c.last_four_digit}`;

export const cardTypeLabel = (c) => {
  if (c.card_type !== 'addon') return 'Primary';
  return c.primary_card
    ? `Add-on of ${c.primary_card.bank_name} •••• ${c.primary_card.last_four_digit} (${c.primary_card.holder_name})`
    : 'Add-on';
};

const fyLabel = (report) => `${dmy(report.from_date)} to ${dmy(report.to_date)}`;

const fileStem = (report, people) => {
  const who = people.length === 1 ? people[0].name.replace(/\s+/g, '_') : 'Family';
  return `card_spends_${who}_${report.from_date}_${report.to_date}`;
};

// ── CSV ────────────────────────────────────────────────────────────────────

/** One row per card with totals and a column per month. */
export const downloadSpendSummaryCSV = (report, people) => {
  const rows = people.flatMap(p => p.banks.flatMap(b => b.cards.map(c => ({ p, b, c }))));
  const columns = [
    { header: 'Person', value: r => r.p.name },
    { header: 'Relation', value: r => RELATIONS[r.p.relation]?.label || r.p.relation },
    { header: 'Bank', value: r => r.c.bank_name },
    { header: 'Card', value: r => `XXXX ${r.c.last_four_digit}` },
    { header: 'Network', value: r => r.c.card_network },
    { header: 'Card Type', value: r => cardTypeLabel(r.c) },
    { header: 'Card Transactions', value: r => r.c.txn_total },
    { header: 'Orders', value: r => r.c.order_total },
    { header: 'Total Spend', value: r => r.c.total_spend },
    { header: 'Billed incl. Add-ons', value: r => r.c.billed_total ?? '' },
    ...report.months.map((m, i) => ({ header: monthLabel(m), value: r => r.c.monthly[i] })),
  ];
  downloadCSV(`${fileStem(report, people)}_summary.csv`, toCSV(rows, columns));
};

/** Every spend entry (card transactions + orders) in the range. */
export const downloadSpendEntriesCSV = (report, people) => {
  const cardInfo = new Map();
  for (const p of people) for (const b of p.banks) for (const c of b.cards) cardInfo.set(String(c._id), { p, c });
  const rows = (report.items || []).filter(it => cardInfo.has(String(it.card_id)));
  const columns = [
    { header: 'Date', value: it => dmy(it.date) },
    { header: 'Person', value: it => cardInfo.get(String(it.card_id)).p.name },
    { header: 'Bank', value: it => cardInfo.get(String(it.card_id)).c.bank_name },
    { header: 'Card', value: it => `XXXX ${cardInfo.get(String(it.card_id)).c.last_four_digit}` },
    { header: 'Type', value: it => it.source },
    { header: 'Description', value: it => it.description },
    { header: 'Amount', value: it => it.amount },
  ];
  downloadCSV(`${fileStem(report, people)}_entries.csv`, toCSV(rows, columns));
};

// ── PDF (print) ────────────────────────────────────────────────────────────

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 6px; font-size: 11px;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .person { page-break-after: always; }
  .person:last-child { page-break-after: auto; }
  .brand { background: #4c3fd1; color: #fff; padding: 10px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
  .brand b { font-size: 14px; }
  h1 { font-size: 18px; text-align: center; margin: 14px 0 2px; }
  .sub { text-align: center; color: #555; margin-bottom: 14px; }
  .summary { display: flex; border: 1px solid #d8d8d8; border-radius: 8px; margin-bottom: 14px; }
  .summary div { flex: 1; padding: 10px 14px; border-right: 1px solid #ececec; }
  .summary div:last-child { border-right: none; }
  .summary span { display: block; color: #555; font-size: 10px; margin-bottom: 4px; }
  .summary strong { font-size: 14px; }
  h2 { font-size: 13px; margin: 16px 0 6px; display: flex; justify-content: space-between; }
  .sft { color: #b45309; font-size: 10px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #d8d8d8; margin-bottom: 8px; }
  th { background: #f3f4f6; text-align: left; padding: 7px 8px; font-size: 10px; border-bottom: 1px solid #d0d0d0; }
  td { padding: 7px 8px; border-bottom: 1px solid #ececec; vertical-align: top; }
  .amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .muted { color: #777; font-size: 10px; }
  .total td { background: #f3f4f6; font-weight: 700; }
  .months th, .months td { padding: 5px 4px; font-size: 9px; }
  .footer { margin-top: 10px; color: #888; font-size: 9px; }
  @media print { thead { display: table-header-group; } tr { page-break-inside: avoid; } }
`;

const personHtml = (report, p, itemsByCard) => {
  const allCards = p.banks.flatMap(b => b.cards);
  const bankTables = p.banks.map(b => `
    <h2><span>${escapeHtml(b.bank_name)} — Rs. ${fmtAmt(b.total_spend)}</span>
      ${b.sft_reportable ? `<span class="sft">Billed Rs. ${fmtAmt(b.billed_total)} — crosses Rs. 10 lakh (SFT reportable)</span>` : ''}</h2>
    <table>
      <thead><tr><th>Card</th><th>Type</th><th class="amt">Card Txns</th><th class="amt">Orders</th><th class="amt">Total Spend</th><th class="amt">Billed incl. Add-ons</th></tr></thead>
      <tbody>${b.cards.map(c => `
        <tr>
          <td>XXXX ${escapeHtml(c.last_four_digit)}<div class="muted">${escapeHtml(c.card_network)} · ${escapeHtml(c.name_on_card || '')}</div></td>
          <td>${escapeHtml(cardTypeLabel(c))}${c.addons?.length ? `<div class="muted">Add-ons: ${c.addons.map(a => `XXXX ${escapeHtml(a.last_four_digit)} (${escapeHtml(a.holder_name)}) Rs. ${fmtAmt(a.total_spend)}`).join(', ')}</div>` : ''}</td>
          <td class="amt">${fmtAmt(c.txn_total)}<div class="muted">${c.txn_count} ${c.txn_count === 1 ? 'entry' : 'entries'}</div></td>
          <td class="amt">${fmtAmt(c.order_total)}<div class="muted">${c.order_count} ${c.order_count === 1 ? 'order' : 'orders'}</div></td>
          <td class="amt"><b>${fmtAmt(c.total_spend)}</b></td>
          <td class="amt">${c.billed_total != null ? fmtAmt(c.billed_total) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`).join('');

  const monthTable = allCards.length ? `
    <h2><span>Month-wise spend</span></h2>
    <table class="months">
      <thead><tr><th>Card</th>${report.months.map(m => `<th class="amt">${monthLabel(m)}</th>`).join('')}<th class="amt">Total</th></tr></thead>
      <tbody>
        ${allCards.map(c => `<tr><td>${escapeHtml(c.bank_name)} XXXX ${escapeHtml(c.last_four_digit)}</td>${c.monthly.map(v => `<td class="amt">${v ? fmtAmt(v) : '—'}</td>`).join('')}<td class="amt"><b>${fmtAmt(c.total_spend)}</b></td></tr>`).join('')}
        <tr class="total"><td>Total</td>${p.monthly.map(v => `<td class="amt">${v ? fmtAmt(v) : '—'}</td>`).join('')}<td class="amt">${fmtAmt(p.total_spend)}</td></tr>
      </tbody>
    </table>` : '';

  const entryTables = allCards.filter(c => (itemsByCard.get(String(c._id)) || []).length).map(c => {
    const items = itemsByCard.get(String(c._id));
    return `
      <h2><span>Entries — ${escapeHtml(c.bank_name)} XXXX ${escapeHtml(c.last_four_digit)}</span><span class="muted">${items.length} ${items.length === 1 ? 'entry' : 'entries'}</span></h2>
      <table>
        <thead><tr><th style="width:80px">Date</th><th style="width:80px">Type</th><th>Description</th><th class="amt">Amount</th></tr></thead>
        <tbody>
          ${items.map(it => `<tr><td>${dmy(it.date)}</td><td>${it.source}</td><td>${escapeHtml(it.description)}</td><td class="amt">${fmtAmt(it.amount)}</td></tr>`).join('')}
          <tr class="total"><td colspan="3">Total</td><td class="amt">${fmtAmt(c.total_spend)}</td></tr>
        </tbody>
      </table>`;
  }).join('');

  return `
    <section class="person">
      <div class="brand"><b>Booker</b><span>Credit Card Spend Statement</span></div>
      <h1>${escapeHtml(p.name)}</h1>
      <div class="sub">(${fyLabel(report)})</div>
      <div class="summary">
        <div><span>Total Card Spend</span><strong>Rs. ${fmtAmt(p.total_spend)}</strong></div>
        <div><span>Billed to ${escapeHtml(p.name)} (primary cards incl. add-ons)</span><strong>Rs. ${fmtAmt(p.billed_total)}</strong></div>
        <div><span>Cards</span><strong>${p.card_count}</strong></div>
      </div>
      ${bankTables || '<p class="muted">No cards.</p>'}
      ${monthTable}
      ${entryTables}
      <div class="footer">Spend = card transactions + non-cancelled orders recorded in Booker, by transaction/order date. Generated ${format(new Date(), 'dd MMM yyyy, hh:mm a')}.</div>
    </section>`;
};

export const buildSpendReportHtml = (report, people) => {
  const itemsByCard = new Map();
  for (const it of report.items || []) {
    const k = String(it.card_id);
    if (!itemsByCard.has(k)) itemsByCard.set(k, []);
    itemsByCard.get(k).push(it);
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>${escapeHtml(fileStem(report, people))}</title><style>${STYLES}</style></head>
    <body>${people.map(p => personHtml(report, p, itemsByCard)).join('')}</body></html>`;
  return html;
};

export const printSpendReport = (report, people) => printHtmlInIframe(buildSpendReportHtml(report, people));

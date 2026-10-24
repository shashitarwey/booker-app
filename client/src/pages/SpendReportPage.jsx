import { useState, useEffect, useMemo, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { FileDown, FileSpreadsheet, ListChecks, AlertTriangle, CalendarRange, Table2 } from 'lucide-react';
import { getSpendReport } from '../api';
import { RELATIONS } from '../constants';
import { fmtCurrency } from '../utils/formatters';
import PersonAvatar from '../components/PersonAvatar';
import {
  monthLabel, cardTypeLabel,
  downloadSpendSummaryCSV, downloadSpendEntriesCSV, printSpendReport,
} from '../utils/spendReportExport';

// Indian financial years, newest first: { label: 'FY 2026-27', from: '2026-04-01', to: '2027-03-31' }
const financialYears = (count = 5) => {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => {
    const y = start - i;
    return { label: `FY ${y}-${String(y + 1).slice(2)}`, from: `${y}-04-01`, to: `${y + 1}-03-31`, current: i === 0 };
  });
};

const FYS = financialYears();

function CardRow({ c }) {
  const isAddon = c.card_type === 'addon';
  return (
    <tr>
      <td>
        <div className="font-medium">•••• {c.last_four_digit}</div>
        <div className="report-muted">{c.card_network}{c.name_on_card ? ` · ${c.name_on_card}` : ''}</div>
      </td>
      <td>
        <span className={`report-type ${isAddon ? 'is-addon' : ''}`}>{isAddon ? 'Add-on' : 'Primary'}</span>
        {isAddon && c.primary_card && <div className="report-muted">{cardTypeLabel(c).replace('Add-on of ', 'of ')}</div>}
        {!isAddon && c.addons?.length > 0 && (
          <div className="report-muted">
            + {c.addons.length} add-on{c.addons.length > 1 ? 's' : ''}: {c.addons.map(a => `••${a.last_four_digit} (${a.holder_name})`).join(', ')}
          </div>
        )}
      </td>
      <td className="text-right">{fmtCurrency(c.txn_total)}<div className="report-muted">{c.txn_count} {c.txn_count === 1 ? 'entry' : 'entries'}</div></td>
      <td className="text-right">{fmtCurrency(c.order_total)}<div className="report-muted">{c.order_count} {c.order_count === 1 ? 'order' : 'orders'}</div></td>
      <td className="text-right font-bold">{fmtCurrency(c.total_spend)}</td>
      <td className="text-right">{c.billed_total != null ? fmtCurrency(c.billed_total) : <span className="report-muted">billed to primary</span>}</td>
    </tr>
  );
}

function PersonReport({ p, months, monthWise, onPdf, onCsv, onEntries, busy }) {
  const relation = RELATIONS[p.relation];
  const allCards = p.banks.flatMap(b => b.cards);
  return (
    <section className="report-person">
      <header className="report-person-head">
        <div className="report-person-id">
          <PersonAvatar person={p} size={44} />
          <div>
            <div className="report-person-name">{p.name}{p.relation === 'self' ? ' (You)' : ''}</div>
            <div className="report-muted"><span className="relation-dot" style={{ background: relation?.color, display: 'inline-block', marginRight: 6 }} />{relation?.label} · {p.card_count} card{p.card_count !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div className="report-person-totals">
          <div>
            <div className="report-label">Total spend</div>
            <div className="report-big">{fmtCurrency(p.total_spend)}</div>
          </div>
          <div>
            <div className="report-label" title="Primary cards incl. their add-ons — what banks bill to this person">Billed to {p.name.split(' ')[0]}</div>
            <div className="report-big">{fmtCurrency(p.billed_total)}</div>
          </div>
        </div>
        <div className="report-person-actions">
          <button className="btn btn-secondary btn-sm" onClick={onPdf} disabled={busy}><FileDown size={14} /> PDF</button>
          <button className="btn btn-secondary btn-sm" onClick={onCsv} disabled={busy}><FileSpreadsheet size={14} /> CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={onEntries} disabled={busy}><ListChecks size={14} /> Entries</button>
        </div>
      </header>

      {p.banks.length === 0 ? (
        <div className="report-empty">No cards for {p.name}.</div>
      ) : monthWise ? (
        <div className="table-responsive-wrapper">
          <table className="data-table report-months">
            <thead>
              <tr>
                <th>Card</th>
                {months.map(m => <th key={m} className="text-right">{monthLabel(m)}</th>)}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {allCards.map(c => (
                <tr key={c._id}>
                  <td className="font-medium">{c.bank_name.replace(/ Bank$/, '')} ••{c.last_four_digit}{c.card_type === 'addon' ? ' (Add-on)' : ''}</td>
                  {c.monthly.map((v, i) => <td key={i} className="text-right">{v ? fmtCurrency(v) : <span className="report-muted">—</span>}</td>)}
                  <td className="text-right font-bold">{fmtCurrency(c.total_spend)}</td>
                </tr>
              ))}
              <tr className="report-total-row">
                <td>Total</td>
                {p.monthly.map((v, i) => <td key={i} className="text-right">{v ? fmtCurrency(v) : '—'}</td>)}
                <td className="text-right">{fmtCurrency(p.total_spend)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <>
        {/* Phones: compact blocks instead of the wide table */}
        <div className="report-mobile">
          {p.banks.map(b => (
            <div key={b.bank_name} className="report-m-bank">
              <div className="report-m-bank-head">
                <span className="report-bank-name">{b.bank_name}</span>
                <span className="font-bold">{fmtCurrency(b.total_spend)}</span>
              </div>
              {b.sft_reportable && (
                <div className="report-sft" style={{ margin: '0 0 8px' }}><AlertTriangle size={12} /> ₹10L+ billed — SFT reportable</div>
              )}
              {b.cards.map(c => (
                <div key={c._id} className="report-m-card">
                  <div className="report-m-card-row">
                    <span className="font-medium">•••• {c.last_four_digit}</span>
                    <span className={`report-type ${c.card_type === 'addon' ? 'is-addon' : ''}`}>{c.card_type === 'addon' ? 'Add-on' : 'Primary'}</span>
                    <span className="report-m-total">{fmtCurrency(c.total_spend)}</span>
                  </div>
                  <div className="report-muted">
                    Txns {fmtCurrency(c.txn_total)} · Orders {fmtCurrency(c.order_total)}
                    {c.card_type !== 'addon' && c.addons?.length > 0 && ` · Billed ${fmtCurrency(c.billed_total)}`}
                  </div>
                  {c.card_type === 'addon' && c.primary_card && <div className="report-muted">{cardTypeLabel(c)}</div>}
                  {c.card_type !== 'addon' && c.addons?.length > 0 && (
                    <div className="report-muted">Add-ons: {c.addons.map(a => `••${a.last_four_digit} (${a.holder_name})`).join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="table-responsive-wrapper report-table-wrap">
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Type</th>
                <th className="text-right">Card Txns</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Total Spend</th>
                <th className="text-right">Billed incl. Add-ons</th>
              </tr>
            </thead>
            <tbody>
              {p.banks.map(b => (
                <Fragment key={b.bank_name}>
                  <tr className="report-bank-row">
                    <td colSpan={4}>
                      <span className="report-bank-name">{b.bank_name}</span>
                      {b.sft_reportable && (
                        <span className="report-sft" title="Credit card bills of ₹10 lakh or more in a financial year with one bank are reported by the bank to the Income Tax department (SFT).">
                          <AlertTriangle size={12} /> ₹10L+ billed — SFT reportable
                        </span>
                      )}
                    </td>
                    <td className="text-right font-bold">{fmtCurrency(b.total_spend)}</td>
                    <td className="text-right font-bold">{fmtCurrency(b.billed_total)}</td>
                  </tr>
                  {b.cards.map(c => <CardRow key={c._id} c={c} />)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  );
}

export default function SpendReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const personParam = searchParams.get('person') || '';
  const fyParam = searchParams.get('fy');
  const fy = FYS.find(f => f.from === fyParam) || FYS[0];

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [monthWise, setMonthWise] = useState(false);

  useEffect(() => {
    setLoading(true);
    getSpendReport({ from_date: fy.from, to_date: fy.to })
      .then(setReport)
      .catch(() => toast.error('Failed to load spend report'))
      .finally(() => setLoading(false));
  }, [fy.from, fy.to]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const allPeople = useMemo(() => report?.people || [], [report]);
  const visible = useMemo(
    () => (personParam ? allPeople.filter(p => p._id === personParam) : allPeople),
    [allPeople, personParam]
  );
  const total = visible.reduce((s, p) => s + p.total_spend, 0);
  const sftCount = visible.reduce((n, p) => n + p.banks.filter(b => b.sft_reportable).length, 0);

  // Entries are only fetched on export (can be large)
  const withItems = async (people) => {
    const params = { from_date: fy.from, to_date: fy.to, include_items: true };
    if (people.length === 1) params.person_id = people[0]._id;
    return getSpendReport(params);
  };

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); }
    catch { toast.error('Export failed'); }
    finally { setBusy(false); }
  };

  const exportPdf = (people) => run(async () => {
    const full = await withItems(people);
    const ids = new Set(people.map(p => p._id));
    const res = printSpendReport(full, full.people.filter(p => ids.has(p._id)));
    if (res && res.ok === false) toast.error(res.error || 'Could not open print dialog');
  });
  const exportCsv = (people) => run(async () => downloadSpendSummaryCSV(report, people));
  const exportEntries = (people) => run(async () => {
    const full = await withItems(people);
    const ids = new Set(people.map(p => p._id));
    downloadSpendEntriesCSV(full, full.people.filter(p => ids.has(p._id)));
  });

  return (
    <main className="dash">
      <div className="dash-header">
        <div>
          <p className="dash-eyebrow">For ITR filing</p>
          <h1 className="dash-title">Card Spend Report</h1>
          <p className="dash-section-sub">Spends on your and your family's cards — by person, bank and card.</p>
        </div>
        <div className="dash-header-actions">
          <button className={`btn btn-sm ${monthWise ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMonthWise(v => !v)}>
            <Table2 size={14} /> Month-wise
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportCsv(visible)} disabled={busy || !visible.length}>
            <FileSpreadsheet size={14} /> Summary CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => exportPdf(visible)} disabled={busy || !visible.length}>
            <FileDown size={14} /> {busy ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="report-filters">
        <div className="tab-strip" style={{ marginBottom: 0 }}>
          <CalendarRange size={16} className="report-filter-icon" />
          {FYS.map(f => (
            <button key={f.from} className={`tab-btn ${f.from === fy.from ? 'is-active' : ''}`}
              onClick={() => setParam('fy', f.current ? '' : f.from)}>
              {f.label}{f.current ? ' (current)' : ''}
            </button>
          ))}
        </div>
        <div className="tab-strip" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${!personParam ? 'is-active' : ''}`} onClick={() => setParam('person', '')}>
            Everyone <span className="tab-btn-count">{allPeople.length}</span>
          </button>
          {allPeople.map(p => (
            <button key={p._id} className={`tab-btn ${personParam === p._id ? 'is-active' : ''}`} onClick={() => setParam('person', p._id)}>
              <span className="relation-dot" style={{ background: RELATIONS[p.relation]?.color }} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-row report-kpis">
        <div className="kpi kpi-violet">
          <div className="kpi-label">Total card spend · {fy.label}</div>
          <div className="kpi-value">{loading ? '—' : fmtCurrency(total)}</div>
          <div className="kpi-sub">{visible.length} {visible.length === 1 ? 'person' : 'people'} · {visible.reduce((n, p) => n + p.card_count, 0)} cards</div>
        </div>
        <div className={`kpi ${sftCount ? 'kpi-amber' : 'kpi-teal'}`}>
          <div className="kpi-label">Banks crossing ₹10 lakh (SFT)</div>
          <div className="kpi-value">{loading ? '—' : sftCount}</div>
          <div className="kpi-sub">Based on billed amount per person per bank</div>
        </div>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: 260, borderRadius: 'var(--radius)' }} />
      ) : visible.length === 0 ? (
        <div className="dash-empty"><div className="dash-empty-title">Nothing to show</div></div>
      ) : (
        visible.map(p => (
          <PersonReport
            key={p._id}
            p={p}
            months={report.months}
            monthWise={monthWise}
            busy={busy}
            onPdf={() => exportPdf([p])}
            onCsv={() => exportCsv([p])}
            onEntries={() => exportEntries([p])}
          />
        ))
      )}

      <p className="report-footnote">
        Spend = card transactions + non-cancelled orders, counted on the transaction / order date.
        "Billed" adds add-on card spends to the primary card, since the bank bills add-ons to the primary holder.
        SFT flag is an estimate from the spends recorded here — cross-check with your bank statements and the Annual Information Statement (AIS) before filing.
      </p>
    </main>
  );
}

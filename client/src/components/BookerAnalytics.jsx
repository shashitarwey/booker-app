import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Users, Scale, ArrowDownLeft, ArrowUpRight, PackageOpen, Wallet, PieChart as PieIcon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { fmtCurrency, fmtSignedCurrency, profitColor } from '../utils/formatters';
import { pctLabel } from '../utils/profit';

// Two-series identity palette: own & family vs bookers. Validated with the
// dataviz validate_palette script per theme (lightness band, CVD ΔE ≥ 20,
// contrast ≥ 3:1 on the chart surface). Recharts writes fills as SVG
// attributes, where CSS vars aren't reliable — so pick the hex per theme.
const SOURCE_COLORS = {
  dark:  { own: '#7c6cff', bookers: '#0fa596' },
  light: { own: '#5b4be6', bookers: '#0d9488' },
};

const kFmt = (v) => (Math.abs(v) >= 1000 ? `₹${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `₹${Math.round(v)}`);

function RowTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="analytics-tooltip">
      <p className="analytics-tooltip-label">{r.name || r.label}{r.holder_name ? ` · ${r.holder_name}` : ''}</p>
      <p>Orders: {r.order_count}</p>
      <p>Order amount: {fmtCurrency(r.order_amount)}</p>
      <p>My profit: {fmtSignedCurrency(r.profit)} {pctLabel(r.profit, r.order_amount)}</p>
      {r.relation === 'friend' && r.friend_earning !== undefined && (
        <p>Their profit: {fmtSignedCurrency(r.friend_earning)} {pctLabel(r.friend_earning, r.order_amount)}</p>
      )}
    </div>
  );
}

function Legend2({ colors }) {
  return (
    <div className="viz-legend">
      <span><i style={{ background: colors.own }} /> Own &amp; Family</span>
      <span><i style={{ background: colors.bookers }} /> Bookers</span>
    </div>
  );
}

/**
 * Booker-centric analytics: cash position, own-vs-booker profit split and
 * profit by booker (+ table). Data from /analytics/profit.
 */
export default function BookerAnalytics({ data }) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const colors = SOURCE_COLORS[theme === 'light' ? 'light' : 'dark'];
  const { byBooker = [], bySource, position } = data || {};
  const colorFor = (relation) => (relation === 'friend' ? colors.bookers : colors.own);
  const bookers = byBooker.filter(b => b.relation === 'friend');

  const own = bySource?.own || { profit: 0, order_amount: 0, order_count: 0 };
  const bk = bySource?.bookers || { profit: 0, order_amount: 0, order_count: 0 };
  const splitTotal = Math.max(0, own.profit) + Math.max(0, bk.profit);
  const ownShare = splitTotal > 0 ? (Math.max(0, own.profit) / splitTotal) * 100 : 0;

  // Direct label: amount + margin, e.g. "₹4,900 (7.88%)"
  const withLabel = (rows) => rows.map(r => ({ ...r, barLabel: `${fmtSignedCurrency(r.profit)} ${pctLabel(r.profit, r.order_amount)}` }));
  const bookerRows = withLabel(byBooker);
  // Phones: shorter axis labels and margins so bars keep usable length
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const labelMargin = narrow ? 96 : 120;
  const maxY = narrow ? 96 : 220;

  const yWidth = (rows, key) => Math.min(160, Math.max(80, rows.reduce((m, r) => Math.max(m, (r[key] || '').length), 0) * 7 + 12));

  return (
    <>
      {/* Cash position — current balances, not tied to the date filter */}
      {position && (
        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title"><Scale size={16} /> Cash Position <span className="viz-note">all-time balances</span></h3>
          <div className="position-grid">
            <div className="position-cell">
              <span><ArrowDownLeft size={13} /> Receivable from buyers</span>
              <strong>{fmtCurrency(position.receivable)}</strong>
              <em>Delivered returns − payments received</em>
            </div>
            <div className="position-cell">
              <span><ArrowUpRight size={13} /> Payable to bookers</span>
              <strong>{fmtCurrency(position.payable)}</strong>
              <em>{position.advance_with_bookers > 0 ? `Owed only · + ${fmtCurrency(position.advance_with_bookers)} advance with bookers` : 'Khata balance across bookers'}</em>
            </div>
            <div className="position-cell">
              <span><PackageOpen size={13} /> In pending orders</span>
              <strong>{fmtCurrency(position.pending_order_amount)}</strong>
              <em>{position.pending_orders} order{position.pending_orders !== 1 ? 's' : ''} · expected back {fmtCurrency(position.pending_return_amount)}</em>
            </div>
            <div className="position-cell">
              <span><Wallet size={13} /> Net position</span>
              <strong style={{ color: profitColor(position.net) }}>{fmtSignedCurrency(position.net)}</strong>
              <em>Receivable − payable</em>
            </div>
          </div>
        </div>
      )}

      <div className="analytics-charts-row">
        {/* Own & family vs bookers — two-part split */}
        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title"><PieIcon size={16} /> Profit: Own &amp; Family vs Bookers</h3>
          {splitTotal > 0 ? (
            <div className="split-bar" role="img" aria-label={`Own and family ${ownShare.toFixed(0)}%, bookers ${(100 - ownShare).toFixed(0)}%`}>
              {ownShare > 0 && <div style={{ width: `${ownShare}%`, background: colors.own }} title={`Own & Family ${ownShare.toFixed(1)}%`} />}
              {ownShare < 100 && <div style={{ width: `${100 - ownShare}%`, background: colors.bookers }} title={`Bookers ${(100 - ownShare).toFixed(1)}%`} />}
            </div>
          ) : <div className="viz-empty">No profit in this period yet.</div>}
          <div className="split-legend">
            {[['Own & Family', own, colors.own, ownShare], ['Bookers', bk, colors.bookers, splitTotal > 0 ? 100 - ownShare : 0]].map(([label, s, c, share]) => (
              <div key={label} className="split-legend-item">
                <div className="split-legend-head"><i style={{ background: c }} /> {label} <span>{share.toFixed(0)}% of profit</span></div>
                <div className="split-legend-value" style={{ color: profitColor(s.profit) }}>
                  {fmtSignedCurrency(s.profit)} <span className="profit-pct">{pctLabel(s.profit, s.order_amount)}</span>
                </div>
                <div className="split-legend-sub">{s.order_count} orders · {fmtCurrency(s.order_amount)} ordered</div>
              </div>
            ))}
          </div>
        </div>

        {/* Profit by booker (all card holders) */}
        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title"><Users size={16} /> Profit by Booker</h3>
          <Legend2 colors={colors} />
          {byBooker.length === 0 ? <div className="viz-empty">No delivered orders in this period.</div> : (
            <ResponsiveContainer width="100%" height={Math.max(180, byBooker.length * 44)}>
              <BarChart data={bookerRows} layout="vertical" margin={{ top: 5, right: labelMargin, left: 0, bottom: 5 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={kFmt} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={Math.min(maxY, yWidth(byBooker, 'name'))} tick={{ fontSize: 12, fill: 'var(--text)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<RowTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
                <Bar dataKey="profit" radius={[0, 4, 4, 0]} maxBarSize={22} onClick={(r) => r?.person_id && navigate(`/people/${r.person_id}`)} style={{ cursor: 'pointer' }}>
                  {byBooker.map(r => <Cell key={String(r.person_id)} fill={colorFor(r.relation)} />)}
                  <LabelList dataKey="barLabel" position="right" style={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Booker performance table — friends only, several measures side by side */}
      {bookers.length > 0 && (
        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title"><Users size={16} /> Booker Performance</h3>
          {/* Phones: stacked rows instead of the 6-column table */}
          <div className="booker-perf-list">
            {bookers.map(b => (
              <div key={String(b.person_id)} className="booker-perf-item" onClick={() => navigate(`/people/${b.person_id}?tab=khata`)}>
                <div className="booker-perf-head">
                  <strong>{b.name}</strong>
                  <span>{b.order_count} order{b.order_count !== 1 ? 's' : ''} · {fmtCurrency(b.order_amount)}</span>
                </div>
                <div className="booker-perf-grid">
                  <div><span>My Profit</span><b style={{ color: profitColor(b.profit) }}>{fmtSignedCurrency(b.profit)} <i className="profit-pct">{pctLabel(b.profit, b.order_amount)}</i></b></div>
                  <div><span>Their Profit</span><b>{fmtSignedCurrency(b.friend_earning)} <i className="profit-pct">{pctLabel(b.friend_earning, b.order_amount)}</i></b></div>
                  <div><span>Dues</span><b style={{ color: b.pending_dues > 0 ? 'var(--ink-amber)' : undefined }}>{fmtCurrency(b.pending_dues)}</b></div>
                </div>
              </div>
            ))}
          </div>
          <div className="table-responsive-wrapper booker-perf-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Booker</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Order Amount</th>
                  <th className="text-right">My Profit</th>
                  <th className="text-right">Their Profit</th>
                  <th className="text-right">Pending Dues</th>
                </tr>
              </thead>
              <tbody>
                {bookers.map(b => (
                  <tr key={String(b.person_id)} style={{ cursor: 'pointer' }} onClick={() => navigate(`/people/${b.person_id}?tab=khata`)}>
                    <td className="font-semibold">{b.name}</td>
                    <td className="text-right">{b.order_count}</td>
                    <td className="text-right">{fmtCurrency(b.order_amount)}</td>
                    <td className="text-right" style={{ color: profitColor(b.profit) }}>
                      {fmtSignedCurrency(b.profit)} <span className="profit-pct">{pctLabel(b.profit, b.order_amount)}</span>
                    </td>
                    <td className="text-right">
                      {fmtSignedCurrency(b.friend_earning)} <span className="profit-pct">{pctLabel(b.friend_earning, b.order_amount)}</span>
                    </td>
                    <td className="text-right" style={{ color: b.pending_dues > 0 ? 'var(--ink-amber)' : undefined }}>{fmtCurrency(b.pending_dues)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </>
  );
}

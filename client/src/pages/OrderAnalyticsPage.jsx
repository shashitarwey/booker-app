import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, TrendingUp, Users, ShoppingBag, BarChart3, Percent, CalendarDays, Sparkles, Send, RotateCcw, User } from 'lucide-react';
import { getProfitAnalytics, askAI } from '../api';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import DateRangeDropdown from '../common/DateRangeDropdown';
import BookerAnalytics from '../components/BookerAnalytics';
import { pickTruthy, fmtCurrency, fmtSignedCurrency, profitColor } from '../utils/formatters';
import { pctLabel } from '../utils/profit';
import { useTheme } from '../context/ThemeContext';

const kFmt = (v) => (Math.abs(v) >= 1000 ? `₹${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `₹${Math.round(v)}`);

// Monthly bars show profit; the tooltip carries the amounts behind it.
const MonthTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="analytics-tooltip">
      <p className="analytics-tooltip-label">{label}</p>
      <p>Profit: {fmtSignedCurrency(m.profit)} {pctLabel(m.profit, m.order_amount)}</p>
      <p>Orders: {m.order_count}</p>
      <p>Ordered: {fmtCurrency(m.order_amount)}</p>
      <p>Returned: {fmtCurrency(m.return_amount)}</p>
    </div>
  );
};

const RowTooltip = ({ active, payload, nameKey, showShare }) => {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="analytics-tooltip">
      <p className="analytics-tooltip-label">{r[nameKey]}{r.seller_city ? ` · ${r.seller_city}` : ''}</p>
      <p>Profit: {fmtSignedCurrency(r.profit)} {pctLabel(r.profit, r.order_amount)}</p>
      <p>Orders: {r.order_count} · Ordered {fmtCurrency(r.order_amount)}</p>
      {showShare && <p>Share of order volume: {r.share.toFixed(1)}%</p>}
    </div>
  );
};

const SUGGESTED_QUESTIONS = [
  'Which buyer owes me the most right now?',
  'Top 5 most profitable items this FY',
  'Compare profit between Amazon and Flipkart',
  'Which card earned the most cashback?',
];

export default function OrderAnalyticsPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('');

  // AI chat — multi-turn so follow-ups like "and what about last month?" work.
  // History is session-only (resets on page reload / Reset button).
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessages, setAiMessages] = useState([]); // [{ role: 'user'|'model', content }]
  const chatEndRef = useRef(null);

  const handleAsk = async (question) => {
    const q = (question ?? aiInput).trim();
    if (!q || aiBusy) return;
    setAiInput('');
    const next = [...aiMessages, { role: 'user', content: q }];
    setAiMessages(next);
    setAiBusy(true);
    try {
      const { answer } = await askAI(q, aiMessages);
      setAiMessages([...next, { role: 'model', content: answer }]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to get a response from the AI assistant';
      setAiMessages([...next, { role: 'model', content: msg, error: true }]);
      toast.error(msg);
    } finally {
      setAiBusy(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
  };

  const resetChat = () => {
    setAiMessages([]);
    setAiInput('');
  };

  const fetchAnalytics = useCallback(async (from, to) => {
    try {
      const params = pickTruthy({ from_date: from, to_date: to });
      const res = await getProfitAnalytics(params);
      setData(res);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics('', '');
  }, [fetchAnalytics]);

  const handleDateChange = (from, to, preset) => {
    setDateFrom(from || '');
    setDateTo(to || '');
    setDatePreset(preset || '');
    setLoading(true);
    fetchAnalytics(from || '', to || '');
  };

  if (loading && !data) {
    return (
      <>
        <div className="page-hero">
          <div className="page-hero-inner">
            <div className="page-hero-left">
              <button className="btn-back-circle" onClick={() => navigate(-1)} data-tooltip="Back">
                <ChevronLeft size={22} />
              </button>
              <div className="page-hero-title-group">
                <h1 className="page-hero-title">Order Profit Analytics</h1>
              </div>
            </div>
          </div>
        </div>
        <div className="page-content">
          <div className="analytics-loading">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="shimmer shimmer-card" style={{ height: 120 }} />
            ))}
          </div>
        </div>
      </>
    );
  }

  const noData = !data || !data.totals || data.totals.order_count === 0;
  const { monthly = [], bySeller = [], byEcommSite = [], totals = {}, fy = {} } = data || {};

  const margin = totals.order_amount > 0 ? (totals.profit / totals.order_amount) * 100 : 0;
  const totalOrdered = byEcommSite.reduce((sum, p) => sum + p.order_amount, 0);
  const withLabel = (rows) => rows.map(r => ({ ...r, barLabel: `${fmtSignedCurrency(r.profit)} ${pctLabel(r.profit, r.order_amount)}` }));
  const buyerRows = withLabel([...bySeller].sort((a, b) => b.profit - a.profit));
  const platformRows = withLabel([...byEcommSite].sort((a, b) => b.profit - a.profit))
    .map(r => ({ ...r, share: totalOrdered > 0 ? (r.order_amount / totalOrdered) * 100 : 0 }));
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const labelMargin = narrow ? 96 : 120;
  const yWidth = (rows, key) => Math.min(narrow ? 96 : 170, Math.max(70, rows.reduce((m, r) => Math.max(m, (r[key] || '').length), 0) * 7 + 12));
  const seriesColor = theme === 'light' ? '#5b4be6' : '#7c6cff';

  return (
    <>
      {/* Page Hero Header */}
      <div className="page-hero">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button className="btn-back-circle" onClick={() => navigate(-1)} data-tooltip="Back">
              <ChevronLeft size={22} />
            </button>
            <div className="page-hero-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h1 className="page-hero-title">Order Profit Analytics</h1>
                {!noData && (
                  <span className={`profit-badge ${totals.profit >= 0 ? 'profit-badge-positive' : 'profit-badge-negative'}`}>
                    Net: {fmtCurrency(totals.profit)}
                  </span>
                )}
              </div>
              {!noData && (
                <span className="page-hero-subtitle">{totals.order_count} delivered order{totals.order_count !== 1 ? 's' : ''} analysed</span>
              )}
            </div>
          </div>
          <div className="page-hero-actions">
            <DateRangeDropdown
              dateFrom={dateFrom}
              dateTo={dateTo}
              activePreset={datePreset}
              onChange={handleDateChange}
            />
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* AI Assistant — multi-turn chat answered against the user's real data
            on the server. History is session-only. */}
        <div className="ai-panel">
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <Sparkles size={16} />
              <span>Ask your data</span>
              <span className="ai-panel-subtitle">Powered by Gemini · answers from your live orders, sellers & cards</span>
            </div>
            {aiMessages.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={resetChat} disabled={aiBusy}>
                <RotateCcw size={13} /> Reset
              </button>
            )}
          </div>

          {aiMessages.length === 0 && (
            <div className="ai-suggestions">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  className="ai-suggestion-chip"
                  onClick={() => handleAsk(q)}
                  disabled={aiBusy}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {aiMessages.length > 0 && (
            <div className="ai-messages">
              {aiMessages.map((m, i) => (
                <div key={i} className={`ai-msg ai-msg-${m.role}${m.error ? ' ai-msg-error' : ''}`}>
                  <div className="ai-msg-avatar">
                    {m.role === 'user' ? <User size={14} /> : <Sparkles size={14} />}
                  </div>
                  <div className="ai-msg-content">{m.content}</div>
                </div>
              ))}
              {aiBusy && (
                <div className="ai-msg ai-msg-model">
                  <div className="ai-msg-avatar"><Sparkles size={14} /></div>
                  <div className="ai-msg-content ai-msg-thinking">
                    <span className="ai-dot" /><span className="ai-dot" /><span className="ai-dot" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          <form
            className="ai-input-row"
            onSubmit={e => { e.preventDefault(); handleAsk(); }}
          >
            <input
              type="text"
              className="ai-input"
              placeholder="Ask anything about your orders, sellers, cashback…"
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              disabled={aiBusy}
              maxLength={1000}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={aiBusy || !aiInput.trim()}>
              <Send size={14} /> {aiBusy ? 'Thinking…' : 'Ask'}
            </button>
          </form>
        </div>

        {noData ? (
          <div className="empty-state-card">
            <div className="empty-icon empty-icon-orders">
              <BarChart3 size={32} />
            </div>
            <div className="empty-title">No analytics data yet</div>
            <div className="empty-sub">
              {dateFrom || dateTo
                ? 'No delivered orders in the selected range. Try a different date range.'
                : 'Analytics will appear once you have orders marked as delivered.'}
            </div>
          </div>
        ) : (
          <>
            {/* Analytics-only tiles. Order/return totals live on the dashboard;
                net profit is in the header badge. */}
            <div className="stats-row">
              {[
                { icon: ShoppingBag, label: 'Delivered Orders', value: totals.order_count },
                { icon: Percent, label: 'Profit Margin', value: `${margin.toFixed(2)}%`, color: profitColor(totals.profit) },
                { icon: TrendingUp, label: 'Avg Profit / Order', value: fmtCurrency(totals.order_count > 0 ? totals.profit / totals.order_count : 0), color: profitColor(totals.profit) },
                { icon: CalendarDays, label: 'Per Day Profit (FY)', value: fmtCurrency(fy.per_day_profit), color: profitColor(fy.per_day_profit || 0), tooltip: `FY started ${fy.start} · ${fy.days} day${fy.days !== 1 ? 's' : ''} elapsed` },
              ].map(t => (
                <div key={t.label} className="stat-card" data-tooltip={t.tooltip}>
                  <div className="stat-card-header">
                    <div className="stat-card-icon analytics-stat-icon"><t.icon size={16} /></div>
                    <span className="stat-card-label">{t.label}</span>
                  </div>
                  <div className="stat-card-value" style={t.color ? { color: t.color } : undefined}>{t.value}</div>
                </div>
              ))}
            </div>

            {/* One measure, one axis: profit per month. Amounts are in the tooltip. */}
            {monthly.length > 0 && (
              <div className="analytics-chart-card">
                <h3 className="analytics-chart-title"><TrendingUp size={16} /> Monthly Profit Trend</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthly} margin={{ top: 18, right: 10, left: -6, bottom: 0 }} barCategoryGap="28%">
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={kFmt} axisLine={false} tickLine={false} width={56} />
                    <Tooltip content={<MonthTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
                    <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={44}>
                      {monthly.map((m, i) => <Cell key={i} fill={m.profit >= 0 ? seriesColor : 'var(--danger)'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Bookers / own cards / cash position */}
            <BookerAnalytics data={data} />

            <div className="analytics-charts-row">
              {/* Profit by buyer — one series, one colour; label = ₹ (margin) */}
              {buyerRows.length > 0 && (
                <div className="analytics-chart-card">
                  <h3 className="analytics-chart-title"><Users size={16} /> Profit by Buyer</h3>
                  <ResponsiveContainer width="100%" height={Math.max(180, buyerRows.length * 40)}>
                    <BarChart data={buyerRows} layout="vertical" margin={{ top: 5, right: labelMargin, left: 0, bottom: 5 }} barCategoryGap={8}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={kFmt} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="seller_name" width={yWidth(buyerRows, 'seller_name')} tick={{ fontSize: 12, fill: 'var(--text)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<RowTooltip nameKey="seller_name" />} cursor={{ fill: 'var(--accent-soft)' }} />
                      <Bar dataKey="profit" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {buyerRows.map((r, i) => <Cell key={i} fill={r.profit >= 0 ? seriesColor : 'var(--danger)'} />)}
                        <LabelList dataKey="barLabel" position="right" style={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* By platform — replaces the separate volume donut + profit bars */}
              {platformRows.length > 0 && (
                <div className="analytics-chart-card">
                  <h3 className="analytics-chart-title"><ShoppingBag size={16} /> By Platform</h3>
                  <ResponsiveContainer width="100%" height={Math.max(180, platformRows.length * 40)}>
                    <BarChart data={platformRows} layout="vertical" margin={{ top: 5, right: labelMargin, left: 0, bottom: 5 }} barCategoryGap={8}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={kFmt} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="ecomm_site" width={yWidth(platformRows, 'ecomm_site')} tick={{ fontSize: 12, fill: 'var(--text)' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<RowTooltip nameKey="ecomm_site" showShare />} cursor={{ fill: 'var(--accent-soft)' }} />
                      <Bar dataKey="profit" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {platformRows.map((r, i) => <Cell key={i} fill={r.profit >= 0 ? seriesColor : 'var(--danger)'} />)}
                        <LabelList dataKey="barLabel" position="right" style={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

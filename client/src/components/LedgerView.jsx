import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { ArrowUpRight, ArrowDownLeft, Hourglass } from 'lucide-react';
import { fmtCurrency, fmtDisplay } from '../utils/formatters';

const PAGE_LIMIT = 30;

/**
 * Summary strip above a ledger: [{ icon, label, value, tone }] where tone is
 * 'due' | 'advance' | undefined (colours the value).
 */
export function LedgerSummary({ cells }) {
  return (
    <div className="khata-summary" style={{ '--cols': cells.length }}>
      {cells.map(c => (
        <div key={c.label} className={`khata-sum-cell ${c.tone ? `khata-sum-balance is-${c.tone}` : ''}`}>
          <span>{c.icon} {c.label}</span>
          <strong>{c.value}</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * One ledger UI for buyers, khata customers and bookers.
 *
 * Data comes newest-first from the server with `runningBalance` already set.
 *  - fetchPage(page, limit) → { items, page: { has_next }, ... }
 *  - describe(item) → {
 *      key, date, direction: 'owed' (left) | 'paid' (right), label?, title,
 *      subtitle (' · '-separated → chips),
 *      extra?, counted (false = struck through, not in balance), pending?,
 *      actions?: [{ icon, title, onClick }]
 *    }
 *  - balanceText(runningBalance) → label shown under the amount
 *  - onLoaded(firstPageResponse) — e.g. to read totals sent with page 1
 *  - reloadKey — change it to refetch from page 1 (balances shift after edits)
 */
export default function LedgerView({ fetchPage, describe, balanceText, onLoaded, reloadKey, empty, endLabel = '— End of ledger —' }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);
  const fetchRef = useRef(fetchPage);
  const loadedRef = useRef(onLoaded);
  fetchRef.current = fetchPage;
  loadedRef.current = onLoaded;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRef.current(1, PAGE_LIMIT)
      .then(res => {
        if (cancelled) return;
        setItems(res.items);
        setHasMore(res.page.has_next);
        setPage(1);
        loadedRef.current?.(res);
      })
      .catch(() => { if (!cancelled) toast.error('Failed to load entries'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchRef.current(page + 1, PAGE_LIMIT);
      setItems(prev => [...prev, ...res.items]);
      setHasMore(res.page.has_next);
      setPage(p => p + 1);
    } catch {
      toast.error('Failed to load more entries');
    } finally {
      setLoadingMore(false);
    }
  }, [page, hasMore, loadingMore]);

  // Infinite scroll: load the next page when the sentinel nears the viewport
  useEffect(() => {
    if (!hasMore || loading) return;
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMore(); }, { rootMargin: '200px' });
    const node = sentinelRef.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  if (loading) return <div className="shimmer" style={{ height: 220, borderRadius: 'var(--radius)' }} />;
  if (items.length === 0) return empty;

  // Group newest-first rows by day
  const groups = [];
  for (const it of items) {
    const row = describe(it);
    const key = String(row.date).slice(0, 10);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, rows: [] });
    groups[groups.length - 1].rows.push({ row, item: it });
  }

  // Timeline: owed / gave on the left, paid / got on the right
  return (
    <div className="ltl">
      {groups.map(g => (
        <div key={g.key} className="ltl-day">
          <div className="ltl-date"><span>{fmtDisplay(g.key)}</span></div>
          {g.rows.map(({ row, item }) => {
            const owed = row.direction === 'owed';
            const state = !row.counted && !row.pending ? 'is-cancelled' : row.pending ? 'is-pending' : '';
            const chips = String(row.subtitle || '').split(' · ').filter(Boolean);
            return (
              <div key={row.key} className={`ltl-entry ${owed ? 'is-left' : 'is-right'}`}>
                <div className={`ltl-card ${owed ? 'is-owed' : 'is-paid'} ${state}`}>
                  <div className="ltl-card-head">
                    <span className="ltl-type">
                      {row.pending ? <Hourglass size={12} /> : owed ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                      {row.pending ? 'Pending' : !row.counted ? 'Cancelled' : row.label || (owed ? 'Gave' : 'Got')}
                    </span>
                    {row.actions?.length > 0 && (
                      <span className="ltl-actions">
                        {row.actions.map(a => (
                          <button key={a.title} className="ltl-action" title={a.title} aria-label={a.title} onClick={a.onClick}>{a.icon}</button>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="ltl-amount">{fmtCurrency(item.amount)}</div>
                  <div className="ltl-title">{row.title}</div>
                  {chips.length > 0 && (
                    <div className="ltl-chips">{chips.map(c => <span key={c} className="ltl-chip">{c}</span>)}</div>
                  )}
                  {row.extra}
                  <div className="ltl-foot">
                    <span>Balance</span>
                    <strong>{balanceText(item.runningBalance)}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {loadingMore && <div className="ledger-loading-more">Loading more…</div>}
      {hasMore && !loadingMore && (
        <div ref={sentinelRef} style={{ textAlign: 'center', padding: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadMore}>Load more</button>
        </div>
      )}
      {!hasMore && items.length > PAGE_LIMIT && <div className="ledger-end-marker">{endLabel}</div>}
    </div>
  );
}

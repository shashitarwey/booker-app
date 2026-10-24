import { useState, useEffect, useCallback, useRef } from 'react';
import { getActivityLogs, getEntityHistory } from '../api';
import Pagination from '../common/Pagination';
import { PAGE_SIZE } from '../constants';
import { ChevronLeft, ChevronDown, ChevronUp, Plus, Pencil, Trash2, ShoppingBag, CreditCard, Users, Wallet, ArrowLeftRight, History, X as XIcon, BookOpen, Search } from 'lucide-react';
import SearchableDropdown from '../common/SearchableDropdown';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const ENTITY_CONFIG = {
  order:          { icon: ShoppingBag,   label: 'Order',          color: '#7c6cff' },
  seller:         { icon: Users,         label: 'Buyer',          color: '#d2a8ff' },
  seller_payment: { icon: Wallet,        label: 'Buyer Payment',  color: '#34d399' },
  transaction:    { icon: ArrowLeftRight, label: 'Transaction',    color: '#f0883e' },
  card:           { icon: CreditCard,    label: 'Card',           color: '#f87171' },
  customer:       { icon: BookOpen,      label: 'Khata Customer', color: '#f9e2af' },
  customer_entry: { icon: BookOpen,      label: 'Khata Entry',    color: '#a6e3a1' },
  person:         { icon: Users,         label: 'Person',         color: '#f9a875' },
  booker_payment: { icon: Wallet,        label: 'Booker Payment', color: '#fbbf24' },
};

const ACTION_CONFIG = {
  created: { icon: Plus,   bg: 'rgba(52,211,153,0.12)',  color: '#34d399', label: 'Created' },
  updated: { icon: Pencil, bg: 'rgba(124,108,255,0.12)', color: '#7c6cff', label: 'Updated' },
  deleted: { icon: Trash2, bg: 'rgba(248,113,113,0.12)',  color: '#f87171', label: 'Deleted' },
};

const ENTITY_FILTER_OPTIONS = [
  { key: '', label: 'All Activities' },
  { key: 'order', label: 'Orders' },
  { key: 'seller', label: 'Buyers' },
  { key: 'seller_payment', label: 'Payments' },
  { key: 'transaction', label: 'Transactions' },
  { key: 'card', label: 'Cards' },
  { key: 'customer', label: 'Khata Customers' },
  { key: 'customer_entry', label: 'Khata Entries' },
  { key: 'person', label: 'People' },
  { key: 'booker_payment', label: 'Booker Payments' },
];

const HIDDEN_KEYS = new Set(['_id', 'user_id', '__v', 'created_at', 'updated_at', 'createdAt', 'updatedAt']);

const KEY_LABELS = {
  model_ordered: 'Model', order_amount: 'Order Amt', return_amount: 'Return Amt',
  order_date: 'Order Date', delivered_date: 'Delivery Date', delivery_status: 'Status',
  ecomm_site: 'Source', id_used: 'Account', is_cleared: 'Cleared',
  card_id: 'Card', seller_id: 'Buyer', cashback: 'Cashback', variant: 'Variant',
  friend_amount: 'Return to Friend', advance_amount: 'Advance to Friend', coupon_cashback: 'Coupon Cashback', coupon_in_profit: 'Coupon in Profit', holder_id: 'Card Holder', card_type: 'Card Type', primary_card_id: 'Primary Card', relation: 'Relation',
  quantity: 'Qty', bank_name: 'Bank', card_network: 'Network',
  last_four_digit: 'Last 4', name_on_card: 'Name on Card',
  cashback_enabled: 'Cashback', cashback_percent: 'CB %', cashback_limit: 'CB Limit',
  cashback_period: 'CB Period', billing_date: 'Billing Date', due_date: 'Due Date',
  name: 'Name', city: 'City', phone: 'Phone',
  amount: 'Amount', payment_date: 'Date', notes: 'Notes', receipt_url: 'Receipt',
  description: 'Description', date: 'Date',
  customer_id: 'Customer', type: 'Type', entry_date: 'Entry Date',
};

function formatValue(key, val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object') return typeof val.name === 'string' ? val.name : JSON.stringify(val);
  if (key.includes('date') && typeof val === 'string' && val.includes('T')) {
    return new Date(val).toLocaleDateString('en-GB');
  }
  if ((key.includes('amount') || key === 'cashback' || key === 'amount') && typeof val === 'number') {
    return `₹${val.toLocaleString('en-IN')}`;
  }
  return String(val);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function LogItem({ log, isExpanded, onToggle, onViewHistory }) {
  const entity = ENTITY_CONFIG[log.entity] || {};
  const action = ACTION_CONFIG[log.action] || {};
  const EntityIcon = entity.icon || ShoppingBag;
  const ActionIcon = action.icon || Plus;
  const snap = log.snapshot;
  const changed = new Set(log.changed_fields || []);
  const isUpdate = log.action === 'updated';
  const snapKeys = snap
    ? Object.keys(snap).filter(k => !HIDDEN_KEYS.has(k) && (!isUpdate || changed.has(k)))
    : [];
  const hasDetails = snapKeys.length > 0;

  return (
    <div className={`al-item ${isExpanded ? 'al-item-expanded' : ''}`}>
      <div className="al-item-header" onClick={() => hasDetails && onToggle()}>
        <div className="al-item-left">
          <div className="al-icon" style={{ background: action.bg, color: action.color }}>
            <ActionIcon size={16} />
          </div>
          <div className="al-info">
            <div className="al-desc">{log.description}</div>
            <div className="al-tags">
              <span className="al-tag al-tag-entity" style={{ '--tag': entity.color }}>
                <EntityIcon size={12} /> {entity.label}
              </span>
              <span className="al-tag al-tag-action" style={{ '--tag': action.color }}>
                {action.label}
              </span>
              {isUpdate && changed.size > 0 && (
                <span className="al-tag al-tag-changed">
                  {changed.size} field{changed.size !== 1 ? 's' : ''} changed
                </span>
              )}
              <span className="al-tag al-tag-time">{formatDate(log.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="al-item-actions">
          {onViewHistory && (
            <button
              className="al-history-btn"
              title="View full history"
              onClick={e => { e.stopPropagation(); onViewHistory(log); }}
            >
              <History size={14} />
            </button>
          )}
          {hasDetails && (
            <button className="al-expand-btn">
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {isExpanded && hasDetails && (
        <div className="al-snapshot">
          {isUpdate ? (
            <div className="al-changed-list">
              {snapKeys.map(key => (
                <div key={key} className="al-changed-row">
                  <span className="al-changed-label">{KEY_LABELS[key] || key}</span>
                  <span className="al-changed-arrow">→</span>
                  <span className="al-changed-value">{formatValue(key, snap[key])}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="al-snapshot-grid">
              {snapKeys.map(key => (
                <div key={key} className="al-snapshot-field">
                  <span className="al-snapshot-key">{KEY_LABELS[key] || key}</span>
                  <span className="al-snapshot-val">{formatValue(key, snap[key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState(null);
  const [entityFilter, setEntityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [historyPanel, setHistoryPanel] = useState(null); // { entityId, entity, logs, title }
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchLogs = useCallback(async (p = page, ps = pageSize, entity = entityFilter, search = searchQuery) => {
    try {
      setLoading(true);
      const params = { page: p, limit: ps };
      if (entity) params.entity = entity;
      if (search) params.search = search;
      const { items, page: pageInfo } = await getActivityLogs(params);
      setLogs(items);
      setTotalLogs(pageInfo.item_total);
    } catch {
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, entityFilter, searchQuery]);

  useEffect(() => { fetchLogs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (value) => {
    setSearchQuery(value);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLogs(1, pageSize, entityFilter, value), 400);
  };

  const openEntityHistory = useCallback(async (entityId, entityType) => {
    try {
      setHistoryLoading(true);
      setHistoryExpanded(null);
      const entityCfg = ENTITY_CONFIG[entityType] || {};
      setHistoryPanel({ entityId, entity: entityType, logs: [], title: `${entityCfg.label || 'Entity'} History` });
      const historyLogs = await getEntityHistory(entityId);
      setHistoryPanel(prev => ({ ...prev, logs: historyLogs }));
    } catch {
      toast.error('Failed to load history');
      setHistoryPanel(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleViewHistory = (log) => openEntityHistory(log.entity_id, log.entity);

  // Auto-open history panel when navigated here with ?entityId=&entity= params
  // (e.g., from an entity's "View Activity" action menu item). Clears the URL
  // params after opening so a manual refresh later doesn't re-trigger.
  useEffect(() => {
    const entityId = searchParams.get('entityId');
    const entity = searchParams.get('entity');
    if (entityId && entity) {
      openEntityHistory(entityId, entity);
      const next = new URLSearchParams(searchParams);
      next.delete('entityId');
      next.delete('entity');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, openEntityHistory]);

  const totalPages = Math.ceil(totalLogs / pageSize);

  return (
    <>
      <div className="page-hero">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button className="btn-back-circle" onClick={() => navigate(-1)} data-tooltip="Back">
              <ChevronLeft size={22} />
            </button>
            <div className="page-hero-title-group">
              <h1 className="page-hero-title">Activity Log</h1>
              {totalLogs > 0 && (
                <span className="page-hero-subtitle">{totalLogs} activit{totalLogs !== 1 ? 'ies' : 'y'} logged</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="al-toolbar">
          <div className="al-search-wrap">
            <Search size={14} className="al-search-icon" />
            <input
              className="al-search-input"
              type="text"
              placeholder="Search by item, buyer, site…"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              autoComplete="off"
            />
            {searchQuery && (
              <button className="al-search-clear" onClick={() => handleSearch('')}>
                <XIcon size={14} />
              </button>
            )}
          </div>
          <div className="al-filter-wrap">
            <SearchableDropdown
              options={ENTITY_FILTER_OPTIONS.map(o => o.label)}
              value={ENTITY_FILTER_OPTIONS.find(o => o.key === entityFilter)?.label || 'All Activities'}
              onChange={label => {
                const key = ENTITY_FILTER_OPTIONS.find(o => o.label === label)?.key || '';
                setEntityFilter(key);
                setPage(1);
                fetchLogs(1, pageSize, key, searchQuery);
              }}
              placeholder="Filter by type"
            />
          </div>
        </div>
        {loading ? (
          <div className="empty-state-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '500px' }}>
              {[1, 2, 3].map(i => <div key={i} className="shimmer shimmer-table-row" />)}
            </div>
          </div>
        ) : totalLogs === 0 ? (
          <div className="empty-state-card">
            <div className="empty-title">No activity yet</div>
            <div className="empty-sub">Actions like adding orders, editing buyers, or deleting transactions will appear here.</div>
          </div>
        ) : (
          <div className="table-card" style={{ padding: 0 }}>
            <div className="al-list">
              {logs.map(log => (
                <LogItem
                  key={log._id}
                  log={log}
                  isExpanded={expandedId === log._id}
                  onToggle={() => setExpandedId(expandedId === log._id ? null : log._id)}
                  onViewHistory={handleViewHistory}
                />
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={totalLogs}
              pageSize={pageSize}
              onPage={p => { setPage(p); fetchLogs(p, pageSize, entityFilter, searchQuery); }}
              onPageSize={size => { setPageSize(size); setPage(1); fetchLogs(1, size, entityFilter, searchQuery); }}
              label="activities"
            />
          </div>
        )}
      </div>

      {/* History Panel */}
      {historyPanel && (
        <>
          <div className="al-panel-backdrop" onClick={() => setHistoryPanel(null)} />
          <div className="al-panel">
            <div className="al-panel-header">
              <div className="al-panel-title">
                <History size={18} />
                <span>{historyPanel.title}</span>
                <span className="al-panel-count">{historyPanel.logs.length} activit{historyPanel.logs.length !== 1 ? 'ies' : 'y'}</span>
              </div>
              <button className="modal-close" onClick={() => setHistoryPanel(null)}>
                <XIcon size={18} />
              </button>
            </div>
            <div className="al-panel-body">
              {historyLoading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
              ) : historyPanel.logs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No history found</div>
              ) : (
                <div className="al-timeline">
                  {historyPanel.logs.map((log, i) => (
                    <div key={log._id} className="al-timeline-item">
                      <div className="al-timeline-line">
                        <div className="al-timeline-dot" style={{ background: ACTION_CONFIG[log.action]?.color || 'var(--text-muted)' }} />
                        {i < historyPanel.logs.length - 1 && <div className="al-timeline-connector" />}
                      </div>
                      <div className="al-timeline-content">
                        <LogItem
                          log={log}
                          isExpanded={historyExpanded === log._id}
                          onToggle={() => setHistoryExpanded(historyExpanded === log._id ? null : log._id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

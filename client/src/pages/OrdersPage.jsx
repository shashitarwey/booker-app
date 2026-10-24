import { useState, useEffect, useRef, useCallback } from 'react';
import { getOrders, getAllOrders, deleteOrder, updateOrder, getCards, getAllSellers, getPeople, bulkUpdateStatus, bulkMarkCleared } from '../api';
import AddOrderModal from '../components/AddOrderModal';
import OrderRemarkModal from '../components/OrderRemarkModal';
import Pagination from '../common/Pagination';
import { ShoppingBag, Pencil, Trash2, Filter, Search, X as XIcon, ChevronLeft, Download, MessageSquare, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { ECOMM_SITES, getToday } from '../constants';
import { fmtSignedCurrency, cardLabel, cardHolderLabel, sellerLabel, pickTruthy } from '../utils/formatters';
import { isFriendOrder } from '../utils/profit';
import { exportOrdersCSV } from '../utils/orderExport';
import ConfirmModal from '../common/ConfirmModal';
import OrderFilters from '../components/orders/OrderFilters';
import OrderCardList from '../components/orders/OrderCardList';
import OrdersTable from '../components/orders/OrdersTable';
import BulkBar from '../components/orders/BulkBar';
import { useLocation, useNavigate } from 'react-router-dom';

const EMPTY_FILTERS = {
  order_date_from: '', order_date_to: '',
  delivery_date_from: '', delivery_date_to: '',
  seller_id: '', card_id: '', delivery_status: '', person_id: '',
  model_ordered: '', ecomm_site: '', is_cleared: ''
};

const EMPTY_SUMMARY = { total_profit: 0, total_order_amount: 0, total_friend_amount: 0, total_friend_earning: 0 };

/**
 * Order tracker. Rendered standalone at /orders, or embedded in a person's
 * page with `person` set — then every query, filter, card dropdown and total
 * is scoped to orders placed on that person's cards.
 */
export default function OrdersPage({ person = null, onChanged }) {
  const location = useLocation();
  const navigate = useNavigate();
  const embedded = Boolean(person);
  const scope = person ? { person_id: person._id } : {};
  const isFriendScope = person?.relation === 'friend';
  // Family group view spans several holders, so it still names who holds each card
  const showHolder = !embedded || Boolean(person?.isGroup);
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [cards, setCards] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [confirm, setConfirm] = useState(null);
  const [remarkOrder, setRemarkOrder] = useState(null);
  const [selected, setSelected] = useState(new Set());

  // Pre-fill seller filter if navigated from SellersPage
  const initSellerId = embedded ? '' : (location.state?.seller_id || '');
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, seller_id: initSellerId });
  const [orderDatePreset, setOrderDatePreset] = useState('');
  const [deliveryDatePreset, setDeliveryDatePreset] = useState('');
  const debounceRef = useRef(null);

  const fetchOrders = useCallback(async (f, p = page, ps = pageSize) => {
    try {
      const params = { ...pickTruthy(f || filters), ...scope, page: p, limit: ps };
      const { items, page: pageInfo, summary: s } = await getOrders(params);
      setOrders(items);
      setTotalOrders(pageInfo.item_total);
      setSummary(s || EMPTY_SUMMARY);
      onChanged?.();
    } catch (err) { console.error('Failed to load orders', err);
      toast.error('Failed to load orders');
    }
  }, [filters, page, pageSize, person?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFilters = async () => {
    setSelected(new Set()); // hidden rows must not stay selected for bulk actions
    setFilters(EMPTY_FILTERS);
    setOrderDatePreset('');
    setDeliveryDatePreset('');
    setPage(1);
    await fetchOrders(EMPTY_FILTERS, 1, pageSize);
  };

  const handleSearchChange = (value) => {
    setSelected(new Set());
    const next = { ...filters, model_ordered: value };
    setFilters(next);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchOrders(next, 1, pageSize), 450);
  };

  const loadData = async (p = page, ps = pageSize) => {
    try {
      setLoading(true);
      const initParams = initSellerId ? { seller_id: initSellerId } : {};
      const [ordersRes, fetchedCards, fetchedSellers, fetchedPeople] = await Promise.all([
        getOrders({ ...initParams, ...scope, page: p, limit: ps }),
        getCards(person ? { holder_id: person._id } : undefined),
        getAllSellers(),
        embedded ? Promise.resolve([]) : getPeople(),
      ]);
      setPeople(fetchedPeople);
      setOrders(ordersRes.items);
      setTotalOrders(ordersRes.page.item_total);
      setSummary(ordersRes.summary || EMPTY_SUMMARY);
      setCards(fetchedCards);
      setSellers(fetchedSellers);
    } catch (err) { console.error('Failed to load orders', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (initSellerId) setShowFilters(true);
    return () => clearTimeout(debounceRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = (id) => {
    setConfirm({
      title: 'Delete Order',
      confirmLabel: 'Delete',
      message: 'Delete this order? This action cannot be undone.',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteOrder(id);
          toast.success('Order deleted');
          const newPage = orders.length === 1 && page > 1 ? page - 1 : page;
          setPage(newPage);
          fetchOrders(filters, newPage, pageSize);
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to delete order');
        }
      }
    });
  };

  const [exporting, setExporting] = useState(false);
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const allOrders = await getAllOrders({ ...pickTruthy(filters), ...scope });
      if (!allOrders || allOrders.length === 0) {
        toast.error('No orders to export');
        return;
      }
      const today = getToday();
      const prefix = person ? `orders_${person.name.replace(/\s+/g, '_')}` : 'orders';
      exportOrdersCSV(allOrders, `${prefix}_${today}.csv`);
      toast.success(`Exported ${allOrders.length} order${allOrders.length === 1 ? '' : 's'}`);
    } catch {
      toast.error('Failed to export orders');
    } finally {
      setExporting(false);
    }
  };

  const handleToggleClear = async (order) => {
    try {
      await updateOrder(order._id, { is_cleared: !order.is_cleared });
      setOrders(prev => prev.map(o => o._id === order._id ? { ...o, is_cleared: !o.is_cleared } : o));
    } catch {
      toast.error('Failed to update order');
    }
  };

  // ── Bulk selection helpers ───────────────────────────────────────
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map(o => o._id)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  const handleBulkStatus = (status) => {
    const label = status;
    setConfirm({
      title: 'Update Status',
      confirmLabel: label,
      message: `Mark ${selected.size} order(s) as "${label}"?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          const delivered_date = status === 'Delivered' ? getToday() : '';
          await bulkUpdateStatus([...selected], status, delivered_date);
          toast.success(`${selected.size} order(s) marked as ${label}`);
          clearSelection();
          fetchOrders(filters, page, pageSize);
        } catch { toast.error('Bulk status update failed'); }
      }
    });
  };

  const handleBulkClear = (cleared) => {
    setConfirm({
      title: cleared ? 'Mark Cleared' : 'Mark Uncleared',
      confirmLabel: cleared ? 'Clear' : 'Unclear',
      message: `Mark ${selected.size} order(s) as ${cleared ? 'cleared' : 'uncleared'}?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await bulkMarkCleared([...selected], cleared);
          toast.success(`${selected.size} order(s) ${cleared ? 'cleared' : 'uncleared'}`);
          clearSelection();
          fetchOrders(filters, page, pageSize);
        } catch { toast.error('Bulk clear update failed'); }
      }
    });
  };


  if (loading) {
    return (
      <>
        <div className="page-hero">
          <div className="page-hero-inner">
            <div className="page-hero-left">
              <div className="shimmer shimmer-text" style={{ width: '200px', height: '32px' }} />
            </div>
          </div>
        </div>
        <div className="page-content">
          <div className="empty-state-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '500px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="shimmer shimmer-table-row" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Profit totals come from the server so the badge reflects every matching
  // order (across all pages), not just the current page. Weighted margin =
  // sum(profit) / sum(order_amount) × 100 — the actual average margin, not
  // the unweighted mean of per-row percentages.
  const totalProfit = summary.total_profit;
  const totalOrderAmount = summary.total_order_amount;
  const avgProfitPercent = totalOrderAmount > 0
    ? ((totalProfit / totalOrderAmount) * 100).toFixed(2)
    : '0.00';

  const sellerOptions = sellers.map(s => ({ label: sellerLabel(s), value: s._id }));
  // Booker filter narrows the card dropdown to that person's cards
  const cardOptions   = cards
    .filter(c => !filters.person_id || String(c.holder_id?._id || c.holder_id) === filters.person_id)
    .map(c => ({ label: showHolder ? cardHolderLabel(c) : cardLabel(c), value: c._id }));
  const personOptions = people.map(p => ({
    label: p.relation === 'self' ? `${p.name} (You)` : `${p.name} (${p.relation === 'friend' ? 'Booker' : 'Family'})`,
    value: p._id,
  }));
  const showFriendCol = isFriendScope || orders.some(isFriendOrder);
  const sourceOptions = ['All', ...ECOMM_SITES];
  const hasActiveFilters = Object.entries(filters).some(([k, v]) => k !== 'model_ordered' && v);

  const orderMenuItems = (order, hasRemark) => [
    { label: hasRemark ? 'Edit Remark' : 'Add Remark', icon: <MessageSquare size={14} />, onClick: () => setRemarkOrder(order) },
    { label: 'Edit Order', icon: <Pencil size={14} />, onClick: () => { setEditOrder(order); setShowModal(true); } },
    { label: 'View Activity', icon: <History size={14} />, onClick: () => navigate(`/activity?entityId=${order._id}&entity=order`), color: 'var(--info)' },
    { label: 'Delete',     icon: <Trash2 size={14} />, onClick: () => handleDelete(order._id), color: 'var(--danger)', className: 'border-top' },
  ];

  // Pagination (server-side)
  const totalPages  = Math.ceil(totalOrders / pageSize);
  const activeSeller = initSellerId ? sellers.find(s => s._id === initSellerId) : null;

  return (
    <>
      {/* Page Hero Header */}
      <div className={embedded ? 'page-hero page-hero-embedded' : 'page-hero'}>
        <div className="page-hero-inner">
          <div className="page-hero-left">
            {!embedded && (
              <button
                className="btn-back-circle"
                onClick={() => navigate(-1)}
                data-tooltip="Back"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            <div className="page-hero-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {embedded
                  ? <h2 className="section-title">{person.isGroup ? 'Orders on family cards' : `Orders on ${person.name}'s cards`}</h2>
                  : <h1 className="page-hero-title">Order Tracker</h1>}
                {/* Embedded in a person's page the stats panel above already shows profit */}
                {totalOrders > 0 && !embedded && (
                  <span className={`profit-badge ${totalProfit >= 0 ? 'profit-badge-positive' : 'profit-badge-negative'}`}>
                    Profit: {fmtSignedCurrency(totalProfit)} ({avgProfitPercent}%)
                  </span>
                )}
              </div>
              {totalOrders > 0 && (
                <span className="page-hero-subtitle">{totalOrders} order{totalOrders !== 1 ? 's' : ''} tracked</span>
              )}
            </div>
          </div>

          <div className="page-hero-actions">
            <div className="search-bar">
              <Search size={14} className="search-bar-icon" />
              <input
                type="text"
                className="search-bar-input"
                placeholder="Search item..."
                value={filters.model_ordered}
                onChange={e => handleSearchChange(e.target.value)}
              />
              {filters.model_ordered && (
                <button className="search-bar-clear" onClick={() => handleSearchChange('')}>
                  <XIcon size={13} />
                </button>
              )}
            </div>
            <button
              className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-ghost'}`}
              style={{ position: 'relative', flexShrink: 0 }}
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter size={14} /> Filters
              {hasActiveFilters && <span style={{ position: 'absolute', top: '4px', right: '4px', width: '7px', height: '7px', background: 'var(--accent)', borderRadius: '50%' }} />}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              style={{ flexShrink: 0 }}
              onClick={handleExportCSV}
              disabled={exporting || totalOrders === 0}
              data-tooltip="Export orders as CSV"
            >
              <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => { setEditOrder(null); setShowModal(true); }}>
              <ShoppingBag size={14} /> Add Order
            </button>
          </div>
        </div>
      </div>

      <div className={embedded ? 'page-content page-content-embedded' : 'page-content'}>
        {showFilters && (
          <OrderFilters
            filters={filters}
            setFilters={setFilters}
            embedded={embedded}
            cards={cards}
            sellerOptions={sellerOptions}
            cardOptions={cardOptions}
            personOptions={personOptions}
            sourceOptions={sourceOptions}
            orderDatePreset={orderDatePreset}
            setOrderDatePreset={setOrderDatePreset}
            deliveryDatePreset={deliveryDatePreset}
            setDeliveryDatePreset={setDeliveryDatePreset}
            onClose={() => setShowFilters(false)}
            onClear={clearFilters}
            onApply={() => { setPage(1); setSelected(new Set()); fetchOrders(filters, 1, pageSize); }}
          />
        )}

        {totalOrders === 0 ? (
          <div className="empty-state-card">
            <div className="empty-icon empty-icon-orders">
              <ShoppingBag size={32} />
            </div>
            <div className="empty-title">No orders yet</div>
            <div className="empty-sub">Start tracking your orders to monitor profits, delivery status, and buyer performance.</div>
            <div className="empty-cta">
              <button className="btn btn-primary" onClick={() => { setEditOrder(null); setShowModal(true); }}>
                <ShoppingBag size={16} /> Add First Order
              </button>
            </div>
          </div>
        ) : (
          <div className="table-card">
            {/* Pre-filter banner */}
            {initSellerId && activeSeller && location.state?.seller_name && (
              <div className="prefilter-banner">
                <span className="prefilter-banner-text">
                  Showing orders for <strong>{location.state.seller_name}</strong>
                </span>
                <button className="prefilter-banner-clear" onClick={clearFilters}>Clear filter</button>
              </div>
            )}

            {/* Phones: stacked order cards instead of the wide table */}
            <OrderCardList
              orders={orders}
              selected={selected}
              toggleSelect={toggleSelect}
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              menuItems={orderMenuItems}
              onOpen={setRemarkOrder}
              onToggleClear={handleToggleClear}
              showHolder={showHolder}
              isGroup={Boolean(person?.isGroup)}
            />

            <OrdersTable
              orders={orders}
              rowOffset={(page - 1) * pageSize}
              selected={selected}
              toggleSelect={toggleSelect}
              toggleSelectAll={toggleSelectAll}
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              menuItems={orderMenuItems}
              onOpen={setRemarkOrder}
              onToggleClear={handleToggleClear}
              showHolder={showHolder}
              showFriendCol={showFriendCol}
              isFriendScope={isFriendScope}
            />

            {selected.size > 0 && (
              <BulkBar
                count={selected.size}
                onStatus={handleBulkStatus}
                onClear={() => handleBulkClear(true)}
                onClose={clearSelection}
              />
            )}

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={totalOrders}
              pageSize={pageSize}
              onPage={p => { setPage(p); clearSelection(); fetchOrders(filters, p, pageSize); }}
              onPageSize={size => { setPageSize(size); setPage(1); clearSelection(); fetchOrders(filters, 1, size); }}
              label="orders"
            />
          </div>
        )}
      </div>

      {showModal && (
        <AddOrderModal
          onClose={() => { setShowModal(false); setEditOrder(null); }}
          onSuccess={() => fetchOrders(filters, page, pageSize)}
          editOrder={editOrder}
          cards={cards}
          sellers={sellers}
        />
      )}

      {remarkOrder && (
        <OrderRemarkModal
          order={remarkOrder}
          onClose={() => setRemarkOrder(null)}
          onSaved={(updated) => {
            setOrders(prev => prev.map(o => o._id === updated._id ? { ...o, remark: updated.remark } : o));
          }}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title || 'Confirm'}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel || 'Confirm'}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

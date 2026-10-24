import { useState, useEffect, useCallback } from 'react';
import { getSellers, deleteSeller } from '../api';
import { Plus, Trash2, Pencil, BookText, Wallet, MapPin, TrendingUp, TrendingDown, ChevronLeft, Phone, Users, History } from 'lucide-react';
import { fmtCurrency, fmtSignedCurrency, profitColor } from '../utils/formatters';
import { pctLabel } from '../utils/profit';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import AddSellerModal from '../components/AddSellerModal';
import ConfirmModal from '../common/ConfirmModal';
import AddPaymentModal from '../components/AddPaymentModal';
import ActionMenu from '../common/ActionMenu';
import Pagination from '../common/Pagination';

export default function SellersPage() {
  const [sellers, setSellers] = useState([]);
  const [totalSellers, setTotalSellers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [editSeller, setEditSeller] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [paymentSeller, setPaymentSeller] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const navigate = useNavigate();

  const fetchSellers = useCallback(async (p = page, ps = pageSize) => {
    try {
      setLoading(true);
      const { items, page: pageInfo } = await getSellers({ page: p, limit: ps });
      setSellers(items);
      setTotalSellers(pageInfo.item_total);
    } catch (err) { console.error('Failed to load sellers', err);
      toast.error('Failed to load sellers');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => { fetchSellers(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = (seller) => {
    setConfirm({
      message: `Delete buyer "${seller.name}"? This will only work if there are no existing orders assigned to them.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteSeller(seller._id);
          toast.success('Seller deleted');
          const newPage = sellers.length === 1 && page > 1 ? page - 1 : page;
          setPage(newPage);
          fetchSellers(newPage, pageSize);
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to delete seller');
        }
      }
    });
  };

  const handleEdit = (seller) => {
    setEditSeller(seller);
    setShowAddModal(true);
  };

  const sellerMenuItems = (seller) => [
    { label: 'Add Payment', icon: <Wallet size={15} />,   color: 'var(--success)', onClick: () => setPaymentSeller(seller) },
    { label: 'View Ledger', icon: <BookText size={15} />,  color: 'var(--info)',    onClick: () => navigate(`/sellers/${seller._id}/ledger`) },
    { label: 'Edit Buyer', icon: <Pencil size={15} />,    color: 'var(--text)',    onClick: () => handleEdit(seller) },
    { label: 'View Activity', icon: <History size={15} />, color: 'var(--info)', onClick: () => navigate(`/activity?entityId=${seller._id}&entity=seller`) },
    { label: 'Delete Buyer', icon: <Trash2 size={15} />,  color: 'var(--danger)',  className: 'border-top', onClick: () => handleDelete(seller) },
  ];

  // Pagination (server-side)
  const totalPages = Math.ceil(totalSellers / pageSize);

  // Aggregate stats across current page sellers
  const totalDue      = sellers.reduce((s, x) => s + (x.due_balance  || 0), 0);
  const totalReceived = sellers.reduce((s, x) => s + (x.total_received || 0), 0);
  const totalProfit   = sellers.reduce((s, x) => s + (x.profit        || 0), 0);
  const totalOrdered  = sellers.reduce((s, x) => s + (x.total_amount_ordered || 0), 0);

  return (
    <>
      {/* Page Hero Header */}
      <div className="page-hero">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button
              className="btn-back-circle"
              onClick={() => navigate(-1)}
              data-tooltip="Back"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="page-hero-title-group">
              <h1 className="page-hero-title">Buyers Tracking</h1>
              {!loading && totalSellers > 0 && (
                <span className="page-hero-subtitle">{totalSellers} buyer{totalSellers !== 1 ? 's' : ''} registered</span>
              )}
            </div>
          </div>

          <div className="page-hero-actions">
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> Add Buyer
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Stats bar — only when sellers exist */}
        {!loading && totalSellers > 0 && (
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{ background: 'rgba(248, 113, 113, 0.12)', color: 'var(--danger)' }}>
                  <TrendingDown size={16} />
                </div>
                <span className="stat-card-label">Amount Due</span>
              </div>
              <div className="stat-card-value" style={{ color: totalDue > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {fmtCurrency(totalDue)}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{ background: 'rgba(52, 211, 153, 0.12)', color: 'var(--success)' }}>
                  <Wallet size={16} />
                </div>
                <span className="stat-card-label">Amount Received</span>
              </div>
              <div className="stat-card-value" style={{ color: 'var(--success)' }}>
                {fmtCurrency(totalReceived)}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{ background: 'rgba(124, 108, 255, 0.12)', color: 'var(--accent)' }}>
                  <TrendingUp size={16} />
                </div>
                <span className="stat-card-label">Total Profit</span>
              </div>
              <div className="stat-card-value" style={{ color: profitColor(totalProfit) }}>
                {fmtSignedCurrency(totalProfit)} <span className="profit-pct">{pctLabel(totalProfit, totalOrdered)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="empty-state-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '500px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="shimmer shimmer-table-row" />
              ))}
            </div>
          </div>
        ) : totalSellers === 0 ? (
          <div className="empty-state-card">
            <div className="empty-icon empty-icon-sellers">
              <Users size={32} />
            </div>
            <div className="empty-title">No buyers added yet</div>
            <div className="empty-sub">Add your first buyer to start tracking their orders, payments, and profits.</div>
            <div className="empty-cta">
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={16} /> Add First Buyer
              </button>
            </div>
          </div>
        ) : (
          <div className="table-card">
            {/* Phones: one card per buyer instead of the wide table */}
            <div className="order-cards">
              {sellers.map(seller => (
                <article key={seller._id} className="order-card" onClick={() => navigate(`/sellers/${seller._id}/ledger`)}>
                  <div className="order-card-top">
                    <div className="order-card-title">
                      <div className="order-card-item">{seller.name}</div>
                      <div className="order-card-sub">
                        <MapPin size={11} style={{ verticalAlign: '-1px' }} /> {seller.city}{seller.phone ? ` · ${seller.phone}` : ''}
                      </div>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      <ActionMenu id={`m-${seller._id}`} openId={openDropdown} onToggle={setOpenDropdown} items={sellerMenuItems(seller)} />
                    </div>
                  </div>
                  <div className="order-card-amounts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    <div><span>Expected</span><strong>{fmtCurrency(seller.total_amount_get)}</strong></div>
                    <div><span>Received</span><strong style={{ color: 'var(--success)' }}>{fmtCurrency(seller.total_received || 0)}</strong></div>
                    <div><span>Due</span><strong style={{ color: profitColor(-(seller.due_balance || 0)) }}>{fmtCurrency(seller.due_balance || 0)}</strong></div>
                  </div>
                  <div className="order-card-foot">
                    <span>Profit</span>
                    <strong style={{ color: profitColor(seller.profit) }}>
                      {fmtSignedCurrency(seller.profit)} <span className="profit-pct">{pctLabel(seller.profit, seller.total_amount_ordered)}</span>
                    </strong>
                  </div>
                </article>
              ))}
            </div>

            <div className="table-responsive-wrapper orders-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Buyer Name</th>
                    <th>Location</th>
                    <th>Phone</th>
                    <th>Expected (from Orders)</th>
                    <th>Received (Payments)</th>
                    <th>Due Balance</th>
                    <th>Profit</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map(seller => (
                    <tr
                      key={seller._id}
                      onClick={() => navigate(`/sellers/${seller._id}/ledger`)}
                      style={{ cursor: 'pointer' }}
                      title={`View ledger for ${seller.name}`}
                    >
                      <td className="font-semibold">{seller.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                          <MapPin size={13} style={{ flexShrink: 0 }} />
                          {seller.city}
                        </div>
                      </td>
                      <td>
                        {seller.phone
                          ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                              <Phone size={13} style={{ flexShrink: 0 }} />
                              {seller.phone}
                            </div>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>
                      <td className="font-medium text-muted">{fmtCurrency(seller.total_amount_get)}</td>
                      <td className="font-medium text-green">{fmtCurrency(seller.total_received || 0)}</td>
                      <td className="font-bold" style={{ color: profitColor(-(seller.due_balance || 0)) }}>
                        {fmtCurrency(seller.due_balance || 0)}
                      </td>
                      <td className="font-medium" style={{ color: profitColor(seller.profit), whiteSpace: 'nowrap' }}>
                        {fmtSignedCurrency(seller.profit)} <span className="profit-pct">{pctLabel(seller.profit, seller.total_amount_ordered)}</span>
                      </td>
                      <td className="text-right">
                        <ActionMenu
                          id={seller._id}
                          openId={openDropdown}
                          onToggle={setOpenDropdown}
                          items={sellerMenuItems(seller)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={totalSellers}
              pageSize={pageSize}
              onPage={p => { setPage(p); fetchSellers(p, pageSize); }}
              onPageSize={size => { setPageSize(size); setPage(1); fetchSellers(1, size); }}
              label="buyers"
            />
          </div>
        )}
      </div>

      {showAddModal && (
        <AddSellerModal
          onClose={() => { setShowAddModal(false); setEditSeller(null); }}
          onSuccess={() => fetchSellers(page, pageSize)}
          editSeller={editSeller}
        />
      )}

      {confirm && (
        <ConfirmModal
          title="Delete Buyer"
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {paymentSeller && (
        <AddPaymentModal
          seller={paymentSeller}
          onClose={() => setPaymentSeller(null)}
          onSuccess={() => fetchSellers(page, pageSize)}
        />
      )}
    </>
  );
}

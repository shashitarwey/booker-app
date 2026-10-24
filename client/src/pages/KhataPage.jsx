import { useState, useEffect, useCallback } from 'react';
import { getCustomers, deleteCustomer } from '../api';
import { Plus, Trash2, Pencil, BookText, Wallet, TrendingDown, TrendingUp, ChevronLeft, Phone, Users, History } from 'lucide-react';
import { fmtCurrency, profitColor } from '../utils/formatters';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BookersKhataList from '../components/BookersKhataList';
import AddCustomerModal from '../components/AddCustomerModal';
import ConfirmModal from '../common/ConfirmModal';
import ActionMenu from '../common/ActionMenu';
import Pagination from '../common/Pagination';

export default function KhataPage() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'bookers' ? 'bookers' : 'customers';

  const fetchCustomers = useCallback(async (p = page, ps = pageSize) => {
    try {
      setLoading(true);
      const { items, page: pageInfo } = await getCustomers({ page: p, limit: ps });
      setCustomers(items);
      setTotal(pageInfo.item_total);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => { fetchCustomers(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = (customer) => {
    setConfirm({
      message: `Delete "${customer.name}" and all their khata entries? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteCustomer(customer._id);
          toast.success('Customer deleted');
          const newPage = customers.length === 1 && page > 1 ? page - 1 : page;
          setPage(newPage);
          fetchCustomers(newPage, pageSize);
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to delete customer');
        }
      }
    });
  };

  const handleEdit = (customer) => {
    setEditCustomer(customer);
    setShowAddModal(true);
  };

  const totalPages = Math.ceil(total / pageSize);

  // Aggregate across current page: total due (gave > got) and total got
  const totalGave = customers.reduce((s, c) => s + (c.total_gave || 0), 0);
  const totalGot = customers.reduce((s, c) => s + (c.total_got || 0), 0);
  const totalDue = totalGave - totalGot;

  return (
    <>
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
              <h1 className="page-hero-title">Khata Book</h1>
              {tab === 'customers' && !loading && total > 0 && (
                <span className="page-hero-subtitle">{total} customer{total !== 1 ? 's' : ''}</span>
              )}
              {tab === 'bookers' && <span className="page-hero-subtitle">What you owe your bookers and what you've paid</span>}
            </div>
          </div>

          <div className="page-hero-actions">
            {tab === 'customers' && (
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={16} /> Add Customer
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="tab-strip">
          <button className={`tab-btn ${tab === 'customers' ? 'is-active' : ''}`} onClick={() => setSearchParams({})}>
            Customers {total > 0 && <span className="tab-btn-count">{total}</span>}
          </button>
          <button className={`tab-btn ${tab === 'bookers' ? 'is-active' : ''}`} onClick={() => setSearchParams({ tab: 'bookers' })}>
            Bookers
          </button>
        </div>

        {tab === 'bookers' ? <BookersKhataList /> : (<>
        {!loading && total > 0 && (
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{ background: 'rgba(248, 113, 113, 0.12)', color: 'var(--ink-red)' }}>
                  <TrendingDown size={16} />
                </div>
                <span className="stat-card-label">Total You Gave</span>
              </div>
              <div className="stat-card-value" style={{ color: 'var(--ink-red)' }}>
                {fmtCurrency(totalGave)}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{ background: 'rgba(134, 239, 172, 0.12)', color: 'var(--ink-green)' }}>
                  <TrendingUp size={16} />
                </div>
                <span className="stat-card-label">Total You Got</span>
              </div>
              <div className="stat-card-value" style={{ color: 'var(--ink-green)' }}>
                {fmtCurrency(totalGot)}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <div className="stat-card-icon" style={{ background: 'rgba(124, 108, 255, 0.12)', color: 'var(--accent)' }}>
                  <Wallet size={16} />
                </div>
                <span className="stat-card-label">Net Balance</span>
              </div>
              <div className="stat-card-value" style={{ color: profitColor(-totalDue) }}>
                {fmtCurrency(Math.abs(totalDue))}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="empty-state-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '500px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="shimmer shimmer-table-row" />
              ))}
            </div>
          </div>
        ) : total === 0 ? (
          <div className="empty-state-card">
            <div className="empty-icon empty-icon-sellers">
              <Users size={32} />
            </div>
            <div className="empty-title">No customers in khata yet</div>
            <div className="empty-sub">Add a customer to start tracking money you lend and receive.</div>
            <div className="empty-cta">
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={16} /> Add First Customer
              </button>
            </div>
          </div>
        ) : (
          <div className="table-card">
            <div className="table-responsive-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>You Gave</th>
                    <th>You Got</th>
                    <th>Balance</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => (
                    <tr
                      key={c._id}
                      onClick={() => navigate(`/khata/${c._id}`)}
                      style={{ cursor: 'pointer' }}
                      title={`View ${c.name}'s khata`}
                    >
                      <td className="font-semibold">{c.name}</td>
                      <td>
                        {c.phone
                          ? <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                              <Phone size={13} style={{ flexShrink: 0 }} />
                              {c.phone}
                            </div>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>
                        }
                      </td>
                      <td className="font-medium" style={{ color: 'var(--ink-red)' }}>{fmtCurrency(c.total_gave || 0)}</td>
                      <td className="font-medium" style={{ color: 'var(--ink-green)' }}>{fmtCurrency(c.total_got || 0)}</td>
                      <td className="font-bold" style={{ color: profitColor(-(c.balance || 0)) }}>
                        {fmtCurrency(Math.abs(c.balance || 0))}
                      </td>
                      <td className="text-right">
                        <ActionMenu
                          id={c._id}
                          openId={openDropdown}
                          onToggle={setOpenDropdown}
                          items={[
                            { label: 'View Khata', icon: <BookText size={15} />, color: 'var(--info)', onClick: () => navigate(`/khata/${c._id}`) },
                            { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: () => handleEdit(c) },
                            { label: 'View Activity', icon: <History size={15} />, color: 'var(--info)', onClick: () => navigate(`/activity?entityId=${c._id}&entity=customer`) },
                            { label: 'Delete', icon: <Trash2 size={15} />, color: 'var(--danger)', className: 'border-top', onClick: () => handleDelete(c) },
                          ]}
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
              totalItems={total}
              pageSize={pageSize}
              onPage={p => { setPage(p); fetchCustomers(p, pageSize); }}
              onPageSize={size => { setPageSize(size); setPage(1); fetchCustomers(1, size); }}
              label="customers"
            />
          </div>
        )}
        </>)}
      </div>

      {showAddModal && (
        <AddCustomerModal
          onClose={() => { setShowAddModal(false); setEditCustomer(null); }}
          onSuccess={() => fetchCustomers(page, pageSize)}
          editCustomer={editCustomer}
        />
      )}

      {confirm && (
        <ConfirmModal
          title="Delete Customer"
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

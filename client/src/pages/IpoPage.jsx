import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ChevronLeft, Plus, UserPlus, Pencil, Trash2, Search, ChartCandlestick, Landmark, Wallet, TrendingUp, Users, Hourglass,
} from 'lucide-react';
import {
  getIpoApplicants, getIpoApplications, getBankAccounts, updateIpoApplication, deleteIpoApplication, deleteIpoApplicant,
} from '../api';
import { fmtCurrency, fmtSignedCurrency } from '../utils/formatters';
import { IPO_STATUS } from '../utils/ipo';
import ActionMenu from '../common/ActionMenu';
import ConfirmModal from '../common/ConfirmModal';
import IpoApplicantModal from '../components/ipo/IpoApplicantModal';
import IpoApplicationModal from '../components/ipo/IpoApplicationModal';
import { bankLabel } from '../utils/bankAccounts';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'applied', label: 'Applied' },
  { key: 'allotted', label: 'Allotted' },
  { key: 'sold', label: 'Sold' },
];

const signed = (n) => (n === null || n === undefined ? '—' : fmtSignedCurrency(n));
const tone = (n) => (n === null || n === undefined ? '' : n >= 0 ? 'text-success' : 'text-danger');

function AllottedSwitch({ app, busy, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={app.allotted}
      aria-label={app.allotted ? 'Allotted' : 'Not allotted'}
      className={`ipo-switch ${app.allotted ? 'is-on' : ''}`}
      disabled={busy}
      onClick={e => { e.stopPropagation(); onToggle(app); }}
    >
      <span className="ipo-switch-knob" />
    </button>
  );
}

export default function IpoPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const applicantId = searchParams.get('applicant') || '';

  const [applicants, setApplicants] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [data, setData] = useState({ items: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [applicantModal, setApplicantModal] = useState(null); // {} = add, applicant = edit
  const [appModal, setAppModal] = useState(null);             // {} = apply, app = edit
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      const [people, banks, apps] = await Promise.all([
        getIpoApplicants(), getBankAccounts(), getIpoApplications(applicantId ? { applicant_id: applicantId } : {}),
      ]);
      setApplicants(people);
      setAccounts(banks);
      setData(apps);
    } catch {
      toast.error('Failed to load IPOs');
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => { load(); }, [load]);

  const applicant = applicants.find(a => a._id === applicantId) || null;
  const summary = data.summary;

  const counts = useMemo(() => {
    const c = { '': data.items.length, applied: 0, allotted: 0, sold: 0 };
    for (const a of data.items) c[a.status] += 1;
    return c;
  }, [data.items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.items.filter(a => (!status || a.status === status)
      && (!q || a.ipo_name.toLowerCase().includes(q) || a.applicant_name.toLowerCase().includes(q)));
  }, [data.items, status, query]);

  // Form helpers: known IPO names, the bank each applicant used last, last share %
  const ipoNames = useMemo(() => [...new Set(data.items.map(a => a.ipo_name))], [data.items]);
  const lastBankFor = useCallback((p) => {
    const last = data.items.find(a => String(a.applicant_id) === p._id && a.bank_account_id);
    return String(last?.bank_account_id || p.default_bank_account_id || '');
  }, [data.items]);
  const defaults = { profit_share_percent: data.items[0]?.profit_share_percent ?? '' };

  const addAccount = (acc) => setAccounts(list => [...list, acc]);

  const toggleAllotted = async (app) => {
    setBusyId(app._id);
    try {
      const updated = await updateIpoApplication(app._id, { allotted: !app.allotted });
      toast.success(updated.allotted ? `${app.ipo_name}: allotted to ${app.applicant_name}` : `${app.ipo_name}: marked not allotted`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setBusyId(null);
    }
  };

  const askDeleteApp = (app) => setConfirm({
    title: 'Delete IPO application',
    message: `Delete ${app.ipo_name} for ${app.applicant_name}?`,
    onConfirm: async () => {
      setConfirm(null);
      try { await deleteIpoApplication(app._id); toast.success('Deleted'); load(); } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
    },
  });

  const askDeleteApplicant = (p) => setConfirm({
    title: 'Delete applicant',
    message: `Delete ${p.name}? Applicants with IPO applications can't be deleted.`,
    onConfirm: async () => {
      setConfirm(null);
      try {
        await deleteIpoApplicant(p._id);
        toast.success(`${p.name} deleted`);
        setSearchParams({});
        load();
      } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
    },
  });

  const menuItems = (app) => [
    { label: app.allotted && app.sell_price === null ? 'Add sell price' : 'Edit', icon: <Pencil size={14} />, onClick: () => setAppModal(app) },
    { label: 'Delete', icon: <Trash2 size={14} />, color: 'var(--danger)', onClick: () => askDeleteApp(app) },
  ];

  const bankOf = (app) => app.bank_label || bankLabel(accounts.find(b => b._id === app.bank_account_id)) || '—';

  return (
    <>
      <div className="page-hero">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button className="btn-back-circle" onClick={() => navigate(-1)} data-tooltip="Back"><ChevronLeft size={22} /></button>
            <div className="page-hero-title-group">
              <h1 className="page-hero-title">IPO</h1>
              <span className="page-hero-subtitle">Applications through friends & family, allotment and profit sharing</span>
            </div>
          </div>
          <div className="page-hero-actions">
            <button className="btn btn-secondary" onClick={() => setApplicantModal({})}><UserPlus size={16} /> Add Applicant</button>
            <button className="btn btn-primary" onClick={() => setAppModal({})} disabled={applicants.length === 0} title={applicants.length === 0 ? 'Add an applicant first' : undefined}>
              <Plus size={16} /> Apply IPO
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="shimmer" style={{ height: 260, borderRadius: 'var(--radius)' }} />
        ) : applicants.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-icon"><ChartCandlestick size={32} /></div>
            <div className="empty-title">No IPO applicants yet</div>
            <div className="empty-sub">Add the people whose demat accounts you apply IPOs from. Then apply an IPO for several of them at once, mark allotments and record the sell price to split the profit.</div>
            <div className="empty-cta">
              <button className="btn btn-primary" onClick={() => setApplicantModal({})}><UserPlus size={16} /> Add First Applicant</button>
            </div>
          </div>
        ) : (
          <>
            <div className="tab-strip">
              <button className={`tab-btn ${!applicantId ? 'is-active' : ''}`} onClick={() => setSearchParams({})}>
                <Users size={14} /> Everyone <span className="tab-btn-count">{applicants.length}</span>
              </button>
              <span className="tab-strip-sep" aria-hidden="true" />
              {applicants.map(p => (
                <button key={p._id} className={`tab-btn ${p._id === applicantId ? 'is-active' : ''}`} onClick={() => setSearchParams({ applicant: p._id })}>
                  {p.name} {p.stats.applications > 0 && <span className="tab-btn-count">{p.stats.applications}</span>}
                </button>
              ))}
              <button className="tab-btn tab-btn-add" onClick={() => setApplicantModal({})} title="Add an IPO applicant">
                <UserPlus size={14} /> Add
              </button>
            </div>

            {applicant && (
              <div className="ipo-applicant-bar">
                <div className="ipo-applicant-meta">
                  <strong>{applicant.name}</strong>
                  {applicant.broker && <span className="ipo-chip">{applicant.broker}</span>}
                  {applicant.default_bank_account_id && (
                    <span className="ipo-chip"><Landmark size={12} /> {bankLabel(accounts.find(b => b._id === applicant.default_bank_account_id))}</span>
                  )}
                  {applicant.notes && <span className="ipo-applicant-notes">{applicant.notes}</span>}
                </div>
                <div className="ipo-applicant-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setApplicantModal(applicant)}><Pencil size={14} /> Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => askDeleteApplicant(applicant)}><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            )}

            {summary && (
              <div className="ipo-kpis">
                <div className="ipo-kpi">
                  <span><ChartCandlestick size={14} /> Applications</span>
                  <strong>{summary.applications}</strong>
                  <em>{summary.allotted} allotted</em>
                </div>
                <div className="ipo-kpi">
                  <span><Hourglass size={14} /> Awaiting sale</span>
                  <strong>{summary.awaiting_sale}</strong>
                  <em>{fmtCurrency(summary.invested)} in allotted lots</em>
                </div>
                <div className="ipo-kpi">
                  <span><TrendingUp size={14} /> Profit</span>
                  <strong className={tone(summary.profit)}>{fmtSignedCurrency(summary.profit)}</strong>
                  <em>{summary.sold} sold</em>
                </div>
                <div className="ipo-kpi">
                  <span><Wallet size={14} /> My share</span>
                  <strong className={tone(summary.my_share)}>{fmtSignedCurrency(summary.my_share)}</strong>
                  <em>Their share {fmtCurrency(summary.their_share)}</em>
                </div>
              </div>
            )}

            <div className="ipo-toolbar">
              <div className="member-pills">
                {STATUS_TABS.map(t => (
                  <button key={t.key} className={`member-pill ${status === t.key ? 'is-active' : ''}`} onClick={() => setStatus(t.key)}>
                    {t.label} <span className="ipo-pill-count">{counts[t.key]}</span>
                  </button>
                ))}
              </div>
              <label className="ipo-search">
                <Search size={14} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search IPO or applicant" aria-label="Search IPO or applicant" />
              </label>
            </div>

            {visible.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon"><ChartCandlestick size={28} /></div>
                <div className="empty-title">{data.items.length === 0 ? 'No IPOs applied yet' : 'Nothing matches'}</div>
                <div className="empty-sub">
                  {data.items.length === 0 ? 'Apply an IPO for one or more applicants at once.' : 'Try another status or search.'}
                </div>
                {data.items.length === 0 && (
                  <div className="empty-cta"><button className="btn btn-primary" onClick={() => setAppModal({})}><Plus size={16} /> Apply IPO</button></div>
                )}
              </div>
            ) : (
              <>
                {/* Desktop / tablet */}
                <div className="table-card ipo-table-card">
                  <div className="table-responsive-wrapper">
                    <table className="data-table ipo-table">
                      <thead>
                        <tr>
                          <th>IPO</th>
                          <th>Applicant · bank</th>
                          <th className="text-right">1 lot price</th>
                          <th className="text-right">Share %</th>
                          <th>Allotted</th>
                          <th className="text-right">Sell price</th>
                          <th className="text-right">Profit</th>
                          <th className="text-right">Their ₹</th>
                          <th className="text-right">My ₹</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map(a => (
                          <tr key={a._id} onClick={() => setAppModal(a)} className="ipo-row">
                            <td>
                              <div className="font-semibold">{a.ipo_name}</div>
                              <span className={`badge ${IPO_STATUS[a.status].badge}`}>{IPO_STATUS[a.status].label}</span>
                            </td>
                            <td>
                              <div className="font-medium">{a.applicant_name}</div>
                              <div className="ipo-bank-cell">{bankOf(a)}</div>
                            </td>
                            <td className="text-right">{fmtCurrency(a.lot_price)}</td>
                            <td className="text-right">{a.profit_share_percent}%</td>
                            <td><AllottedSwitch app={a} busy={busyId === a._id} onToggle={toggleAllotted} /></td>
                            <td className="text-right">
                              {a.sell_price !== null ? fmtCurrency(a.sell_price)
                                : a.allotted ? <button className="ipo-link" onClick={e => { e.stopPropagation(); setAppModal(a); }}>+ Add</button> : '—'}
                            </td>
                            <td className={`text-right font-semibold ${tone(a.profit)}`}>{signed(a.profit)}</td>
                            <td className="text-right">{a.their_share === null ? '—' : fmtCurrency(a.their_share)}</td>
                            <td className={`text-right font-semibold ${tone(a.my_share)}`}>{signed(a.my_share)}</td>
                            <td onClick={e => e.stopPropagation()}>
                              <ActionMenu id={`ipo-${a._id}`} openId={openMenu} onToggle={setOpenMenu} items={menuItems(a)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Phone */}
                <div className="ipo-cards">
                  {visible.map(a => (
                    <article key={a._id} className="ipo-card" onClick={() => setAppModal(a)}>
                      <div className="ipo-card-top">
                        <div className="ipo-card-title">
                          <div className="font-semibold">{a.ipo_name}</div>
                          <div className="ipo-card-sub">{a.applicant_name} · {bankOf(a)}</div>
                        </div>
                        <span className={`badge ${IPO_STATUS[a.status].badge}`}>{IPO_STATUS[a.status].label}</span>
                        <div onClick={e => e.stopPropagation()}>
                          <ActionMenu id={`ipo-m-${a._id}`} openId={openMenu} onToggle={setOpenMenu} items={menuItems(a)} />
                        </div>
                      </div>
                      <div className="ipo-card-amounts">
                        <div><span>1 lot</span><strong>{fmtCurrency(a.lot_price)}</strong></div>
                        <div><span>Their share</span><strong>{a.profit_share_percent}%</strong></div>
                        <div><span>Sell price</span><strong>{a.sell_price !== null ? fmtCurrency(a.sell_price) : '—'}</strong></div>
                        <div><span>My ₹</span><strong className={tone(a.my_share)}>{signed(a.my_share)}</strong></div>
                      </div>
                      <div className="ipo-card-foot">
                        <span>Allotted</span>
                        <AllottedSwitch app={a} busy={busyId === a._id} onToggle={toggleAllotted} />
                        {a.profit !== null && <span className="ipo-card-split">Profit {signed(a.profit)} · Their {fmtCurrency(a.their_share)}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {applicantModal && (
        <IpoApplicantModal
          editApplicant={applicantModal._id ? applicantModal : null}
          accounts={accounts}
          onAccountAdded={addAccount}
          onClose={() => setApplicantModal(null)}
          onSaved={saved => { if (!applicantModal._id) setSearchParams({ applicant: saved._id }); load(); }}
        />
      )}
      {appModal && (
        <IpoApplicationModal
          editApp={appModal._id ? appModal : null}
          applicants={applicants}
          accounts={accounts}
          onAccountAdded={addAccount}
          ipoNames={ipoNames}
          defaults={defaults}
          lastBankFor={lastBankFor}
          presetApplicantId={applicantId}
          onAddApplicant={() => { setAppModal(null); setApplicantModal({}); }}
          onClose={() => setAppModal(null)}
          onSaved={() => load()}
        />
      )}
      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}

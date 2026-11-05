import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, Plus, Pencil, Trash2, Landmark, ArrowDownLeft, ArrowUpRight, ChartCandlestick, UserPlus, Check, X } from 'lucide-react';
import {
  getBankAccounts, getBankAccountSummary, getPersonBankSummary, deleteBankAccount, renameBankHolder, updateOrder,
} from '../api';
import { fmtCurrency, fmtDisplay, fmtSignedCurrency } from '../utils/formatters';
import { IPO_STATUS } from '../utils/ipo';
import DateRangeDropdown from '../common/DateRangeDropdown';
import ConfirmModal from '../common/ConfirmModal';
import BankAccountModal from '../components/BankAccountModal';

const day = (d) => (d ? fmtDisplay(String(d).slice(0, 10)) : '');
const key = (name) => String(name || '').trim().toLowerCase();
const bankShort = (a) => `${a.bank_name}${a.account_last4 ? ` ••${a.account_last4}` : ''}`;

/**
 * Bank accounts grouped by person. A person's page shows one card per bank
 * (received / advanced / to return); picking a card narrows the panels below
 * to that account. Received from buyers and advanced to cards stay separate.
 */
export default function BankAccountsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [personSummary, setPersonSummary] = useState(null);
  const [accountSummary, setAccountSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [range, setRange] = useState({ from: '', to: '', preset: '' });
  const [editing, setEditing] = useState(null);   // { account } | { holder } | {}
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [renaming, setRenaming] = useState(null); // draft name

  // People = accounts grouped by holder name
  const people = useMemo(() => {
    const map = new Map();
    for (const a of accounts) {
      const k = key(a.holder_name);
      if (!map.has(k)) map.set(k, { name: a.holder_name, accounts: [] });
      map.get(k).accounts.push(a);
    }
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
  }, [accounts]);

  const person = people.find(p => key(p.name) === key(searchParams.get('person'))) || people[0] || null;
  const accountId = searchParams.get('account') || '';
  const account = person?.accounts.find(a => a._id === accountId) || null;
  const summary = account ? accountSummary : personSummary;

  const go = (p, accId) => setSearchParams(accId ? { person: p.name, account: accId } : { person: p.name });

  const loadAccounts = useCallback(async () => {
    try { setAccounts(await getBankAccounts()); } catch { toast.error('Failed to load bank accounts'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const personName = person?.name || '';
  const loadSummaries = useCallback(async () => {
    if (!personName) { setPersonSummary(null); setAccountSummary(null); return; }
    const params = { from_date: range.from || undefined, to_date: range.to || undefined };
    setSummaryLoading(true);
    try {
      const [ps, as] = await Promise.all([
        getPersonBankSummary(personName, params),
        accountId ? getBankAccountSummary(accountId, params) : Promise.resolve(null),
      ]);
      setPersonSummary(ps);
      setAccountSummary(as);
    } catch {
      toast.error('Failed to load accounts');
    } finally {
      setSummaryLoading(false);
    }
  }, [personName, accountId, range.from, range.to]);
  useEffect(() => { loadSummaries(); }, [loadSummaries]);

  const refresh = () => Promise.all([loadAccounts(), loadSummaries()]);

  const toggleReturned = async (adv) => {
    setBusyId(adv.order_id);
    try {
      await updateOrder(adv.order_id, { card_advance_returned: !adv.returned });
      toast.success(adv.returned ? 'Marked not returned' : `${fmtCurrency(adv.amount)} marked returned`);
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setBusyId(null);
    }
  };

  const removeAccount = async (acc) => {
    setConfirm(null);
    try {
      await deleteBankAccount(acc._id);
      toast.success('Bank account deleted');
      const rest = person.accounts.filter(a => a._id !== acc._id);
      setSearchParams(rest.length ? { person: person.name } : {});
      loadAccounts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const saveRename = async () => {
    const to = (renaming || '').trim();
    if (!to || to === person.name) { setRenaming(null); return; }
    try {
      await renameBankHolder(person.name, to);
      toast.success(`Renamed to ${to}`);
      setRenaming(null);
      setSearchParams(accountId ? { person: to, account: accountId } : { person: to });
      loadAccounts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rename');
    }
  };

  const perBank = personSummary?.accounts || [];
  const showBank = !account && (person?.accounts.length || 0) > 1;
  const received = summary?.received;
  const advanced = summary?.advanced;
  const periodNote = range.from || range.to ? ' for this period' : '';

  return (
    <>
      <div className="page-hero">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button className="btn-back-circle" onClick={() => navigate(-1)} data-tooltip="Back"><ChevronLeft size={22} /></button>
            <div className="page-hero-title-group">
              <h1 className="page-hero-title">Bank Accounts</h1>
              <span className="page-hero-subtitle">Each person's accounts: received from buyers, advanced to cards and used for IPOs — kept separate</span>
            </div>
          </div>
          <div className="page-hero-actions">
            <button className="btn btn-primary" onClick={() => setEditing({})}><UserPlus size={16} /> Add Person</button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="shimmer" style={{ height: 260, borderRadius: 'var(--radius)' }} />
        ) : people.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-icon"><Landmark size={32} /></div>
            <div className="empty-title">No bank accounts yet</div>
            <div className="empty-sub">Add a person and their bank accounts: where buyers pay you, which account pays a card in advance, and which bank an IPO is applied from.</div>
            <div className="empty-cta"><button className="btn btn-primary" onClick={() => setEditing({})}><UserPlus size={16} /> Add First Person</button></div>
          </div>
        ) : (
          <>
            {/* People */}
            <div className="tab-strip">
              {people.map(p => (
                <button key={key(p.name)} className={`tab-btn ${person && key(p.name) === key(person.name) ? 'is-active' : ''}`} onClick={() => go(p)}>
                  {p.name} <span className="tab-btn-count">{p.accounts.length}</span>
                </button>
              ))}
              <button className="tab-btn tab-btn-add" onClick={() => setEditing({})}><UserPlus size={14} /> Add person</button>
            </div>

            {person && (
              <div className="bank-person-bar">
                <div className="bank-person-name">
                  {renaming !== null ? (
                    <form className="bank-rename" onSubmit={e => { e.preventDefault(); saveRename(); }}>
                      <input className="form-input" value={renaming} onChange={e => setRenaming(e.target.value)} autoFocus aria-label="New name" />
                      <button type="submit" className="icon-btn" aria-label="Save name"><Check size={16} /></button>
                      <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setRenaming(null)}><X size={16} /></button>
                    </form>
                  ) : (
                    <>
                      <h2>{person.name}</h2>
                      <button className="icon-btn" onClick={() => setRenaming(person.name)} aria-label="Rename person" title="Rename"><Pencil size={14} /></button>
                    </>
                  )}
                </div>
                <div className="bank-head-actions">
                  <DateRangeDropdown
                    dateFrom={range.from}
                    dateTo={range.to}
                    activePreset={range.preset}
                    onChange={(from, to, preset) => setRange({ from: from || '', to: to || '', preset: preset || '' })}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ holder: person.name })}><Plus size={14} /> Add account</button>
                </div>
              </div>
            )}

            {/* One card per bank */}
            {person && (
              <div className="bank-acc-grid">
                <button className={`bank-acc-card is-all ${!account ? 'is-active' : ''}`} onClick={() => go(person)}>
                  <span className="bank-acc-name">All accounts</span>
                  <span className="bank-acc-sub">{person.accounts.length} bank{person.accounts.length > 1 ? 's' : ''}</span>
                  <div className="bank-acc-nums">
                    <div><span>Received</span><strong className="text-success">{fmtCurrency(personSummary?.received.total || 0)}</strong></div>
                    <div><span>Advanced</span><strong>{fmtCurrency(personSummary?.advanced.total || 0)}</strong></div>
                    <div><span>To return</span><strong className={personSummary?.advanced.to_return ? 'text-amber' : ''}>{fmtCurrency(personSummary?.advanced.to_return || 0)}</strong></div>
                    <div><span>IPO</span><strong>{fmtCurrency(personSummary?.ipo.invested || 0)}</strong></div>
                  </div>
                </button>
                {person.accounts.map(a => {
                  const n = perBank.find(x => x._id === a._id) || {};
                  const active = account?._id === a._id;
                  return (
                    <div key={a._id} className={`bank-acc-card ${active ? 'is-active' : ''}`} role="button" tabIndex={0}
                      onClick={() => go(person, a._id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(person, a._id); } }}
                    >
                      <span className="bank-acc-name"><Landmark size={14} /> {bankShort(a)}</span>
                      <span className="bank-acc-sub">{a.usage_count > 0 ? `${a.usage_count} linked entr${a.usage_count > 1 ? 'ies' : 'y'}` : 'Not used yet'}</span>
                      <div className="bank-acc-nums">
                        <div><span>Received</span><strong className="text-success">{fmtCurrency(n.received || 0)}</strong></div>
                        <div><span>Advanced</span><strong>{fmtCurrency(n.advanced || 0)}</strong></div>
                        <div><span>To return</span><strong className={n.to_return ? 'text-amber' : ''}>{fmtCurrency(n.to_return || 0)}</strong></div>
                        <div><span>IPO</span><strong>{fmtCurrency(n.ipo_invested || 0)}</strong></div>
                      </div>
                      {active && (
                        <div className="bank-acc-actions" onClick={e => e.stopPropagation()}>
                          <button className="icon-btn" onClick={() => setEditing({ account: a })} aria-label="Edit account" title="Edit"><Pencil size={14} /></button>
                          <button
                            className="icon-btn"
                            onClick={() => setConfirm(a)}
                            disabled={a.usage_count > 0}
                            aria-label="Delete account"
                            title={a.usage_count > 0 ? 'In use — change those payments, orders and IPOs first' : 'Delete'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}


            {summaryLoading && !summary ? (
              <div className="shimmer" style={{ height: 260, borderRadius: 'var(--radius)' }} />
            ) : summary && (
              <div className={`bank-panels ${summaryLoading ? 'is-loading' : ''}`}>
                {/* ── Amount Received ── */}
                <section className="bank-panel">
                  <header className="bank-panel-head">
                    <span className="bank-panel-icon is-in"><ArrowDownLeft size={16} /></span>
                    <div>
                      <h2>Amount Received</h2>
                      <p>From buyers into {account ? bankShort(account) : `${person.name}'s accounts`}</p>
                    </div>
                    <strong className="bank-panel-total text-success">{fmtCurrency(received.total)}</strong>
                  </header>

                  {received.by_seller.length === 0 ? (
                    <div className="bank-empty">No buyer payments recorded here{periodNote}. Pick the account under “Received in” when you add a buyer payment.</div>
                  ) : (
                    <>
                      <div className="bank-sub-title">By buyer</div>
                      <ul className="bank-rows">
                        {received.by_seller.map(r => (
                          <li key={String(r.seller_id)} className="bank-row" onClick={() => navigate(`/sellers/${r.seller_id}/ledger`)}>
                            <div className="bank-row-main">
                              <strong>{r.name}</strong>
                              <span>{r.count} payment{r.count > 1 ? 's' : ''} · last {day(r.last_date)}</span>
                            </div>
                            <div className="bank-row-bar" aria-hidden="true">
                              <span style={{ width: `${Math.max(4, (r.amount / received.total) * 100)}%` }} />
                            </div>
                            <strong className="bank-row-amt">{fmtCurrency(r.amount)}</strong>
                          </li>
                        ))}
                      </ul>

                      <div className="bank-sub-title">Payments</div>
                      <ul className="bank-list-plain">
                        {received.payments.map(p => (
                          <li key={p._id}>
                            <span className="bank-date">{day(p.payment_date)}</span>
                            <span className="bank-who">
                              {p.seller_name}
                              {showBank && p.bank_label && <span className="bank-tag">{p.bank_label.split(' · ').slice(1).join(' · ')}</span>}
                              {p.notes ? <em> · {p.notes}</em> : null}
                            </span>
                            <strong>{fmtCurrency(p.amount)}</strong>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>

                {/* ── Amount Advanced ── */}
                <section className="bank-panel">
                  <header className="bank-panel-head">
                    <span className="bank-panel-icon is-out"><ArrowUpRight size={16} /></span>
                    <div>
                      <h2>Amount Advanced</h2>
                      <p>Paid to credit cards in advance for orders</p>
                    </div>
                    <strong className="bank-panel-total">{fmtCurrency(advanced.total)}</strong>
                  </header>

                  {advanced.items.length === 0 ? (
                    <div className="bank-empty">No card advances from here{periodNote}. In an order, choose “Paid the card in advance? → Yes” and pick the account.</div>
                  ) : (
                    <>
                      <div className="bank-adv-kpis">
                        <div><span>To return</span><strong className="text-amber">{fmtCurrency(advanced.to_return)}</strong><em>{advanced.to_return_count} order{advanced.to_return_count !== 1 ? 's' : ''}</em></div>
                        <div><span>Returned</span><strong className="text-success">{fmtCurrency(advanced.returned)}</strong><em>{advanced.count - advanced.to_return_count} order{advanced.count - advanced.to_return_count !== 1 ? 's' : ''}</em></div>
                      </div>

                      <div className="bank-sub-title">By buyer</div>
                      <ul className="bank-rows">
                        {advanced.by_seller.map(r => (
                          <li key={String(r.seller_id)} className="bank-row is-static">
                            <div className="bank-row-main">
                              <strong>{r.name}</strong>
                              <span>{r.count} order{r.count > 1 ? 's' : ''}{r.to_return > 0 ? ` · ${fmtCurrency(r.to_return)} to return` : ' · all returned'}</span>
                            </div>
                            <strong className="bank-row-amt">{fmtCurrency(r.amount)}</strong>
                          </li>
                        ))}
                      </ul>

                      <div className="bank-sub-title">Advances</div>
                      <ul className="bank-adv-list">
                        {advanced.items.map(a => (
                          <li key={a.order_id} className={`bank-adv ${a.returned ? 'is-returned' : ''}`}>
                            <div className="bank-adv-main">
                              <strong>{a.seller_name}</strong>
                              <span>{a.item} · {day(a.order_date)}</span>
                              <span className="bank-adv-card">
                                Card {a.card_label}{a.card_holder ? ` · ${a.card_holder}` : ''}
                                {showBank && a.bank_label && <> · from {a.bank_label.split(' · ').slice(1).join(' · ')}</>}
                              </span>
                            </div>
                            <div className="bank-adv-side">
                              <strong>{fmtCurrency(a.amount)}</strong>
                              <span className="bank-adv-toggle">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={a.returned}
                                  aria-label={a.returned ? 'Returned to account' : 'Not returned yet'}
                                  className={`ipo-switch ${a.returned ? 'is-on' : ''}`}
                                  disabled={busyId === a.order_id}
                                  onClick={() => toggleReturned(a)}
                                >
                                  <span className="ipo-switch-knob" />
                                </button>
                                <span>{a.returned ? 'Returned' : 'To return'}</span>
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>

                {/* ── IPO from this account ── */}
                <section className="bank-panel bank-panel-wide">
                  <header className="bank-panel-head">
                    <span className="bank-panel-icon is-ipo"><ChartCandlestick size={16} /></span>
                    <div>
                      <h2>IPO</h2>
                      <p>Applied from {account ? bankShort(account) : `${person.name}'s accounts`}</p>
                    </div>
                    <button className="btn btn-ghost btn-sm bank-panel-link" onClick={() => navigate('/ipo')}>Open IPO</button>
                  </header>

                  {summary.ipo.applications === 0 ? (
                    <div className="bank-empty">No IPOs applied from here{periodNote}. Pick this account when you apply an IPO.</div>
                  ) : (
                    <>
                      <div className="bank-ipo-kpis">
                        <div><span>Applied</span><strong>{summary.ipo.applications}</strong><em>{summary.ipo.allotted} allotted</em></div>
                        <div><span>Used on allotted lots</span><strong>{fmtCurrency(summary.ipo.invested)}</strong><em>{summary.ipo.awaiting_sale} awaiting sale</em></div>
                        <div><span>Profit</span><strong className={summary.ipo.profit >= 0 ? 'text-success' : 'text-danger'}>{fmtSignedCurrency(summary.ipo.profit)}</strong><em>{summary.ipo.sold} sold</em></div>
                        <div><span>My share</span><strong className={summary.ipo.my_share >= 0 ? 'text-success' : 'text-danger'}>{fmtSignedCurrency(summary.ipo.my_share)}</strong><em>Their {fmtCurrency(summary.ipo.their_share)}</em></div>
                      </div>
                      <ul className="bank-ipo-list">
                        {summary.ipo.items.map(i => (
                          <li key={i._id} className="bank-ipo-row">
                            <div className="bank-adv-main">
                              <strong>{i.ipo_name}</strong>
                              <span>
                                {i.applicant_name} · {day(i.applied_at)}
                                {showBank && i.bank_label && <> · {i.bank_label.split(' · ').slice(1).join(' · ')}</>}
                              </span>
                            </div>
                            <span className={`badge ${IPO_STATUS[i.status].badge}`}>{IPO_STATUS[i.status].label}</span>
                            <div className="bank-ipo-nums">
                              <div><span>1 lot</span><strong>{fmtCurrency(i.lot_price)}</strong></div>
                              <div><span>Sell</span><strong>{i.sell_price !== null ? fmtCurrency(i.sell_price) : '—'}</strong></div>
                              <div><span>My share</span><strong className={i.my_share === null ? '' : i.my_share >= 0 ? 'text-success' : 'text-danger'}>{i.my_share === null ? '—' : fmtSignedCurrency(i.my_share)}</strong></div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>

      {editing && (
        <BankAccountModal
          editAccount={editing.account || null}
          defaultHolder={editing.holder || ''}
          lockHolder={Boolean(editing.holder)}
          holders={people.map(p => p.name)}
          onClose={() => setEditing(null)}
          onSaved={saved => { setSearchParams({ person: saved.holder_name, account: saved._id }); refresh(); }}
        />
      )}
      {confirm && (
        <ConfirmModal title="Delete bank account" message={`Delete ${confirm.label}?`} onConfirm={() => removeAccount(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { BookOpen, ArrowDownLeft, Phone, Users, ArrowUpRight, HandCoins, Wallet, UserPlus } from 'lucide-react';
import { getPeople } from '../api';
import { fmtCurrency } from '../utils/formatters';
import PersonAvatar from './PersonAvatar';
import BookerPaymentModal from './BookerPaymentModal';
import AddPersonModal from './AddPersonModal';
import ActionMenu from '../common/ActionMenu';

const balanceLabel = (p) =>
  p.pending_dues > 0 ? `You'll give ${fmtCurrency(p.pending_dues)}`
    : p.pending_dues < 0 ? `Advance ${fmtCurrency(-p.pending_dues)}`
      : 'Settled';

/**
 * "Bookers" tab of the Khata Book page: every friend with their khata
 * balance. Data comes from GET /api/people (all-time khata totals), the same
 * source as each booker's own Khata tab.
 */
export default function BookersKhataList() {
  const navigate = useNavigate();
  const [bookers, setBookers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payFor, setPayFor] = useState(null);
  const [adding, setAdding] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);

  const load = useCallback(async () => {
    try {
      setBookers(await getPeople({ relation: 'friend' }));
    } catch {
      toast.error('Failed to load bookers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = bookers.reduce((t, p) => ({
    due: t.due + (p.total_due || 0),
    paid: t.paid + (p.total_paid || 0),
    // You'll give = positive balances only; advances held are listed separately
    balance: t.balance + Math.max(0, p.pending_dues || 0),
    advance: t.advance + Math.max(0, -(p.pending_dues || 0)),
  }), { due: 0, paid: 0, balance: 0, advance: 0 });

  const openKhata = (p) => navigate(`/people/${p._id}?tab=khata`);

  if (loading) {
    return <div className="shimmer" style={{ height: 220, borderRadius: 'var(--radius)' }} />;
  }

  if (bookers.length === 0) {
    return (
      <div className="empty-state-card">
        <div className="empty-icon empty-icon-sellers"><Users size={32} /></div>
        <div className="empty-title">No bookers yet</div>
        <div className="empty-sub">Add a friend as a booker. Their khata (orders owed, advances, payments) appears here automatically.</div>
        <div className="empty-cta">
          <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={16} /> Add Booker</button>
        </div>
        {adding && <AddPersonModal defaultRelation="friend" onClose={() => setAdding(false)} onSuccess={load} />}
      </div>
    );
  }

  return (
    <>
      <div className="khata-summary">
        <div className="khata-sum-cell">
          <span><ArrowUpRight size={13} /> Owed (delivered)</span>
          <strong>{fmtCurrency(totals.due)}</strong>
        </div>
        <div className="khata-sum-cell">
          <span><HandCoins size={13} /> Paid (adv. + payments)</span>
          <strong>{fmtCurrency(totals.paid)}</strong>
        </div>
        <div className={`khata-sum-cell khata-sum-balance ${totals.balance > 0 ? 'is-due' : ''}`}>
          <span><Wallet size={13} /> You'll give (total)</span>
          <strong>{totals.balance > 0 ? fmtCurrency(totals.balance) : 'Settled'}</strong>
          {totals.advance > 0 && <em className="khata-sum-sub">+ {fmtCurrency(totals.advance)} advance with bookers</em>}
        </div>
        <div className="khata-sum-cell">
          <span><Users size={13} /> Bookers</span>
          <strong>{bookers.length}</strong>
        </div>
      </div>

      <div className="khata-list">
        {bookers.map(p => (
          <div key={p._id} className="khata-row booker-khata-row" onClick={() => openKhata(p)}>
            <PersonAvatar person={p} size={36} />
            <div className="khata-main">
              <div className="khata-desc">{p.name}</div>
              <div className="khata-sub">
                {p.phone ? <><Phone size={11} style={{ verticalAlign: '-1px' }} /> {p.phone} · </> : ''}
                Owed {fmtCurrency(p.total_due)} · Paid {fmtCurrency(p.total_paid)}
              </div>
            </div>
            <div className="khata-amt">
              <div className={`khata-amount ${p.pending_dues > 0 ? 'is-owed' : 'is-paid'}`}>{balanceLabel(p)}</div>
              <div className="khata-bal">{p.delivered_count} delivered · {p.pending_count} pending</div>
            </div>
            <div className="khata-row-actions" onClick={e => e.stopPropagation()}>
              <button className="btn btn-primary btn-sm" onClick={() => setPayFor(p)}>
                <ArrowDownLeft size={14} /> Pay
              </button>
              <ActionMenu
                id={p._id}
                openId={openMenu}
                onToggle={setOpenMenu}
                items={[
                  { label: 'View Khata', icon: <BookOpen size={14} />, color: 'var(--info)', onClick: () => openKhata(p) },
                  { label: 'Orders', icon: <ArrowUpRight size={14} />, onClick: () => navigate(`/people/${p._id}?tab=orders`) },
                ]}
              />
            </div>
          </div>
        ))}
      </div>

      {payFor && (
        <BookerPaymentModal
          person={payFor}
          balance={payFor.pending_dues}
          onClose={() => setPayFor(null)}
          onSuccess={load}
        />
      )}
    </>
  );
}

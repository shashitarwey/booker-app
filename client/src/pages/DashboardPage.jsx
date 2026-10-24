import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, UserPlus, CreditCard, ShoppingBag, ArrowUpRight, Wallet, TrendingUp, Package, HandCoins, Phone, BookOpen } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import useSummary from '../hooks/useSummary';
import { getPeople, getAllSellers } from '../api';
import { useAuth } from '../context/AuthContext';
import { RELATIONS } from '../constants';
import { fmtCurrency, fmtSignedCurrency, profitColor } from '../utils/formatters';
import { profitPercent } from '../utils/profit';
import DateRangeDropdown from '../common/DateRangeDropdown';
import TransactionsTableView from '../components/TransactionsTableView';
import AddCardModal from '../components/AddCardModal';
import AddPersonModal from '../components/AddPersonModal';
import AddOrderModal from '../components/AddOrderModal';
import PersonAvatar from '../components/PersonAvatar';
import BookerStats from '../components/BookerStats';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const holderIdOf = (card) => String(card.holder_id?._id || card.holder_id || '');

function BookerCard({ person, cards, onOpen, onAddOrder, onAddCard }) {
  const relation = RELATIONS[person.relation];
  const spend = cards.reduce((s, c) => s + (c.total_spend || 0), 0);
  const addonCount = cards.filter(c => c.card_type === 'addon').length;
  const primaryCount = cards.length - addonCount;

  return (
    <article className="booker-card" onClick={() => onOpen(person)}>
      <header className="booker-card-head">
        <PersonAvatar person={person} size={44} />
        <div className="booker-card-id">
          <div className="booker-card-name">{person.name}{person.relation === 'self' ? ' (You)' : ''}</div>
          <div className="booker-card-sub">
            <span className="relation-dot" style={{ background: relation?.color }} />
            {person.relation === 'friend' ? 'Booker' : relation?.label}
            {person.phone && <><span className="dot-sep">·</span><Phone size={11} /> {person.phone}</>}
          </div>
        </div>
        <ArrowUpRight size={18} className="booker-card-arrow" />
      </header>

      <BookerStats person={person} />

      <div className="booker-card-cards">
        {cards.length === 0 ? (
          <button className="booker-card-empty" onClick={e => { e.stopPropagation(); onAddCard(person); }}>
            <Plus size={14} /> Add first card
          </button>
        ) : (
          <div className="booker-card-count">
            <CreditCard size={15} />
            <span className="booker-card-count-total">{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
            <span className="booker-card-count-split">
              {[primaryCount && `${primaryCount} Primary`, addonCount && `${addonCount} Add-on`].filter(Boolean).join(' · ')}
            </span>
            <span className="booker-card-count-spend">Spend {fmtCurrency(spend)}</span>
          </div>
        )}
      </div>

      <footer className="booker-card-actions" onClick={e => e.stopPropagation()}>
        <button className="btn btn-secondary btn-sm" onClick={() => onOpen(person, 'orders')}>
          <ShoppingBag size={14} /> Orders
        </button>
        {person.relation === 'friend' ? (
          <button className="btn btn-secondary btn-sm" onClick={() => onOpen(person, 'khata')}>
            <BookOpen size={14} /> Khata
          </button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => onOpen(person)}>
            <CreditCard size={14} /> Cards
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => onAddOrder(person)} disabled={cards.length === 0}
          title={cards.length === 0 ? 'Add a card first' : undefined}>
          <Plus size={14} /> Order
        </button>
      </footer>
    </article>
  );
}

function Kpi({ icon: Icon, label, value, sub, color, tone }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <div className="kpi-icon"><Icon size={18} /></div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { initialLoad, dateFrom, dateTo, activePreset, setRange, resetRange, refresh, allCards, cardsByBank } = useSummary();

  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [sellers, setSellers] = useState(null);
  const [modal, setModal] = useState(null); // { type: 'person' | 'card' | 'order', person? }

  const loadPeople = useCallback(async () => {
    try {
      setPeople(await getPeople({ from_date: dateFrom, to_date: dateTo }));
    } catch {
      toast.error('Failed to load bookers');
    } finally {
      setPeopleLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadPeople(); }, [loadPeople]);

  // Card / bank transaction drill-down (linked from card widgets) stays on the dashboard URL
  const detailsView = useMemo(() => {
    if (initialLoad) return null;
    const viewType = searchParams.get('view');
    if (viewType === 'bank') {
      const bName = searchParams.get('bankName');
      if (bName && cardsByBank[bName]) return { type: 'bank', bankName: bName };
    } else if (viewType === 'card') {
      const c = allCards.find(card => card._id === searchParams.get('viewCardId'));
      if (c) return { type: 'card', card: c };
    }
    return null;
  }, [searchParams, initialLoad, cardsByBank, allCards]);

  const cardsByPerson = useMemo(() => {
    const map = {};
    for (const c of allCards) (map[holderIdOf(c)] ||= []).push(c);
    return map;
  }, [allCards]);

  const bookers = people.filter(p => p.relation === 'friend');
  const family = people.filter(p => p.relation !== 'friend');

  const totals = useMemo(() => {
    const t = { total_order_amount: 0, my_profit: 0, order_count: 0, delivered_count: 0, pending_count: 0, pending_dues: 0 };
    for (const p of people) for (const k of Object.keys(t)) t[k] += p[k] || 0;
    // Owed to bookers = sum of positive balances only (an advance with one
    // booker doesn't reduce what you owe another)
    t.pending_dues = people.reduce((s, p) => s + Math.max(0, p.pending_dues || 0), 0);
    t.advance_with_bookers = people.reduce((s, p) => s + Math.max(0, -(p.pending_dues || 0)), 0);
    t.spend = allCards.reduce((s, c) => s + (c.total_spend || 0), 0);
    return t;
  }, [people, allCards]);

  const openPerson = (p, tab) => navigate(`/people/${p._id}${tab ? `?tab=${tab}` : ''}`);

  const openAddOrder = async (person) => {
    if (!sellers) {
      try { setSellers(await getAllSellers()); }
      catch { toast.error('Failed to load buyers'); return; }
    }
    setModal({ type: 'order', person });
  };

  const afterChange = () => { refresh(); loadPeople(); };

  if (detailsView) {
    return (
      <main className="main-content">
        <TransactionsTableView
          view={detailsView}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onBack={() => { resetRange(); navigate({ search: '' }); }}
          onRefreshSummary={refresh}
          cardsForBank={detailsView.type === 'bank' ? cardsByBank[detailsView.bankName] : []}
        />
      </main>
    );
  }

  const loading = initialLoad || peopleLoading;
  const firstName = (user?.name || '').split(' ')[0];

  const renderSection = (title, subtitle, list, emptyCta, action = null) => (
    <section className="dash-section">
      <div className="dash-section-head">
        <div>
          <h2 className="dash-section-title">{title} <span className="dash-section-count">{list.length}</span></h2>
          <p className="dash-section-sub">{subtitle}</p>
        </div>
        {action}
      </div>
      {loading ? (
        <div className="booker-grid">
          {[1, 2].map(i => <div key={i} className="shimmer booker-card-shimmer" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="dash-empty">{emptyCta}</div>
      ) : (
        <div className="booker-grid">
          {list.map(p => (
            <BookerCard
              key={p._id}
              person={p}
              cards={cardsByPerson[p._id] || []}
              onOpen={openPerson}
              onAddOrder={openAddOrder}
              onAddCard={person => setModal({ type: 'card', person })}
            />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <main className="dash">
      <div className="dash-header">
        <div>
          <p className="dash-eyebrow">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
          <h1 className="dash-title">Your bookers at a glance</h1>
        </div>
        <div className="dash-header-actions">
          <DateRangeDropdown dateFrom={dateFrom} dateTo={dateTo} activePreset={activePreset} onChange={setRange} />
          <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'card' })}>
            <CreditCard size={14} /> Add Card
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'person', relation: 'friend' })}>
            <UserPlus size={14} /> Add Booker
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <Kpi icon={Package} tone="violet" label="Total Order Amount" value={fmtCurrency(totals.total_order_amount)}
          sub={`${totals.order_count} orders · ${totals.delivered_count} delivered · ${totals.pending_count} pending`} />
        <Kpi icon={TrendingUp} tone="green" label="Profit" value={fmtSignedCurrency(totals.my_profit)} color={profitColor(totals.my_profit)}
          sub={`${profitPercent(totals).toFixed(2)}% of order amount`} />
        <Kpi icon={HandCoins} tone="amber" label="Pending Dues to Bookers" value={fmtCurrency(totals.pending_dues)}
          sub={totals.advance_with_bookers > 0
            ? `Plus ${fmtCurrency(totals.advance_with_bookers)} advance with bookers`
            : 'Khata balance: owed on delivered orders − advances − payments'} />
        <Kpi icon={Wallet} tone="teal" label="Card Spend" value={fmtCurrency(totals.spend)}
          sub={`${allCards.length} cards across ${people.length} people`} />
      </div>

      {renderSection(
        'Bookers',
        'Friends booking orders on their cards for you',
        bookers,
        <>
          <div className="dash-empty-title">No bookers yet</div>
          <div className="dash-empty-sub">Add a friend, then their cards, to start tracking orders they book for you.</div>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'person', relation: 'friend' })}>
            <UserPlus size={14} /> Add Booker
          </button>
        </>
      )}

      {renderSection(
        'Me & Family',
        'Your own and family cards — full profit is yours',
        family,
        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ type: 'person', relation: 'family' })}>
          <UserPlus size={14} /> Add Family Member
        </button>,
        family.length > 1 && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/people/family')}>
            View family together <ArrowUpRight size={14} />
          </button>
        )
      )}

      {modal?.type === 'person' && (
        <AddPersonModal
          defaultRelation={modal.relation}
          onClose={() => setModal(null)}
          onSuccess={loadPeople}
        />
      )}
      {modal?.type === 'card' && (
        <AddCardModal
          defaultHolderId={modal.person?._id || ''}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); afterChange(); toast.success('Card saved!'); }}
        />
      )}
      {modal?.type === 'order' && (
        <AddOrderModal
          cards={cardsByPerson[modal.person._id] || []}
          sellers={sellers || []}
          onClose={() => setModal(null)}
          onSuccess={afterChange}
        />
      )}
    </main>
  );
}

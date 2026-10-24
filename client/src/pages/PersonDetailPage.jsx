import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ChevronLeft, CreditCard, ShoppingBag, Plus, Pencil, Phone, FileText, BookOpen, Home, Trash2, UserPlus } from 'lucide-react';
import { getPeople, getPerson, deleteCard, deletePerson } from '../api';
import { RELATIONS } from '../constants';
import { fmtCurrency } from '../utils/formatters';
import useSummary from '../hooks/useSummary';
import CardWidget from '../components/CardWidget';
import AddCardModal from '../components/AddCardModal';
import AddTransactionModal from '../components/AddTransactionModal';
import AddPersonModal from '../components/AddPersonModal';
import PersonAvatar from '../components/PersonAvatar';
import BookerStats from '../components/BookerStats';
import DateRangeDropdown from '../common/DateRangeDropdown';
import ConfirmModal from '../common/ConfirmModal';
import OrdersPage from './OrdersPage';
import BookerKhata from '../components/BookerKhata';
import BankSection from '../components/BankSection';
import { bankRows } from '../utils/bankSpend';

// Route id for the combined self + family view (/people/family). The server
// accepts the same value for ?person_id= (orders) and ?holder_id= (cards).
const FAMILY_ID = 'family';
const holderIdOf = (card) => String(card.holder_id?._id || card.holder_id || '');
const isFamilyRel = (p) => Boolean(p) && p.relation !== 'friend';

// Sum the per-person stats of every self/family member into one "Family" row
const FAMILY_STAT_KEYS = ['card_count', 'order_count', 'delivered_count', 'pending_count', 'total_order_amount', 'my_profit'];
const buildFamilyGroup = (members) => {
  const g = { _id: FAMILY_ID, name: 'Family', relation: 'family', isGroup: true, members: members.length };
  for (const k of FAMILY_STAT_KEYS) g[k] = members.reduce((s, p) => s + (p[k] || 0), 0);
  return g;
};

/**
 * Person workspace.
 *  - Top strip: one "Family" chip (self + family) and one chip per booker.
 *  - /people/family: combined family view; member pills drill into one member.
 *  - /people/:id: a single member or booker (bookers also get the Khata tab).
 */
export default function PersonDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isGroup = id === FAMILY_ID;

  const [people, setPeople] = useState([]);
  const [single, setSingle] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [editCard, setEditCard] = useState(null);
  const [txCard, setTxCard] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [editingPerson, setEditingPerson] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);

  const familyMembers = useMemo(() => people.filter(isFamilyRel), [people]);
  const bookers = useMemo(() => people.filter(p => p.relation === 'friend'), [people]);
  const familyIds = useMemo(() => new Set(familyMembers.map(p => p._id)), [familyMembers]);

  const person = isGroup ? (people.length ? buildFamilyGroup(familyMembers) : null) : single;
  const inFamily = isGroup || isFamilyRel(single);
  const requestedTab = searchParams.get('tab');
  const tab = requestedTab === 'orders' ? 'orders'
    : requestedTab === 'khata' && person?.relation === 'friend' ? 'khata'
      : 'cards';

  const { initialLoad, dateFrom, dateTo, activePreset, setRange, refresh, allCards } = useSummary();
  const cards = useMemo(
    () => allCards.filter(c => (isGroup ? familyIds.has(holderIdOf(c)) : holderIdOf(c) === id)),
    [allCards, id, isGroup, familyIds]
  );

  const loadPeople = useCallback(() => getPeople().then(setPeople).catch(() => {}), []);

  const refreshPerson = useCallback(async () => {
    if (isGroup) { await loadPeople(); return; }
    try {
      setSingle(await getPerson(id));
      setNotFound(false);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 400) setNotFound(true);
    }
  }, [id, isGroup, loadPeople]);

  useEffect(() => {
    setSingle(null);
    setNotFound(false);
    refreshPerson();
  }, [refreshPerson]);

  useEffect(() => { loadPeople(); }, [loadPeople, single?.name]); // re-sync chips after a rename

  const switchTab = (next) => setSearchParams(next === 'cards' ? {} : { tab: next });
  // Keep the current tab when switching people (Khata only exists for bookers)
  const goTo = (pid, keepTab = tab) => {
    const isBooker = bookers.some(b => b._id === pid);
    const keep = keepTab === 'orders' || (keepTab === 'khata' && isBooker);
    navigate(`/people/${pid}${keep ? `?tab=${keepTab}` : ''}`);
  };

  const handleDeleteCard = (card) => {
    setConfirm({
      message: `Delete ${card.bank_name} ••••${card.last_four_digit}? All transactions on this card will be permanently deleted.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteCard(card._id);
          toast.success('Card deleted');
          refresh();
          refreshPerson();
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to delete card');
        }
      }
    });
  };

  const handleDeletePerson = () => {
    setConfirm({
      title: `Delete ${single.name}?`,
      message: `Delete ${single.name}? This only works once all of their cards are removed.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deletePerson(single._id);
          toast.success(`${single.name} deleted`);
          navigate(`/people/${FAMILY_ID}`);
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to delete');
        }
      }
    });
  };

  if (notFound) {
    return (
      <div className="page-content" style={{ paddingTop: 40 }}>
        <div className="empty-state-card">
          <div className="empty-title">Person not found</div>
          <div className="empty-cta">
            <button className="btn btn-primary" onClick={() => navigate(`/people/${FAMILY_ID}`)}>Back to People</button>
          </div>
        </div>
      </div>
    );
  }

  const relation = person ? RELATIONS[person.relation] : null;
  const periodSpend = cards.reduce((s, c) => s + (c.total_spend || 0), 0);
  const fullFY = String(activePreset || '').startsWith('FY');

  // Family view: cards bucketed under each member (members without cards skipped)
  const cardGroups = isGroup
    ? familyMembers.map(m => ({ member: m, cards: cards.filter(c => holderIdOf(c) === m._id) })).filter(g => g.cards.length)
    : [{ member: null, cards }];

  const renderCard = (card) => (
    <CardWidget
      key={card._id}
      card={card}
      showHolder={false}
      profit={card.order_count > 0 ? card.profit : undefined}
      onAddTx={setTxCard}
      onViewDetails={() => navigate(`/?view=card&viewCardId=${card._id}`)}
      onEdit={c => { setEditCard(c); setShowCardModal(true); }}
      onDelete={handleDeleteCard}
    />
  );

  return (
    <>
      <div className="page-hero" style={{ overflow: 'visible' }}>
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button className="btn-back-circle" onClick={() => navigate('/')} data-tooltip="Dashboard">
              <ChevronLeft size={22} />
            </button>
            {person ? (
              <>
                {isGroup
                  ? <div className="person-avatar family-avatar" style={{ width: 48, height: 48 }}><Home size={22} /></div>
                  : <PersonAvatar person={person} size={48} />}
                <div className="page-hero-title-group">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h1 className="page-hero-title">{person.name}</h1>
                    <span className="relation-badge" style={{ '--tag': relation?.color }}>
                      <span className="relation-dot" style={{ background: relation?.color }} />
                      {isGroup ? `${person.members} member${person.members !== 1 ? 's' : ''}` : person.relation === 'friend' ? 'Booker' : relation?.label}
                    </span>
                  </div>
                  <span className="page-hero-subtitle">
                    {person.card_count} card{person.card_count !== 1 ? 's' : ''} · {person.order_count} order{person.order_count !== 1 ? 's' : ''}
                    {!isGroup && person.phone && <> · <Phone size={11} style={{ verticalAlign: '-1px' }} /> {person.phone}</>}
                  </span>
                </div>
              </>
            ) : (
              <div className="shimmer shimmer-text" style={{ width: 200, height: 32 }} />
            )}
          </div>
          {person && (
            <div className="page-hero-actions">
              {inFamily && (
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(isGroup ? '/reports/spends' : `/reports/spends?person=${person._id}`)}>
                  <FileText size={14} /> ITR Spend Report
                </button>
              )}
              {!isGroup && (
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingPerson(true)}>
                  <Pencil size={14} /> Edit
                </button>
              )}
              {!isGroup && person.relation !== 'self' && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={handleDeletePerson}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="page-content">
        {/* Family as one chip, then a chip per booker */}
        <div className="tab-strip">
          <button className={`tab-btn ${inFamily ? 'is-active' : ''}`} onClick={() => goTo(FAMILY_ID)}>
            <Home size={14} style={{ color: RELATIONS.family.color }} />
            Family <span className="tab-btn-count">{familyMembers.length}</span>
          </button>
          {bookers.length > 0 && <span className="tab-strip-sep" aria-hidden="true" />}
          {bookers.map(p => (
            <button key={p._id} className={`tab-btn ${p._id === id ? 'is-active' : ''}`} onClick={() => goTo(p._id)}>
              <span className="relation-dot" style={{ background: RELATIONS.friend.color }} />
              {p.name}
            </button>
          ))}
          <button className="tab-btn tab-btn-add" onClick={() => setAddingPerson(true)} title="Add a booker or family member">
            <UserPlus size={14} /> Add
          </button>
        </div>

        {/* Inside Family: everyone together, or drill into one member */}
        {inFamily && familyMembers.length > 1 && (
          <div className="member-pills">
            <button className={`member-pill ${isGroup ? 'is-active' : ''}`} onClick={() => goTo(FAMILY_ID)}>All family</button>
            {familyMembers.map(m => (
              <button key={m._id} className={`member-pill ${m._id === id ? 'is-active' : ''}`} onClick={() => goTo(m._id)}>
                {m.relation === 'self' ? `${m.name} (You)` : m.name}
              </button>
            ))}
          </div>
        )}

        {person && (
          <div className="person-stats-panel">
            <BookerStats person={person} variant="tiles" />
          </div>
        )}

        <div className="section-tabs">
          <button className={`section-tab ${tab === 'cards' ? 'is-active' : ''}`} onClick={() => switchTab('cards')}>
            <CreditCard size={16} /> Cards
          </button>
          <button className={`section-tab ${tab === 'orders' ? 'is-active' : ''}`} onClick={() => switchTab('orders')}>
            <ShoppingBag size={16} /> Orders
          </button>
          {person?.relation === 'friend' && (
            <button className={`section-tab ${tab === 'khata' ? 'is-active' : ''}`} onClick={() => switchTab('khata')}>
              <BookOpen size={16} /> Khata
            </button>
          )}
        </div>

        {tab === 'cards' ? (
          <>
            <div className="d-flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <div>
                <span className="bank-total-label">Spend in period:</span>
                <span className="bank-spend">{initialLoad ? '—' : fmtCurrency(periodSpend)}</span>
                <div className="sft-note">
                  Billed = primary cards + linked add-ons · ₹10L SFT limit per bank per FY{fullFY ? '' : ' — pick a financial year for the exact check'}
                </div>
              </div>
              <div className="d-flex" style={{ gap: 10, alignItems: 'center' }}>
                <DateRangeDropdown dateFrom={dateFrom} dateTo={dateTo} activePreset={activePreset} onChange={setRange} />
                <button className="btn btn-primary btn-sm" onClick={() => { setEditCard(null); setShowCardModal(true); }}>
                  <Plus size={14} /> Add Card
                </button>
              </div>
            </div>

            {initialLoad ? (
              <div className="cards-grid">
                {[1, 2].map(i => <div key={i} className="shimmer shimmer-card" />)}
              </div>
            ) : cards.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon">💳</div>
                <div className="empty-title">No cards for {isGroup ? 'your family' : person?.name || 'this person'} yet</div>
                <div className="empty-sub">Add primary or add-on cards to start booking orders on them.</div>
                <div className="empty-cta">
                  <button className="btn btn-primary" onClick={() => { setEditCard(null); setShowCardModal(true); }}>
                    <Plus size={16} /> Add Card
                  </button>
                </div>
              </div>
            ) : (
              cardGroups.map(g => (
                <section key={g.member?._id || 'all'} className={g.member ? 'member-card-group' : undefined}>
                  {g.member && (
                    <div className="member-card-group-head">
                      <button className="member-card-group-name" onClick={() => goTo(g.member._id, 'cards')}>
                        <PersonAvatar person={g.member} size={26} />
                        {g.member.relation === 'self' ? `${g.member.name} (You)` : g.member.name}
                      </button>
                      <span>{g.cards.length} card{g.cards.length !== 1 ? 's' : ''} · Spend {fmtCurrency(g.cards.reduce((s, c) => s + (c.total_spend || 0), 0))}</span>
                    </div>
                  )}
                  {bankRows(g.cards, allCards).map(row => (
                    <BankSection key={row.name} row={row}>{row.cards.map(renderCard)}</BankSection>
                  ))}
                </section>
              ))
            )}
          </>
        ) : tab === 'khata' ? (
          person && <BookerKhata key={id} person={person} onChanged={refreshPerson} />
        ) : (
          person && <OrdersPage key={id} person={person} onChanged={refreshPerson} />
        )}
      </div>

      {showCardModal && (
        <AddCardModal
          editCard={editCard}
          defaultHolderId={isGroup ? '' : id}
          onClose={() => { setShowCardModal(false); setEditCard(null); }}
          onSave={() => {
            setShowCardModal(false);
            setEditCard(null);
            refresh();
            refreshPerson();
            toast.success('Card saved!');
          }}
        />
      )}
      {txCard && (
        <AddTransactionModal
          card={txCard}
          cards={cards}
          onClose={() => setTxCard(null)}
          onSave={() => { setTxCard(null); refresh(); }}
        />
      )}
      {addingPerson && (
        <AddPersonModal
          defaultRelation="friend"
          onClose={() => setAddingPerson(false)}
          onSuccess={(saved) => { loadPeople(); if (saved?._id) navigate(`/people/${saved._id}`); }}
        />
      )}
      {editingPerson && single && (
        <AddPersonModal
          editPerson={single}
          onClose={() => setEditingPerson(false)}
          onSuccess={refreshPerson}
        />
      )}
      {confirm && (
        <ConfirmModal
          title={confirm.title || 'Delete Card?'}
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

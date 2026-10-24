import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { createCard, updateCard, getPeople, getCards } from '../api';
import { BANK_NAMES, CARD_NETWORKS, CASHBACK_PERIODS, MONTHS, ECOMM_SITES, RELATIONS, CARD_TYPES } from '../constants';
import { cardHolderLabel } from '../utils/formatters';
import SearchableDropdown from '../common/SearchableDropdown';

const EMPTY = {
  bank_name: '', card_network: 'Visa', last_four_digit: '', name_on_card: '',
  cashback_enabled: false, cashback_percent: 0, cashback_limit: 0, cashback_period: 'monthly', cashback_reset_day: 1, cashback_cycle_start_month: 1,
  cashback_sites: [],
  billing_date: '', due_date: '',
  holder_id: '', card_type: 'primary', primary_card_id: '',
};

const personLabel = (p) => p ? `${p.name} (${RELATIONS[p.relation]?.label || p.relation})` : '';
const idOf = (ref) => (ref && typeof ref === 'object' ? ref._id : ref) || '';

export default function AddCardModal({ editCard, defaultHolderId = '', onClose, onSave }) {
  const [form,   setForm]   = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState([]);
  const [allCards, setAllCards] = useState([]);

  useEffect(() => {
    Promise.all([getPeople(), getCards()])
      .then(([p, c]) => {
        setPeople(p);
        setAllCards(c);
        // New card with no preset holder → default to self
        if (!editCard && !defaultHolderId) {
          const self = p.find(x => x.relation === 'self');
          if (self) setForm(f => (f.holder_id ? f : { ...f, holder_id: self._id }));
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setForm(editCard ? {
      holder_id:        idOf(editCard.holder_id),
      card_type:        editCard.card_type || 'primary',
      primary_card_id:  idOf(editCard.primary_card_id),
      bank_name:        editCard.bank_name,
      card_network:     editCard.card_network || 'Visa',
      last_four_digit:  editCard.last_four_digit,
      name_on_card:     editCard.name_on_card,
      cashback_enabled: !!editCard.cashback_enabled,
      cashback_percent: editCard.cashback_percent || 5,
      cashback_limit:   editCard.cashback_limit   || 5000,
      cashback_period:           editCard.cashback_period           || 'monthly',
      cashback_reset_day:        editCard.cashback_reset_day        || 1,
      cashback_cycle_start_month: editCard.cashback_cycle_start_month || 1,
      cashback_sites:   Array.isArray(editCard.cashback_sites) ? editCard.cashback_sites : [],
      billing_date:     editCard.billing_date     || '',
      due_date:         editCard.due_date          || '',
    } : { ...EMPTY, holder_id: defaultHolderId });
  }, [editCard, defaultHolderId]);

  const primaryOptions = allCards.filter(c => c.card_type !== 'addon' && c._id !== editCard?._id);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(prev => ({ ...prev, [k]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.bank_name) newErrors.bank_name = 'Bank Name is required';
    if (!form.card_network) newErrors.card_network = 'Card Network is required';
    if (!form.last_four_digit) {
      newErrors.last_four_digit = 'Last 4 digits are required';
    } else if (!/^\d{4}$/.test(form.last_four_digit)) {
      newErrors.last_four_digit = 'Must be exactly 4 digits';
    }
    if (!form.name_on_card) newErrors.name_on_card = 'Name on Card is required';
    if (!form.holder_id) newErrors.holder_id = 'Select who holds this card';

    if (form.cashback_enabled) {
      if (form.cashback_percent === undefined || form.cashback_percent === null || isNaN(form.cashback_percent)) {
        newErrors.cashback_percent = 'Required';
      }
      if (form.cashback_limit === undefined || form.cashback_limit === null || isNaN(form.cashback_limit)) {
        newErrors.cashback_limit = 'Required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = { ...form, primary_card_id: form.card_type === 'addon' ? (form.primary_card_id || null) : null };
      editCard ? await updateCard(editCard._id, payload) : await createCard(payload);
      onSave();
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving card');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editCard ? 'Edit Card' : 'Add New Card'}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <form id="card-form" onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="form-group z-12">
                <label className="form-label">Card Holder <span style={{ color: 'var(--danger)' }}>*</span></label>
                <SearchableDropdown
                  options={people.map(personLabel)}
                  value={personLabel(people.find(p => p._id === form.holder_id))}
                  onChange={val => {
                    const p = people.find(x => personLabel(x) === val);
                    set('holder_id', p ? p._id : '');
                  }}
                  placeholder="Select person"
                  error={errors.holder_id}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Card Type</label>
                <div className="segmented">
                  {CARD_TYPES.map(t => (
                    <button
                      type="button"
                      key={t.value}
                      className={`segmented-btn ${form.card_type === t.value ? 'is-active' : ''}`}
                      onClick={() => set('card_type', t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {form.card_type === 'addon' && (
              <div className="form-group z-11">
                <label className="form-label">
                  Primary Card <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
                </label>
                <SearchableDropdown
                  options={primaryOptions.map(cardHolderLabel)}
                  value={cardHolderLabel(primaryOptions.find(c => c._id === form.primary_card_id))}
                  onChange={val => {
                    const c = primaryOptions.find(x => cardHolderLabel(x) === val);
                    set('primary_card_id', c ? c._id : '');
                  }}
                  placeholder="Card this add-on is linked to"
                />
              </div>
            )}

            <div className="form-row">
              <div className="form-group z-10">
                <label className="form-label">Bank Name</label>
                <SearchableDropdown
                  options={BANK_NAMES}
                  value={form.bank_name}
                  onChange={val => set('bank_name', val)}
                  placeholder="e.g. HDFC Bank"
                  error={errors.bank_name}
                  disabled={!!editCard}
                />
              </div>
              <div className="form-group z-9">
                <label className="form-label">Card Network</label>
                <SearchableDropdown
                  options={CARD_NETWORKS}
                  value={form.card_network}
                  onChange={val => set('card_network', val)}
                  error={errors.card_network}
                  disabled={!!editCard}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Last 4 Digits</label>
                <input className={`form-input ${errors.last_four_digit ? 'error' : ''}`} placeholder="1234" maxLength={4}
                  value={form.last_four_digit} onChange={e => set('last_four_digit', e.target.value.replace(/\D/g, ''))} disabled={!!editCard} />
                {errors.last_four_digit && <div className="form-error">{errors.last_four_digit}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Name on Card</label>
                <input className={`form-input ${errors.name_on_card ? 'error' : ''}`} placeholder="YOUR NAME"
                  value={form.name_on_card} onChange={e => set('name_on_card', e.target.value.toUpperCase())} />
                {errors.name_on_card && <div className="form-error">{errors.name_on_card}</div>}
              </div>
            </div>

            <div className="form-group">
              <div className="toggle-row">
                <span className="toggle-label">Cashback Eligible</span>
                <label className="toggle">
                  <input type="checkbox" checked={form.cashback_enabled}
                         onChange={e => set('cashback_enabled', e.target.checked)} />
                  <span className="toggle-track" /><span className="toggle-thumb" />
                </label>
              </div>
            </div>

            {form.cashback_enabled && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Cashback %</label>
                    <input className={`form-input ${errors.cashback_percent ? 'error' : ''}`} type="number" min="0" max="100" step="0.5"
                      value={form.cashback_percent} onChange={e => set('cashback_percent', parseFloat(e.target.value))} />
                    {errors.cashback_percent && <div className="form-error">{errors.cashback_percent}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cashback Limit (₹)</label>
                    <input className={`form-input ${errors.cashback_limit ? 'error' : ''}`} type="number" min="0" step="100"
                      value={form.cashback_limit} onChange={e => set('cashback_limit', parseFloat(e.target.value))} />
                    {errors.cashback_limit && <div className="form-error">{errors.cashback_limit}</div>}
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group z-8">
                    <label className="form-label">Cashback Period</label>
                    <SearchableDropdown
                      options={CASHBACK_PERIODS.map(p => p.label)}
                      value={CASHBACK_PERIODS.find(p => p.value === form.cashback_period)?.label || ''}
                      onChange={label => {
                        const found = CASHBACK_PERIODS.find(p => p.label === label);
                        if (found) set('cashback_period', found.value);
                      }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Resets On (Day)</label>
                    <input
                      className="form-input"
                      type="number" min="1" max="31" placeholder="e.g. 1"
                      value={form.cashback_reset_day}
                      onChange={e => set('cashback_reset_day', e.target.value ? parseInt(e.target.value) : '')}
                    />
                    <div className="form-hint">Day of month cashback cycle resets</div>
                  </div>
                </div>
                {form.cashback_period !== 'monthly' && (
                  <div className="form-group z-7">
                    <label className="form-label">Cycle Start Month</label>
                    <SearchableDropdown
                      options={MONTHS.map(m => m.label)}
                      value={MONTHS.find(m => m.value === form.cashback_cycle_start_month)?.label || ''}
                      onChange={label => {
                        const found = MONTHS.find(m => m.label === label);
                        if (found) set('cashback_cycle_start_month', found.value);
                      }}
                      required
                    />
                    <div className="form-hint">Month when the first cycle of the year begins</div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">
                    Cashback Sites <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <div className="cashback-sites-picker">
                    {ECOMM_SITES.filter(s => s !== 'Other').map(site => {
                      const active = form.cashback_sites.includes(site);
                      return (
                        <button
                          type="button"
                          key={site}
                          className={`cashback-site-chip ${active ? 'is-active' : ''}`}
                          onClick={() => {
                            set('cashback_sites', active
                              ? form.cashback_sites.filter(s => s !== site)
                              : [...form.cashback_sites, site]);
                          }}
                        >
                          {site}
                        </button>
                      );
                    })}
                  </div>
                  <div className="form-hint">
                    {form.cashback_sites.length === 0
                      ? 'Cashback applies on all sites'
                      : `Cashback only on: ${form.cashback_sites.join(', ')}`}
                  </div>
                </div>
              </>
            )}

            {/* Billing Cycle */}
            <div className="form-section-title">Billing Cycle <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-muted)' }}>(optional)</span></div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Statement Date</label>
                <input
                  className="form-input"
                  type="number" min="1" max="31" placeholder="e.g. 15"
                  value={form.billing_date}
                  onChange={e => set('billing_date', e.target.value ? parseInt(e.target.value) : '')}
                />
                <div className="form-hint">Day of month statement is generated</div>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Due Date</label>
                <input
                  className="form-input"
                  type="number" min="1" max="31" placeholder="e.g. 5"
                  value={form.due_date}
                  onChange={e => set('due_date', e.target.value ? parseInt(e.target.value) : '')}
                />
                <div className="form-hint">Day of month payment is due</div>
              </div>
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="card-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editCard ? 'Save Changes' : 'Add Card'}
          </button>
        </div>
      </div>
    </div>
  );
}

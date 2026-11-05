import { useState } from 'react';
import { X, Save, Check, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { addIpoApplications, updateIpoApplication } from '../../api';
import SearchableDropdown from '../../common/SearchableDropdown';
import BankAccountSelect from '../BankAccountSelect';
import { ipoShares } from '../../utils/ipo';
import { fmtCurrency, fmtSignedCurrency } from '../../utils/formatters';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

/**
 * Apply an IPO for one or more applicants (each from their own bank account),
 * or edit one application. Profit = sell price − 1 lot price; the applicant
 * gets `profit_share_percent` of it.
 */
export default function IpoApplicationModal({
  onClose, onSaved, editApp, applicants, accounts, onAccountAdded,
  ipoNames = [], defaults = {}, lastBankFor = () => '', presetApplicantId = '', onAddApplicant,
}) {
  const [form, setForm] = useState(() => ({
    ipo_name: editApp?.ipo_name || '',
    lot_price: editApp?.lot_price ?? defaults.lot_price ?? '',
    profit_share_percent: editApp?.profit_share_percent ?? defaults.profit_share_percent ?? '',
    allotted: editApp?.allotted ?? false,
    sell_price: editApp?.sell_price ?? '',
  }));
  // Create: applicant_id → bank_account_id for every ticked applicant
  const [picked, setPicked] = useState(() => {
    if (editApp) return { [editApp.applicant_id]: editApp.bank_account_id || '' };
    const p = applicants.find(a => a._id === presetApplicantId);
    return p ? { [p._id]: lastBankFor(p) } : {};
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
  };
  const togglePick = (p) => setPicked(cur => {
    const next = { ...cur };
    if (p._id in next) delete next[p._id];
    else next[p._id] = lastBankFor(p);
    return next;
  });
  const setBank = (applicantId, bankId) => {
    setPicked(cur => ({ ...cur, [applicantId]: bankId }));
    if (errors.banks) setErrors(e => ({ ...e, banks: '' }));
  };

  const share = num(form.profit_share_percent);
  const preview = ipoShares({
    allotted: form.allotted, lot_price: num(form.lot_price) || 0,
    sell_price: form.allotted && !Number.isNaN(num(form.sell_price)) ? num(form.sell_price) : null,
    profit_share_percent: Number.isNaN(share) ? 0 : share,
  });
  const pickedIds = Object.keys(picked);

  const validate = () => {
    const e = {};
    if (!form.ipo_name.trim()) e.ipo_name = 'IPO name is required';
    if (Number.isNaN(num(form.lot_price)) || num(form.lot_price) < 0) e.lot_price = 'Enter the price of 1 lot';
    if (Number.isNaN(share) || share < 0 || share > 100) e.profit_share_percent = 'Enter 0 – 100';
    if (form.allotted && form.sell_price !== '' && (Number.isNaN(num(form.sell_price)) || num(form.sell_price) < 0)) e.sell_price = 'Enter a valid sell price';
    if (pickedIds.length === 0) e.applicants = 'Pick at least one applicant';
    else if (pickedIds.some(id => !picked[id])) e.banks = 'Pick the bank account for every applicant';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const common = {
      ipo_name: form.ipo_name.trim(),
      lot_price: num(form.lot_price),
      profit_share_percent: share,
      allotted: form.allotted,
      sell_price: form.allotted && form.sell_price !== '' ? num(form.sell_price) : null,
    };
    try {
      let saved;
      if (editApp) {
        const [applicant_id] = pickedIds;
        saved = [await updateIpoApplication(editApp._id, { ...common, applicant_id, bank_account_id: picked[applicant_id] })];
        toast.success('IPO updated');
      } else {
        saved = await addIpoApplications({ ...common, entries: pickedIds.map(id => ({ applicant_id: id, bank_account_id: picked[id] })) });
        toast.success(saved.length > 1 ? `${common.ipo_name} applied for ${saved.length} people` : `${common.ipo_name} applied`);
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save IPO');
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id) => applicants.find(a => a._id === id)?.name || '';

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editApp ? `Edit ${editApp.ipo_name}` : 'Apply IPO'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="modal-body">
          <form id="ipo-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">IPO name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <SearchableDropdown
                options={ipoNames}
                value={form.ipo_name}
                onChange={val => set('ipo_name', val)}
                onCreate={async val => set('ipo_name', val)}
                createLabel="Use"
                placeholder="e.g. Tata Technologies"
                error={errors.ipo_name}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">1 lot price (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  className={`form-input ${errors.lot_price ? 'error' : ''}`}
                  type="number" min="0" step="any" inputMode="decimal" placeholder="e.g. 14,980"
                  value={form.lot_price}
                  onChange={e => set('lot_price', e.target.value)}
                />
                {errors.lot_price && <div className="form-error">{errors.lot_price}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Their profit share (%) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  className={`form-input ${errors.profit_share_percent ? 'error' : ''}`}
                  type="number" min="0" max="100" step="any" inputMode="decimal" placeholder="e.g. 30"
                  value={form.profit_share_percent}
                  onChange={e => set('profit_share_percent', e.target.value)}
                />
                {errors.profit_share_percent
                  ? <div className="form-error">{errors.profit_share_percent}</div>
                  : !Number.isNaN(share) && share >= 0 && share <= 100 && <div className="form-hint">You keep {Math.round((100 - share) * 100) / 100}%</div>}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                {editApp ? 'Applicant & bank account' : 'Apply from'} <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              {editApp ? (
                <SearchableDropdown
                  options={applicants.map(a => a.name)}
                  value={nameOf(pickedIds[0])}
                  onChange={val => {
                    const p = applicants.find(a => a.name === val);
                    if (p) setPicked({ [p._id]: picked[p._id] || lastBankFor(p) });
                  }}
                  placeholder="Applicant"
                />
              ) : applicants.length === 0 ? (
                <div className="ipo-no-applicants">
                  No applicants yet.
                  {onAddApplicant && <button type="button" className="btn btn-secondary btn-sm" onClick={onAddApplicant}><UserPlus size={14} /> Add applicant</button>}
                </div>
              ) : (
                <div className="ipo-pick-list">
                  {applicants.map(p => {
                    const on = p._id in picked;
                    return (
                      <button type="button" key={p._id} className={`ipo-pick ${on ? 'is-on' : ''}`} onClick={() => togglePick(p)} aria-pressed={on}>
                        <span className="ipo-pick-box">{on && <Check size={12} />}</span>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {errors.applicants && <div className="form-error">{errors.applicants}</div>}

              {pickedIds.length > 0 && (
                <div className="ipo-bank-rows">
                  {pickedIds.map(id => (
                    <div key={id} className="ipo-bank-row">
                      <span className="ipo-bank-row-name">{nameOf(id)}</span>
                      <BankAccountSelect
                        accounts={accounts}
                        value={picked[id]}
                        onChange={bankId => setBank(id, bankId)}
                        onAccountAdded={onAccountAdded}
                        defaultHolder={nameOf(id)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {errors.banks && <div className="form-error">{errors.banks}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Allotted?</label>
              <div className="segmented">
                {[{ v: false, l: 'Not yet / No' }, { v: true, l: 'Yes, allotted' }].map(o => (
                  <button type="button" key={String(o.v)} className={`segmented-btn ${form.allotted === o.v ? 'is-active' : ''}`} onClick={() => set('allotted', o.v)}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {form.allotted && (
              <div className="form-group">
                <label className="form-label">Sell price (₹) <span className="form-optional">(add when sold)</span></label>
                <input
                  className={`form-input ${errors.sell_price ? 'error' : ''}`}
                  type="number" min="0" step="any" inputMode="decimal" placeholder="Total received for the lot"
                  value={form.sell_price}
                  onChange={e => set('sell_price', e.target.value)}
                />
                {errors.sell_price && <div className="form-error">{errors.sell_price}</div>}
              </div>
            )}

            {preview.profit !== null && (
              <div className="ipo-preview">
                <div><span>Profit {pickedIds.length > 1 ? '/ lot' : ''}</span><strong className={preview.profit >= 0 ? 'text-success' : 'text-danger'}>{fmtSignedCurrency(preview.profit)}</strong></div>
                <div><span>Their share</span><strong>{fmtCurrency(preview.their_share)}</strong></div>
                <div><span>My share</span><strong className={preview.my_share >= 0 ? 'text-success' : 'text-danger'}>{fmtSignedCurrency(preview.my_share)}</strong></div>
              </div>
            )}
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="ipo-form" className="btn btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : editApp ? 'Save Changes' : pickedIds.length > 1 ? `Apply for ${pickedIds.length}` : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

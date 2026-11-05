import { useState } from 'react';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { addBankAccount, updateBankAccount } from '../api';
import { BANK_NAMES } from '../constants';
import SearchableDropdown from '../common/SearchableDropdown';

/**
 * Add / edit a bank account in the shared list (used by IPO and future features).
 * `defaultHolder` pre-fills the holder name, e.g. the applicant being edited.
 */
export default function BankAccountModal({ onClose, onSaved, editAccount, defaultHolder = '', holders = [], lockHolder = false }) {
  const [form, setForm] = useState({
    holder_name: editAccount?.holder_name || defaultHolder,
    bank_name: editAccount?.bank_name || '',
    account_last4: editAccount?.account_last4 || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // may be opened from inside another modal's form
    const errs = {};
    if (!form.holder_name.trim()) errs.holder_name = 'Account holder is required';
    if (!form.bank_name.trim()) errs.bank_name = 'Bank is required';
    if (form.account_last4 && !/^\d{4}$/.test(form.account_last4)) errs.account_last4 = 'Enter exactly 4 digits';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { holder_name: form.holder_name.trim(), bank_name: form.bank_name.trim(), account_last4: form.account_last4 };
      const saved = editAccount ? await updateBankAccount(editAccount._id, payload) : await addBankAccount(payload);
      toast.success(editAccount ? 'Bank account saved' : 'Bank account added');
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save bank account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop modal-backdrop-top" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editAccount ? 'Edit Bank Account' : 'Add Bank Account'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="modal-body">
          <form id="bank-account-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">Account holder <span style={{ color: 'var(--danger)' }}>*</span></label>
              {lockHolder ? (
                <input className="form-input" value={form.holder_name} disabled />
              ) : (
                <SearchableDropdown
                  options={holders}
                  value={form.holder_name}
                  onChange={val => set('holder_name', val)}
                  onCreate={async val => set('holder_name', val)}
                  createLabel="New person"
                  placeholder="Whose account, e.g. Ravi Kumar"
                  error={errors.holder_name}
                />
              )}
              <div className="form-hint">Pick an existing person to add another of their accounts.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Bank <span style={{ color: 'var(--danger)' }}>*</span></label>
              <SearchableDropdown
                options={BANK_NAMES}
                value={form.bank_name}
                onChange={val => set('bank_name', val)}
                onCreate={async val => set('bank_name', val)}
                createLabel="Use"
                placeholder="Select or type a bank"
                error={errors.bank_name}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Last 4 digits <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span></label>
              <input
                className={`form-input ${errors.account_last4 ? 'error' : ''}`}
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 4321"
                value={form.account_last4}
                onChange={e => set('account_last4', e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              {errors.account_last4 && <div className="form-error">{errors.account_last4}</div>}
              <div className="form-hint">Helps tell apart two accounts at the same bank. Never enter the full number.</div>
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="bank-account-form" className="btn btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : editAccount ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

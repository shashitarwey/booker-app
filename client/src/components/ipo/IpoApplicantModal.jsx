import { useState } from 'react';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { addIpoApplicant, updateIpoApplicant } from '../../api';
import { BROKERS } from '../../constants';
import SearchableDropdown from '../../common/SearchableDropdown';
import BankAccountSelect from '../BankAccountSelect';

/** Add / edit a person whose demat account is used to apply for IPOs. */
export default function IpoApplicantModal({ onClose, onSaved, editApplicant, accounts, onAccountAdded }) {
  const [form, setForm] = useState({
    name: editApplicant?.name || '',
    broker: editApplicant?.broker || '',
    default_bank_account_id: editApplicant?.default_bank_account_id || '',
    notes: editApplicant?.notes || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), broker: form.broker.trim(), default_bank_account_id: form.default_bank_account_id || null };
      const saved = editApplicant ? await updateIpoApplicant(editApplicant._id, payload) : await addIpoApplicant(payload);
      toast.success(editApplicant ? 'Applicant saved' : `${saved.name} added`);
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save applicant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editApplicant ? `Edit ${editApplicant.name}` : 'Add IPO Applicant'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="modal-body">
          <form id="ipo-applicant-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">Name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                className={`form-input ${error ? 'error' : ''}`}
                placeholder="Whose demat / PAN, e.g. Neha Sharma"
                value={form.name}
                onChange={e => { set('name', e.target.value); setError(''); }}
                autoFocus
              />
              {error && <div className="form-error">{error}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Broker <span className="form-optional">(Optional)</span></label>
              <SearchableDropdown
                options={BROKERS}
                value={form.broker}
                onChange={val => set('broker', val)}
                onCreate={async val => set('broker', val)}
                createLabel="Use"
                placeholder="Zerodha, Groww, Upstox…"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Default bank account <span className="form-optional">(Optional)</span></label>
              <BankAccountSelect
                accounts={accounts}
                value={form.default_bank_account_id}
                onChange={id => set('default_bank_account_id', id)}
                onAccountAdded={onAccountAdded}
                defaultHolder={form.name}
              />
              <div className="form-hint">Pre-selected when you apply an IPO for this person.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes <span className="form-optional">(Optional)</span></label>
              <textarea className="form-input" rows={2} maxLength={500} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="ipo-applicant-form" className="btn btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : editApplicant ? 'Save Changes' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

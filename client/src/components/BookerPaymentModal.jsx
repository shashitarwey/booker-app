import { useState } from 'react';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { addBookerPayment, updateBookerPayment } from '../api';
import { getToday } from '../constants';
import { fmtCurrency } from '../utils/formatters';
import SingleDatePicker from '../common/SingleDatePicker';

export default function BookerPaymentModal({ person, editPayment, balance = 0, onClose, onSuccess }) {
  const [form, setForm] = useState({
    amount: editPayment?.amount ?? (balance > 0 ? balance : ''),
    payment_date: editPayment?.payment_date ? editPayment.payment_date.slice(0, 10) : getToday(),
    notes: editPayment?.notes || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!(Number(form.amount) > 0)) errs.amount = 'Enter an amount';
    if (!form.payment_date) errs.payment_date = 'Pick a date';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (editPayment) await updateBookerPayment(editPayment._id, payload);
      else await addBookerPayment(person._id, payload);
      toast.success(editPayment ? 'Payment updated' : `Payment to ${person.name} recorded`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editPayment ? 'Edit Payment' : `Pay ${person.name}`}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <form id="booker-payment-form" onSubmit={handleSubmit} noValidate>
            {!editPayment && (
              <div className="form-hint" style={{ marginBottom: 14 }}>
                {balance > 0
                  ? <>You currently owe {person.name} <strong>{fmtCurrency(balance)}</strong>.</>
                  : balance < 0
                    ? <>You've paid {fmtCurrency(-balance)} in advance.</>
                    : 'Nothing is due right now.'}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Amount (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="number"
                min="0"
                className={`form-input ${errors.amount ? 'error' : ''}`}
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                autoFocus
              />
              {errors.amount && <div className="form-error">{errors.amount}</div>}
            </div>
            <div className="form-group z-10">
              <label className="form-label">Payment Date <span style={{ color: 'var(--danger)' }}>*</span></label>
              <SingleDatePicker value={form.payment_date} onChange={v => set('payment_date', v)} maxDate={getToday()} />
              {errors.payment_date && <div className="form-error">{errors.payment_date}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Note <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span></label>
              <input
                type="text"
                maxLength={200}
                className="form-input"
                placeholder="e.g. UPI, Cash, Bank transfer"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="booker-payment-form" className="btn btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : editPayment ? 'Save Changes' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

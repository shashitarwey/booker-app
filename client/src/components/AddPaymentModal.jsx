import { useState, useRef } from 'react';
import { addSellerPayment, updateSellerPayment } from '../api';
import { X, Save, Upload, Image as ImageIcon, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import SingleDatePicker from '../common/SingleDatePicker';
import { getToday } from '../constants';


export default function AddPaymentModal({ onClose, onSuccess, seller, editPayment }) {
  const today = getToday(); // per render: stays correct past midnight
  const isEdit = !!editPayment;

  const [form, setForm] = useState({
    amount: isEdit ? String(editPayment.amount) : '',
    payment_date: isEdit ? editPayment.payment_date?.slice(0, 10) : today,
    notes: isEdit ? (editPayment.notes || '') : '',
    receipt: null,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const hadExistingReceipt = isEdit && !!editPayment.receipt_url;
  const [preview, setPreview] = useState(hadExistingReceipt ? editPayment.receipt_url : null);
  const [removedReceipt, setRemovedReceipt] = useState(false);
  const fileRef = useRef(null);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.amount || Number(form.amount) <= 0) e.amount = 'Enter a valid payment amount';
    if (!form.payment_date) e.payment_date = 'Payment date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const submitData = new FormData();
      submitData.append('amount', form.amount);
      submitData.append('payment_date', form.payment_date);
      // Always send notes when editing so clearing the note is saved
      if (form.notes || isEdit) submitData.append('notes', form.notes || '');
      if (form.receipt) submitData.append('receipt', form.receipt);
      if (isEdit && removedReceipt && !form.receipt) submitData.append('remove_receipt', 'true');

      if (isEdit) {
        await updateSellerPayment(editPayment._id, submitData);
        toast.success('Payment updated');
      } else {
        submitData.append('seller_id', seller._id);
        await addSellerPayment(submitData);
        toast.success('Payment added successfully');
      }

      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || (isEdit ? 'Failed to update payment' : 'Failed to add payment'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 className="modal-title">
            {isEdit ? 'Edit Payment' : 'Add Payment'} — {seller?.name || editPayment?.seller_id}
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <form id="payment-form" onSubmit={handleSubmit} noValidate>
            {!isEdit && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', marginTop: 0 }}>
                Record money received to update their Khata Book ledger.
              </p>
            )}

            <div className="form-group">
              <label className="form-label">Amount Received (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="number"
                className={`form-input ${errors.amount ? 'error' : ''}`}
                min="1"
                placeholder="0"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
              />
              {errors.amount && <div className="form-error">{errors.amount}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Payment Date <span style={{ color: 'var(--danger)' }}>*</span></label>
              <SingleDatePicker
                value={form.payment_date}
                onChange={v => set('payment_date', v)}
                placeholder="Select date"
                maxDate={today}
              />
              {errors.payment_date && <div className="form-error">{errors.payment_date}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Payment Proof <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span></label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files[0];
                  if (file) {
                    set('receipt', file);
                    setPreview(URL.createObjectURL(file));
                    setRemovedReceipt(false);
                  }
                }}
              />
              {preview ? (
                <div className="upload-preview">
                  <img src={preview} alt="Receipt preview" className="upload-preview-img" />
                  <div className="upload-preview-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                      <Upload size={13} /> Replace
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { set('receipt', null); setPreview(null); setRemovedReceipt(true); if (fileRef.current) fileRef.current.value = ''; }}
                      style={{ color: 'var(--danger)' }}>
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="upload-area" onClick={() => fileRef.current?.click()}>
                  <div className="upload-area-icon">
                    <ImageIcon size={20} />
                  </div>
                  <span className="upload-area-text">Click to upload screenshot</span>
                  <span className="upload-area-hint">UPI / Cash Deposit etc. (max 1MB)</span>
                </button>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., UPI Transfer, Cash, specific bills"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="payment-form" className="btn btn-primary" disabled={loading}>
            <Save size={16} /> {loading ? 'Saving…' : (isEdit ? 'Update Payment' : 'Save Payment')}
          </button>
        </div>
      </div>
    </div>
  );
}

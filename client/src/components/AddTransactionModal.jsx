import { useState, useEffect, useCallback } from 'react';
import { X, Trash2 } from 'lucide-react';
import { createTransaction, deleteTransaction, getTransactions } from '../api';
import ConfirmModal from '../common/ConfirmModal';
import { toast } from 'react-hot-toast';
import SearchableDropdown from '../common/SearchableDropdown';
import SingleDatePicker from '../common/SingleDatePicker';
import { getToday } from '../constants';

export default function AddTransactionModal({ card, cards, onClose, onSave }) {
  const [form, setForm] = useState({
    card_id:     card?._id || '',
    amount:      '',
    description: '',
    date:        getToday(),
  });
  const [txList,   setTxList]   = useState([]);
  const [errors,   setErrors]   = useState({});
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [confirm,  setConfirm]  = useState(null);

  // GET /transactions returns { items, page, totalAmount } — card
  // transactions merged with orders on the card, newest first.
  const fetchTxs = useCallback(async () => {
    if (!form.card_id) return;
    setLoading(true);
    try {
      const res = await getTransactions({ cardId: form.card_id, limit: 5 });
      setTxList(res.items || []);
    }
    catch (err) { console.error('Failed to load recent transactions', err); }
    finally { setLoading(false); }
  }, [form.card_id]);

  useEffect(() => { fetchTxs(); }, [fetchTxs]);

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.card_id) newErrors.card_id = 'Please select a card';
    if (!form.amount || parseFloat(form.amount) <= 0) {
      newErrors.amount = 'Enter a valid amount';
    }
    if (!form.date) newErrors.date = 'Date is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await createTransaction({ ...form, amount: parseFloat(form.amount) });
      setForm(f => ({ ...f, amount: '', description: '' }));
      await fetchTxs();
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error adding transaction');
    } finally { setSaving(false); }
  };

  const handleDelete = (tx) => {
    setConfirm({
      message: `Delete "${tx.description || 'this transaction'}" of ₹${tx.amount.toLocaleString('en-IN')}?`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteTransaction(tx._id);
          setTxList(prev => prev.filter(t => t._id !== tx._id));
          onSave();
        } catch (err) {
          toast.error(err.response?.data?.error || 'Error deleting transaction');
        }
      },
    });
  };

  const cardLabelFn = (c) => `${c.bank_name} ${c.card_network} ••••${c.last_four_digit}`;

  return (
    <>
      <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal-content" style={{ maxWidth: '520px' }}>
          <div className="modal-header">
            <h2 className="modal-title">Add Transaction</h2>
            <button className="modal-close" onClick={onClose}><X size={20} /></button>
          </div>

          <div className="modal-body">
            <form id="tx-form" onSubmit={handleSubmit} noValidate>
              <div className="form-group z-10">
                <label className="form-label">Card</label>
                <SearchableDropdown
                  options={cards.map(c => cardLabelFn(c))}
                  value={form.card_id ? cardLabelFn(cards.find(c => c._id === form.card_id)) : ''}
                  onChange={val => {
                    const found = cards.find(c => cardLabelFn(c) === val);
                    set('card_id', found ? found._id : '');
                  }}
                  placeholder="Select a card"
                  error={errors.card_id}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (₹)</label>
                  <input className={`form-input ${errors.amount ? 'error' : ''}`} type="number" min="1" step="0.01" placeholder="500"
                    value={form.amount} onChange={e => set('amount', e.target.value)} />
                  {errors.amount && <div className="form-error">{errors.amount}</div>}
                </div>
                <div className="form-group z-9">
                  <label className="form-label">Date</label>
                  <SingleDatePicker
                    value={form.date}
                    maxDate={getToday()}
                    onChange={val => set('date', val)}
                  />
                  {errors.date && <div className="form-error">{errors.date}</div>}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" placeholder="e.g. Grocery shopping"
                  value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
            </form>

            {form.card_id && (
              <div style={{ marginTop: '24px' }}>
                <p className="text-sm font-bold text-muted mb-10 text-uppercase">
                  Recent Transactions
                </p>
                {loading && <p className="text-muted text-md">Loading…</p>}
                <div className="recent-tx-list">
                  {txList.length === 0 ? (
                    <div className="empty-sub">No transactions yet.</div>
                  ) : (
                    txList.slice(0, 5).map(tx => (
                      <div key={tx._id} className="tx-item">
                        <div>
                          <div className="tx-desc">
                            {tx.description ? (tx.description.length > 20 ? tx.description.slice(0, 20) + '...' : tx.description) : 'Transaction'}
                          </div>
                          <div className="tx-date">{new Date(tx.date).toISOString().slice(0,10).split('-').reverse().join('-')}</div>
                        </div>
                        <div className="d-flex items-center gap-12">
                          <span className="tx-amount">₹{tx.amount.toLocaleString('en-IN')}</span>
                          {/* Orders show up here too; they're managed from the Orders page */}
                          {tx.is_order
                            ? <span className="tx-order-tag">Order</span>
                            : (
                              <button className="tx-delete" onClick={() => handleDelete(tx)} data-tooltip="Delete">
                                <Trash2 size={14} />
                              </button>
                            )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" form="tx-form" className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add Transaction'}
            </button>
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title="Delete Transaction?"
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

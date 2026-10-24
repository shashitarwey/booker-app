import { useState, useEffect, useRef } from 'react';
import { addOrder, updateOrder, getVariants, addVariant, getCashbackCycle } from '../api';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { ECOMM_SITES, VARIANTS, DELIVERY_STATUS_OPTIONS, getToday } from '../constants';
import { cardHolderLabel, sellerLabel, fmtCurrency, fmtDisplay } from '../utils/formatters';

// Cycle end is exclusive; show the last day it covers
const prevDay = (ymd) => {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
import { orderProfit } from '../utils/profit';
import SingleDatePicker from '../common/SingleDatePicker';
import SearchableDropdown from '../common/SearchableDropdown';


export default function AddOrderModal({ onClose, onSuccess, editOrder, cards, sellers = [] }) {
  const today = getToday(); // per render: stays correct past midnight
  const [form, setForm] = useState({
    order_date: today,
    delivered_date: '',
    quantity: 1,
    unit_order_amount: '',
    unit_return_amount: '',
    order_amount: '',
    return_amount: '',
    unit_friend_amount: '',
    friend_amount: '',
    advance_paid: false,
    advance_amount: '',
    cashback: 0,
    coupon_cashback: '',
    coupon_in_profit: true,
    variant: 'NA',
    model_ordered: '',
    id_used: '',
    seller_id: '',
    delivery_status: 'Pending',
    ecomm_site: 'Amazon',
    card_id: '',
    remark: ''
  });
  const [variantOptions, setVariantOptions] = useState(VARIANTS);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
  };

  useEffect(() => {
    if (editOrder) {
      const q = editOrder.quantity || 1;
      setForm({
        ...editOrder,
        order_date: editOrder.order_date ? editOrder.order_date.slice(0, 10) : '',
        delivered_date: editOrder.delivered_date ? editOrder.delivered_date.slice(0, 10) : '',
        card_id: editOrder.card_id?._id || editOrder.card_id || '',
        seller_id: editOrder.seller_id?._id || editOrder.seller_id || '',
        quantity: q,
        unit_order_amount: editOrder.order_amount / q,
        unit_return_amount: editOrder.return_amount / q,
        order_amount: editOrder.order_amount,
        return_amount: editOrder.return_amount,
        unit_friend_amount: typeof editOrder.friend_amount === 'number' ? editOrder.friend_amount / q : '',
        friend_amount: typeof editOrder.friend_amount === 'number' ? editOrder.friend_amount : '',
        coupon_cashback: editOrder.coupon_cashback > 0 ? editOrder.coupon_cashback : '',
        coupon_in_profit: editOrder.coupon_in_profit !== false,
        advance_paid: editOrder.advance_amount > 0,
        advance_amount: editOrder.advance_amount > 0 ? editOrder.advance_amount : '',
        remark: editOrder.remark || ''
      });
    }
  }, [editOrder]);

  useEffect(() => {
    getVariants().then(setVariantOptions).catch(() => {});
  }, []);

  const handleAddVariant = async (name) => {
    try {
      setVariantOptions(await addVariant(name));
      toast.success(`Variant "${name}" saved`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add variant');
      throw err;
    }
  };

  const selectedCard = cards?.find(c => c._id === form.card_id);
  const isFriendCard = selectedCard?.holder_id?.relation === 'friend';
  const friendName = selectedCard?.holder_id?.name || 'friend';
  const isCashbackEnabled = selectedCard?.cashback_enabled || false;

  // True once the user picks a different card while editing: from then on the
  // cashback is recalculated (and capped) for the new card. Opening an existing
  // order never overwrites its saved cashback.
  const cardChangedRef = useRef(false);

  // Card cashback limit usage for the cycle containing the order date. When
  // editing, the order's own cashback isn't counted against the limit.
  const [cycle, setCycle] = useState(null);
  useEffect(() => {
    if (!form.card_id) { setCycle(null); return undefined; }
    let cancelled = false;
    getCashbackCycle(form.card_id, { date: form.order_date || undefined, exclude_order: editOrder?._id })
      .then(c => { if (!cancelled) setCycle({ ...c, card_id: form.card_id }); })
      .catch(() => { if (!cancelled) setCycle(null); });
    return () => { cancelled = true; };
  }, [form.card_id, form.order_date, editOrder?._id]);

  // Compute cashback honoring the card's cashback_sites restriction.
  // Empty/missing sites array → applies everywhere. Otherwise the current
  // ecomm_site must be in the list for cashback to apply.
  const computeCashback = (card, ecommSite, orderAmount) => {
    if (!card?.cashback_enabled) return 0;
    const sites = Array.isArray(card.cashback_sites) ? card.cashback_sites : [];
    if (sites.length > 0 && !sites.includes(ecommSite)) return 0;
    const raw = Math.round((Number(orderAmount) || 0) * (card.cashback_percent / 100));
    // Never more than what's left of the card's limit this cycle
    const remaining = cycle && cycle.card_id === card._id ? cycle.remaining : null;
    return remaining == null ? raw : Math.min(raw, Math.round(remaining));
  };

  // Re-apply the cap once the cycle info for the selected card/date arrives (new orders only)
  useEffect(() => {
    if (!cycle || (editOrder && !cardChangedRef.current)) return;
    setForm(f => {
      const card = cards?.find(c => c._id === f.card_id);
      const cb = computeCashback(card, f.ecomm_site, f.order_amount);
      return cb === f.cashback ? f : { ...f, cashback: cb };
    });
  }, [cycle]); // eslint-disable-line react-hooks/exhaustive-deps

  const rawCashback = selectedCard?.cashback_enabled
    ? Math.round((Number(form.order_amount) || 0) * ((selectedCard.cashback_percent || 0) / 100))
    : 0;
  const cashbackCapped = Boolean(cycle?.limit > 0 && cycle.remaining != null && rawCashback > cycle.remaining);

  const validate = () => {
    const e = {};
    if (!form.model_ordered.trim()) e.model_ordered = 'Item name is required';
    if (!form.card_id) e.card_id = 'Please select a card';
    if (!form.seller_id) e.seller_id = 'Please select a seller';
    if (!form.id_used.trim()) e.id_used = 'Account is required';
    if (!form.order_date) e.order_date = 'Order date is required';
    if (!form.unit_order_amount || Number(form.unit_order_amount) <= 0) e.unit_order_amount = 'Enter order amount';
    if (form.unit_return_amount === '' || Number(form.unit_return_amount) < 0) e.unit_return_amount = 'Enter return amount';
    if (isFriendCard && (form.unit_friend_amount === '' || Number(form.unit_friend_amount) < 0)) e.unit_friend_amount = `Enter return amount to ${friendName}`;
    if (isFriendCard && form.advance_paid) {
      const adv = Number(form.advance_amount);
      if (form.advance_amount === '' || !(adv > 0)) e.advance_amount = 'Enter the advance amount';
      else if (adv > (Number(form.friend_amount) || 0)) e.advance_amount = `Advance can't be more than the return to ${friendName} (₹${Number(form.friend_amount) || 0})`;
    }
    if (form.remark && form.remark.length > 200) e.remark = 'Remark must be 200 characters or fewer';
    if (form.delivery_status === 'Delivered' && !form.delivered_date) e.delivered_date = 'Delivery date is required when status is Delivered';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const payload = {
      ...form,
      friend_amount: isFriendCard ? Number(form.friend_amount) || 0 : null,
      coupon_cashback: Number(form.coupon_cashback) || 0,
      advance_amount: isFriendCard && form.advance_paid ? Number(form.advance_amount) : null,
    };
    delete payload.advance_paid;
    try {
      if (editOrder) {
        await updateOrder(editOrder._id, payload);
        toast.success('Order updated');
      } else {
        await addOrder(payload);
        toast.success('Order added');
      }
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save order');
    } finally {
      setLoading(false);
    }
  };

  const recalcAmounts = (field, value) => {
    const rawQ = field === 'quantity' ? value : form.quantity;
    const q = rawQ === '' ? 1 : (Number(rawQ) || 1);
    const uOrder = field === 'unit_order_amount' ? Number(value) : Number(form.unit_order_amount);
    const uReturn = field === 'unit_return_amount' ? Number(value) : Number(form.unit_return_amount);
    const uFriend = field === 'unit_friend_amount' ? Number(value) : Number(form.unit_friend_amount);
    const oAmt = uOrder * q;
    const rAmt = uReturn * q;
    const fAmt = uFriend * q;
    const cb = computeCashback(selectedCard, form.ecomm_site, oAmt);
    const update = { [field]: value, order_amount: oAmt, return_amount: rAmt, friend_amount: fAmt, cashback: cb };
    if (field === 'quantity') update.quantity = value === '' ? '' : Math.max(1, Number(value) || 1);
    setForm(f => ({ ...f, ...update }));
    if (errors[field]) setErrors(err => ({ ...err, [field]: '' }));
  };

  const statusOptions = DELIVERY_STATUS_OPTIONS;
  const preview = {
    order_amount: Number(form.order_amount) || 0,
    return_amount: Number(form.return_amount) || 0,
    cashback: Number(form.cashback) || 0,
    coupon_cashback: Number(form.coupon_cashback) || 0,
    coupon_in_profit: form.coupon_in_profit,
    friend_amount: isFriendCard ? Number(form.friend_amount) || 0 : null,
  };
  const estProfit = Math.round(orderProfit(preview) * 100) / 100;
  const estFriendEarning = isFriendCard
    ? Math.round((preview.friend_amount - preview.order_amount + preview.cashback) * 100) / 100
    : 0;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '660px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editOrder ? 'Edit Order' : 'Add New Order'}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <form id="order-form" onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="form-group z-10">
                <label className="form-label">E-Comm Site</label>
                <SearchableDropdown
                  options={ECOMM_SITES}
                  value={form.ecomm_site}
                  onChange={v => {
                    const cb = computeCashback(selectedCard, v, form.order_amount);
                    setForm(f => ({ ...f, ecomm_site: v, cashback: cb }));
                    if (errors.ecomm_site) setErrors(e => ({ ...e, ecomm_site: '' }));
                  }}
                  placeholder="Select Site"
                  error={errors.ecomm_site}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Model / Item Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className={`form-input ${errors.model_ordered ? 'error' : ''}`}
                  placeholder="e.g. iPhone 15"
                  value={form.model_ordered}
                  onChange={e => set('model_ordered', e.target.value)}
                />
                {errors.model_ordered && <div className="form-error">{errors.model_ordered}</div>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group z-9">
                <label className="form-label">Variant</label>
                <SearchableDropdown
                  options={variantOptions}
                  value={form.variant}
                  onChange={v => set('variant', v || 'NA')}
                  onCreate={handleAddVariant}
                  createLabel="Add variant"
                  placeholder="Select or type a variant"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Account <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  className={`form-input ${errors.id_used ? 'error' : ''}`}
                  placeholder="Email or Phone"
                  value={form.id_used}
                  onChange={e => set('id_used', e.target.value)}
                />
                {errors.id_used && <div className="form-error">{errors.id_used}</div>}
              </div>
            </div>

            <div className="form-group z-8">
              <label className="form-label">Card Used <span style={{ color: 'var(--danger)' }}>*</span></label>
              <SearchableDropdown
                options={cards?.map(c => cardHolderLabel(c)) || []}
                value={form.card_id ? cardHolderLabel(selectedCard) : ''}
                onChange={val => {
                  const card = cards?.find(c => cardHolderLabel(c) === val);
                  const newId = card ? card._id : '';
                  const cb = computeCashback(card, form.ecomm_site, form.order_amount);
                  if (editOrder && newId !== form.card_id) cardChangedRef.current = true;
                  setForm(f => ({ ...f, card_id: newId, cashback: cb }));
                  if (errors.card_id) setErrors(e => ({ ...e, card_id: '' }));
                }}
                placeholder="Select a card"
                error={errors.card_id}
              />
            </div>

            <div className="form-group z-7">
              <label className="form-label">Buyer <span style={{ color: 'var(--danger)' }}>*</span></label>
              <SearchableDropdown
                options={sellers?.map(s => sellerLabel(s)) || []}
                value={form.seller_id ? sellerLabel(sellers?.find(s => s._id === form.seller_id)) : ''}
                onChange={val => {
                  const seller = sellers?.find(s => sellerLabel(s) === val);
                  setForm(f => ({ ...f, seller_id: seller ? seller._id : '' }));
                  if (errors.seller_id) setErrors(e => ({ ...e, seller_id: '' }));
                }}
                placeholder="Select a buyer"
                error={errors.seller_id}
              />
            </div>

            <div className="form-row">
              <div className="form-group z-6">
                <label className="form-label">Order Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <SingleDatePicker
                  value={form.order_date}
                  onChange={v => set('order_date', v)}
                  placeholder="Select date"
                  maxDate={today}
                />
                {errors.order_date && <div className="form-error">{errors.order_date}</div>}
              </div>

              <div className="form-group z-5">
                <label className="form-label">
                  Delivered Date {form.delivery_status === 'Delivered' && <span style={{ color: 'var(--danger)' }}>*</span>}
                </label>
                <SingleDatePicker
                  value={form.delivered_date}
                  onChange={v => set('delivered_date', v)}
                  placeholder="Select date"
                  maxDate={today}
                />
                {errors.delivered_date && <div className="form-error">{errors.delivered_date}</div>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  value={form.quantity}
                  onChange={e => recalcAmounts('quantity', e.target.value)}
                  onBlur={e => { if (Number(e.target.value) < 1) recalcAmounts('quantity', 1); }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Delivery Status</label>
                <SearchableDropdown
                  options={statusOptions.map(s => s.label)}
                  value={statusOptions.find(s => s.value === form.delivery_status)?.label || ''}
                  onChange={val => {
                    const found = statusOptions.find(s => s.label === val);
                    set('delivery_status', found ? found.value : 'Pending');
                  }}
                  placeholder="Select status"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Unit Order Amt (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  className={`form-input ${errors.unit_order_amount ? 'error' : ''}`}
                  min="0"
                  placeholder="0"
                  value={form.unit_order_amount}
                  onChange={e => recalcAmounts('unit_order_amount', e.target.value)}
                />
                {errors.unit_order_amount && <div className="form-error">{errors.unit_order_amount}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">{isFriendCard ? 'Unit Return from Seller (₹)' : 'Unit Return Amt (₹)'} <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="number"
                  className={`form-input ${errors.unit_return_amount ? 'error' : ''}`}
                  min="0"
                  placeholder="0"
                  value={form.unit_return_amount}
                  onChange={e => recalcAmounts('unit_return_amount', e.target.value)}
                />
                {errors.unit_return_amount && <div className="form-error">{errors.unit_return_amount}</div>}
              </div>
            </div>

            {isFriendCard && (
              <div className="form-group">
                <label className="form-label">
                  Unit Return to {friendName} (₹) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  className={`form-input ${errors.unit_friend_amount ? 'error' : ''}`}
                  min="0"
                  placeholder="0"
                  value={form.unit_friend_amount}
                  onChange={e => recalcAmounts('unit_friend_amount', e.target.value)}
                />
                <div className="form-hint">Your profit = Return from Seller − Return to {friendName}.</div>
                {errors.unit_friend_amount && <div className="form-error">{errors.unit_friend_amount}</div>}
              </div>
            )}

            {isFriendCard && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Advance paid to {friendName}?</label>
                  <div className="segmented">
                    {[{ v: false, l: 'No' }, { v: true, l: 'Yes' }].map(o => (
                      <button
                        type="button"
                        key={o.l}
                        className={`segmented-btn ${form.advance_paid === o.v ? 'is-active' : ''}`}
                        onClick={() => {
                          setForm(f => ({ ...f, advance_paid: o.v, advance_amount: o.v ? f.advance_amount : '' }));
                          if (errors.advance_amount) setErrors(er => ({ ...er, advance_amount: '' }));
                        }}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
                {form.advance_paid ? (
                  <div className="form-group">
                    <label className="form-label">Advance Amount (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input
                      type="number"
                      className={`form-input ${errors.advance_amount ? 'error' : ''}`}
                      min="0"
                      placeholder="0"
                      value={form.advance_amount}
                      onChange={e => set('advance_amount', e.target.value)}
                      autoFocus
                    />
                    <div className="form-hint">
                      Remaining to pay: ₹{Math.max(0, (Number(form.friend_amount) || 0) - (Number(form.advance_amount) || 0)).toLocaleString('en-IN')}
                    </div>
                    {errors.advance_amount && <div className="form-error">{errors.advance_amount}</div>}
                  </div>
                ) : <div className="form-group" />}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Cashback (₹) {!isCashbackEnabled && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}>(Card has no cashback)</span>}</label>
              <input
                type="number"
                className="form-input"
                min="0"
                value={form.cashback}
                onChange={e => set('cashback', Number(e.target.value))}
                disabled={!isCashbackEnabled}
              />
              {isCashbackEnabled && cycle?.limit > 0 && (
                <div className={`form-hint ${cashbackCapped ? 'text-amber' : ''}`}>
                  {cashbackCapped ? 'Capped at the card limit · ' : ''}
                  ₹{Math.round(cycle.remaining).toLocaleString('en-IN')} of ₹{cycle.limit.toLocaleString('en-IN')} left this cycle
                  {' '}(till {fmtDisplay(prevDay(cycle.cycle.end))})
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Coupon Cashback (₹) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
                </label>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  placeholder="0"
                  value={form.coupon_cashback}
                  onChange={e => set('coupon_cashback', e.target.value)}
                />
                <div className="form-hint">Site coupon / offer cashback — separate from the card's limit.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Add coupon to profit?</label>
                <div className="segmented">
                  {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map(o => (
                    <button
                      type="button"
                      key={o.l}
                      className={`segmented-btn ${form.coupon_in_profit === o.v ? 'is-active' : ''}`}
                      onClick={() => set('coupon_in_profit', o.v)}
                      disabled={!(Number(form.coupon_cashback) > 0)}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Remark <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
              </label>
              <textarea
                className={`form-input ${errors.remark ? 'error' : ''}`}
                rows={2}
                maxLength={200}
                placeholder="Any note about this order…"
                value={form.remark}
                onChange={e => set('remark', e.target.value)}
              />
              <div className="form-hint" style={{ textAlign: 'right' }}>{form.remark.length}/200</div>
              {errors.remark && <div className="form-error">{errors.remark}</div>}
            </div>

            {/* Summary */}
            <div className="order-summary-bar">
              <div className="order-summary-item">
                <span className="order-summary-label">Total Order</span>
                <strong style={{ color: 'var(--danger)' }}>₹{form.order_amount || 0}</strong>
              </div>
              <div className="order-summary-item">
                <span className="order-summary-label">Total Return</span>
                <strong style={{ color: 'var(--accent)' }}>₹{form.return_amount || 0}</strong>
              </div>
              {isFriendCard && (
                <div className="order-summary-item">
                  <span className="order-summary-label">{friendName} Earns</span>
                  <strong style={{ color: 'var(--text)' }}>{fmtCurrency(estFriendEarning)}</strong>
                </div>
              )}
              {Number(form.coupon_cashback) > 0 && (
                <div className="order-summary-item">
                  <span className="order-summary-label">Coupon{form.coupon_in_profit ? '' : ' (not in profit)'}</span>
                  <strong style={{ color: form.coupon_in_profit ? 'var(--success)' : 'var(--text-muted)' }}>{fmtCurrency(Number(form.coupon_cashback))}</strong>
                </div>
              )}
              <div className="order-summary-item">
                <span className="order-summary-label">{isFriendCard ? 'Your Profit' : 'Est. Profit'}</span>
                <strong style={{ color: estProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>₹{estProfit}</strong>
              </div>
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="order-form" className="btn btn-primary" disabled={loading}>
            <Save size={16} /> {loading ? 'Saving…' : editOrder ? 'Save Changes' : 'Add Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

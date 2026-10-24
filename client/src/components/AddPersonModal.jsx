import { useState, useEffect } from 'react';
import { addPerson, updatePerson } from '../api';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { RELATIONS } from '../constants';

const EDITABLE_RELATIONS = ['family', 'friend'];

export default function AddPersonModal({ onClose, onSuccess, editPerson, defaultRelation = 'family' }) {
  const [form, setForm] = useState({ name: '', relation: defaultRelation, phone: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const isSelf = editPerson?.relation === 'self';

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
  };

  useEffect(() => {
    if (editPerson) {
      setForm({
        name: editPerson.name || '',
        relation: editPerson.relation,
        phone: editPerson.phone || '',
        notes: editPerson.notes || '',
      });
    }
  }, [editPerson]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = { ...form };
      if (isSelf) delete payload.relation;
      const saved = editPerson
        ? await updatePerson(editPerson._id, payload)
        : await addPerson(payload);
      toast.success(editPerson ? 'Saved' : `${RELATIONS[form.relation].label} member added`);
      onSuccess(saved);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editPerson ? `Edit ${editPerson.name}` : 'Add Family Member / Friend'}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <form id="person-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label">Relation</label>
              <div className="segmented">
                {isSelf ? (
                  <button type="button" className="segmented-btn is-active" disabled>Self</button>
                ) : EDITABLE_RELATIONS.map(r => (
                  <button
                    type="button"
                    key={r}
                    className={`segmented-btn ${form.relation === r ? 'is-active' : ''}`}
                    onClick={() => set('relation', r)}
                  >
                    {RELATIONS[r].label}
                  </button>
                ))}
              </div>
              {!isSelf && (
                <div className="form-hint">
                  {form.relation === 'friend'
                    ? 'Friends are your bookers. On their orders you record the Return to Friend. Your profit = Return from Seller − Return to Friend.'
                    : 'Orders on a family card are 100% your profit (Return − Order + Cashback).'}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                className={`form-input ${errors.name ? 'error' : ''}`}
                placeholder="e.g. Ravi Kumar"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                autoFocus
              />
              {errors.name && <div className="form-error">{errors.name}</div>}
            </div>
            <div className="form-group">
              <label className="form-label">Phone <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span></label>
              <input
                type="tel"
                className="form-input"
                placeholder="e.g. 9876543210"
                value={form.phone}
                onChange={e => set('phone', e.target.value.replace(/[^0-9+\-\s]/g, ''))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span></label>
              <textarea
                className="form-input"
                rows={2}
                maxLength={500}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="person-form" className="btn btn-primary" disabled={loading}>
            <Save size={16} /> {loading ? 'Saving…' : editPerson ? 'Save Changes' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

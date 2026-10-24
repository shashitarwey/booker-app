import { useState, useEffect, useRef } from 'react';
import { User, ChevronLeft, Trash2, AlertTriangle, DatabaseBackup, Download, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { updateProfile, requestAccountDeletion, cancelAccountDeletion, getAccountStatus, exportAccount, importAccount } from '../api';
import { toast } from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';

function parseError(err) {
  if (!err.response) return 'Cannot connect to server.';
  return err.response?.data?.error || `Error ${err.response.status}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  // Profile form
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);

  // Deletion state
  const [deletionStatus, setDeletionStatus] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Backup / restore
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef(null);

  const profileChanged = name.trim() !== user?.name || email.trim().toLowerCase() !== user?.email;

  // Fetch account deletion status on mount
  useEffect(() => {
    getAccountStatus()
      .then(setDeletionStatus)
      .catch(() => {}); // silently fail
  }, []);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name cannot be empty'); return; }
    if (!email.trim()) { toast.error('Email cannot be empty'); return; }
    setLoading(true);
    try {
      const data = await updateProfile({ name: name.trim(), email: email.trim() });
      updateUser(data.token, data.user);
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (confirmText !== 'DELETE') return;
    setDeleteLoading(true);
    try {
      const data = await requestAccountDeletion();
      setDeletionStatus({
        deletion_requested_at: data.deletion_requested_at,
        scheduled_deletion_date: data.scheduled_deletion_date,
        days_remaining: 7,
      });
      setShowConfirm(false);
      setConfirmText('');
      toast.success('Account scheduled for deletion in 7 days');
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    setDeleteLoading(true);
    try {
      await cancelAccountDeletion();
      setDeletionStatus({ deletion_requested_at: null });
      toast.success('Account deletion cancelled!');
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAccount();
      toast.success('Backup downloaded');
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      toast.error('That file is not a Booker backup');
      return;
    }
    setRestoring(true);
    try {
      const { restored } = await importAccount(backup);
      toast.success(`Restored ${restored.orders} orders, ${restored.cards} cards and ${restored.people} people`);
      // Reload so every page picks up the restored data
      setTimeout(() => window.location.assign('/'), 800);
    } catch (err) {
      toast.error(parseError(err));
      setRestoring(false);
    }
  };

  const isDeletionPending = deletionStatus?.deletion_requested_at != null;

  return (
    <>
      <div className="page-hero">
        <div className="page-hero-inner">
          <div className="page-hero-left">
            <button className="btn-back-circle" onClick={() => navigate(-1)} data-tooltip="Back">
              <ChevronLeft size={22} />
            </button>
            <div className="page-hero-title-group">
              <h1 className="page-hero-title">Profile Settings</h1>
              <span className="page-hero-subtitle">{user?.email}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="page-content">
      <div className="profile-grid">
        {/* ── Personal Info Card ─── */}
        <div className="profile-card">
          <div className="profile-card-header">
            <User size={20} />
            <h2>Personal Information</h2>
          </div>
          <form onSubmit={handleProfileSave}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="form-footer profile-form-actions">
              <Link to="/profile/change-password" className="btn btn-ghost btn-sm">
                Change Password
              </Link>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !profileChanged}
              >
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Your Data: backup & restore ─── */}
        <div className="profile-card">
          <div className="profile-card-header">
            <DatabaseBackup size={20} />
            <h2>Your Data</h2>
          </div>
          <p className="danger-zone-desc">
            Download everything (people, cards, orders, buyers, ledgers, khata, payments) as one file. Keep it somewhere safe.
            To restore, sign in to a <strong>new, empty account</strong> and upload the file. It never overwrites existing data.
          </p>
          <div className="profile-data-actions">
            <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
              <Download size={14} /> {exporting ? 'Preparing…' : 'Download all my data'}
            </button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={restoring}>
              <Upload size={14} /> {restoring ? 'Restoring…' : 'Restore from backup'}
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleRestore} />
          </div>
        </div>

        {/* ── Danger Zone: Account Deletion ─── */}
        <div className="profile-card danger-zone">
          <div className="profile-card-header danger-zone-header">
            <Trash2 size={20} />
            <h2>Delete Account</h2>
          </div>

          {isDeletionPending ? (
            <div className="deletion-pending">
              <div className="deletion-warning-banner">
                <AlertTriangle size={18} />
                <div>
                  <strong>Account deletion is scheduled</strong>
                  <p>
                    Your account and all data will be permanently deleted on{' '}
                    <strong>{formatDate(deletionStatus.scheduled_deletion_date)}</strong>
                    {deletionStatus.days_remaining != null && (
                      <> ({deletionStatus.days_remaining} day{deletionStatus.days_remaining !== 1 ? 's' : ''} remaining)</>
                    )}.
                  </p>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleCancelDeletion}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Cancelling…' : 'Cancel Deletion'}
              </button>
            </div>
          ) : (
            <>
              <p className="danger-zone-desc">
                Once deleted, your account and all associated data (cards, transactions, orders, sellers, payments) will be <strong>permanently removed</strong>. You have <strong>7 days</strong> to log back in and cancel the request.
              </p>

              {!showConfirm ? (
                <button
                  className="btn btn-danger"
                  onClick={() => setShowConfirm(true)}
                >
                  <Trash2 size={14} /> Request Account Deletion
                </button>
              ) : (
                <div className="deletion-confirm">
                  <p className="deletion-confirm-label">
                    Type <strong>DELETE</strong> to confirm:
                  </p>
                  <input
                    className="form-input deletion-confirm-input"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    autoFocus
                  />
                  <div className="deletion-confirm-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setShowConfirm(false); setConfirmText(''); }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={handleRequestDeletion}
                      disabled={confirmText !== 'DELETE' || deleteLoading}
                    >
                      {deleteLoading ? 'Processing…' : 'Confirm Deletion'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

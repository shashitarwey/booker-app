import { useState, useMemo } from 'react';
import { CreditCard, CheckCircle2, XCircle, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { resetPassword } from '../api';
import { toast } from 'react-hot-toast';
import { useParams, Link } from 'react-router-dom';

const PW_RULES = [
  { label: 'At least 8 characters',       test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)',   test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)',   test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0–9)',             test: (p) => /[0-9]/.test(p) },
  { label: 'One special character (!@#…)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function parseError(err) {
  if (!err.response) return 'Cannot connect to server. Is it running?';
  return err.response?.data?.error || `Error ${err.response.status}`;
}

export default function ResetPasswordPage() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [touched, setTouched] = useState(false);
  const [success, setSuccess] = useState(false);

  const ruleResults = useMemo(() => PW_RULES.map(r => ({ ...r, ok: r.test(password) })), [password]);
  const passwordValid = ruleResults.every(r => r.ok);
  const passwordsMatch = password === confirmPw;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passwordValid) { toast.error('Password does not meet the requirements'); return; }
    if (!passwordsMatch) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await resetPassword(token, { password });
      setSuccess(true);
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo"><CreditCard size={28} /><span>Booker</span></div>

        {success ? (
          <div className="forgot-pw-sent">
            <div className="forgot-pw-sent-icon success"><CheckCircle size={36} /></div>
            <h2>Password Reset!</h2>
            <p>Your password has been updated successfully. You can now log in with your new password.</p>
            <div className="forgot-pw-actions">
              <Link to="/" className="btn btn-primary">Go to Login</Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="auth-subtitle">Set New Password</h2>
            <p className="auth-tagline">Choose a strong password for your account</p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="input-password-wrap">
                  <input
                    className="form-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    required
                    value={password}
                    onChange={e => { setPassword(e.target.value); setTouched(true); }}
                    autoComplete="new-password"
                  />
                  {password && (
                    <button type="button" className="btn-pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
                {touched && (
                  <div className="pw-rules">
                    {ruleResults.map(r => (
                      <div key={r.label} className={`pw-rule ${r.ok ? 'ok' : 'fail'}`}>
                        {r.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {r.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <div className="input-password-wrap">
                  <input
                    className="form-input"
                    type={showConfirmPw ? 'text' : 'password'}
                    placeholder="Re-enter new password"
                    required
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    autoComplete="new-password"
                  />
                  {confirmPw && (
                    <button type="button" className="btn-pw-toggle" onClick={() => setShowConfirmPw(v => !v)} tabIndex={-1}>
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
                {confirmPw && !passwordsMatch && <p className="pw-mismatch">Passwords do not match</p>}
                {confirmPw && passwordsMatch && password && <p className="pw-match">Passwords match ✓</p>}
              </div>

              <div className="form-footer w-full justify-center mt-8">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !passwordValid || !passwordsMatch}
                >
                  {loading ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

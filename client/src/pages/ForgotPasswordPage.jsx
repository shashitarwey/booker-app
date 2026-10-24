import { useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { forgotPassword } from '../api';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';

function parseError(err) {
  if (!err.response) return 'Cannot connect to server. Is it running?';
  return err.response?.data?.error || `Error ${err.response.status}`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Email is required'); return; }
    setLoading(true);
    try {
      await forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      toast.error(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo"><BrandMark size={28} /><span>Booker</span></div>

        {sent ? (
          <div className="forgot-pw-sent">
            <div className="forgot-pw-sent-icon"><Mail size={36} /></div>
            <h2>Check Your Email</h2>
            <p>
              If an account exists for <strong>{email}</strong>, we've sent a password reset link.
              The link expires in <strong>1 hour</strong>.
            </p>
            <p className="forgot-pw-sent-hint">
              Didn't receive it? Check your spam folder or try again.
            </p>
            <div className="forgot-pw-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => { setSent(false); setEmail(''); }}>
                Try Again
              </button>
              <Link to="/" className="btn btn-primary btn-sm">Back to Login</Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="auth-subtitle">Forgot Password</h2>
            <p className="auth-tagline">Enter your email and we'll send a reset link</p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-footer w-full justify-center mt-8">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </div>
            </form>

            <div className="auth-alt-link">
              <Link to="/">
                <ArrowLeft size={14} /> Back to Login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

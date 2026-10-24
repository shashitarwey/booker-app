import { useState, useMemo } from 'react';
import { CreditCard, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';

// Password rules
const RULES = [
  { label: 'At least 8 characters',      test: (p) => p.length >= 8 },
  { label: 'One uppercase letter (A–Z)',  test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)',  test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0–9)',            test: (p) => /[0-9]/.test(p) },
  { label: 'One special character (!@#…)',test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function parseError(err) {
  if (!err.response) return 'Cannot connect to server. Is it running?';
  return err.response?.data?.error || `Error ${err.response.status}: ${err.response.statusText}`;
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const [tab,     setTab]   = useState('login');
  const [loading, setLoading] = useState(false);
  const [form,    setForm]  = useState({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState(false); // show rules only once user types in pw
  const [showPw,  setShowPw]  = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const ruleResults = useMemo(() => RULES.map(r => ({ ...r, ok: r.test(form.password) })), [form.password]);
  const passwordValid = ruleResults.every(r => r.ok);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (tab === 'register' && !passwordValid) {
      toast.error('Password does not meet the requirements below');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        await login(form.email, form.password);
      } else {
        if (!form.name.trim()) { toast.error('Name is required'); return; }
        await register(form.name, form.email, form.password);
      }
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
        <p className="auth-tagline">Track all your credit card spends in one place</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login'    ? 'active' : ''}`} onClick={() => setTab('login')}>Login</button>
          <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Register</button>
        </div>

        <form onSubmit={handleSubmit}>
          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" placeholder="Shashikant Kumar" required
                value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@example.com" required
              value={form.email} onChange={e => set('email', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-password-wrap">
              <input
                className="form-input"
                type={showPw ? 'text' : 'password'}
                placeholder={tab === 'register' ? 'Create a strong password' : 'Your password'}
                required
                value={form.password}
                onChange={e => { set('password', e.target.value); setTouched(true); }}
              />
              {form.password && (
                <button
                  type="button"
                  className="btn-pw-toggle"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>

            {/* Inline rules — visible only on register tab after user starts typing */}
            {tab === 'register' && touched && (
              <div className="pw-rules">
                {ruleResults.map(r => (
                  <div key={r.label} className={`pw-rule ${r.ok ? 'ok' : 'fail'}`}>
                    {r.ok
                      ? <CheckCircle2 size={13} />
                      : <XCircle      size={13} />}
                    {r.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-footer w-full justify-center mt-8">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || (tab === 'register' && touched && !passwordValid)}
            >
              {loading ? 'Please wait…' : tab === 'login' ? 'Login' : 'Create Account'}
            </button>
          </div>

          {tab === 'login' && (
            <div className="auth-alt-link">
              <Link to="/forgot-password">Forgot your password?</Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

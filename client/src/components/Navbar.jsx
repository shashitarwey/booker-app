import { useState, useEffect, useRef } from 'react';
import { CreditCard, LogOut, Sun, Moon, Search, Menu, X as XIcon, ShoppingBag, Users, UserCog, BarChart3, History, BookOpen, ContactRound, LayoutDashboard, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import GlobalSearch from '../common/GlobalSearch';
import { Link, NavLink, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/',          label: 'Dashboard',        icon: LayoutDashboard, end: true },
  { to: '/people/family', label: 'People',      icon: ContactRound },
  { to: '/orders',    label: 'Orders',           icon: ShoppingBag },
  { to: '/sellers',   label: 'Buyers',           icon: Users },
  { to: '/khata',     label: 'Khata Book',       icon: BookOpen },
  { to: '/analytics', label: 'Analytics',        icon: BarChart3 },
  { to: '/reports/spends', label: 'ITR Spend Report', icon: FileText },
  { to: '/activity',  label: 'Activity Log',     icon: History },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showSearch, setShowSearch] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileQuery, setMobileQuery] = useState('');
  const [mobileSearchActive, setMobileSearchActive] = useState(false);
  const location = useLocation();
  const mobileSearchRef = useRef(null);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (user) setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [user]);

  // Close mobile menu + inline search on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileQuery('');
    setMobileSearchActive(false);
  }, [location.pathname]);

  return (
    <>
      {/* Desktop sidebar (≥900px). The top header below takes over on smaller screens. */}
      {user && (
        <aside className="app-sidebar">
          <Link to="/" className="sidebar-brand">
            <div className="sidebar-brand-mark"><CreditCard size={18} /></div>
            <span>Booker</span>
          </Link>

          <button className="sidebar-search" onClick={() => setShowSearch(true)} title="Search (⌘K)">
            <Search size={15} />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} title={label} aria-label={label} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <Link to="/profile" className="sidebar-user">
              <div className="sidebar-user-avatar">{(user.name || '?').charAt(0).toUpperCase()}</div>
              <div className="sidebar-user-meta">
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-sub">View profile</div>
              </div>
            </Link>
            <div className="sidebar-footer-actions">
              <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="icon-btn" onClick={logout} aria-label="Logout" title="Logout">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>
      )}

      <header className="app-header">
        <div className="header-inner">
          {/* Hamburger — mobile only */}
          {user && (
            <button
              className="btn-hamburger show-on-mobile-only"
              onClick={() => setMobileMenuOpen(o => !o)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <XIcon size={22} /> : <Menu size={22} />}
            </button>
          )}

          <Link to="/" className="d-flex items-center" style={{ gap: '12px', textDecoration: 'none', cursor: 'pointer', color: 'var(--text)' }}>
            <div className="logo-icon"><CreditCard size={22} /></div>
            <span className="logo-text hide-on-mobile">Booker</span>
          </Link>

          {/* Global search trigger — desktop */}
          {user && (
            <button
              className="gs-trigger-btn hide-on-mobile"
              onClick={() => setShowSearch(true)}
              data-tooltip="Global Search"
            >
              <Search size={14} />
              Search…
              <span className="gs-trigger-shortcut">⌘K</span>
            </button>
          )}

          {/* Mobile search input — center of header */}
          {user && (
            <div className="mobile-search-wrap show-on-mobile-only" ref={mobileSearchRef}>
              <Search size={14} className="mobile-search-icon" />
              <input
                className="mobile-search-input"
                type="text"
                placeholder="Search…"
                value={mobileQuery}
                onChange={e => { setMobileQuery(e.target.value); setMobileSearchActive(true); }}
                onFocus={() => { if (mobileQuery) setMobileSearchActive(true); }}
                autoComplete="off"
              />
              {mobileQuery && (
                <button
                  className="mobile-search-clear"
                  onClick={() => { setMobileQuery(''); setMobileSearchActive(false); }}
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
          )}

          <div className="header-actions">
            <span className="header-user hide-on-mobile">👋 {user ? user.name : 'Guest'}</span>
            <button className="btn btn-ghost btn-sm" onClick={toggleTheme} data-tooltip={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {user && (
              <Link to="/profile" className="btn btn-ghost btn-sm hide-on-mobile" data-tooltip="Profile Settings" style={{ color: 'var(--text)' }}>
                <UserCog size={14} />
              </Link>
            )}
            {user && (
              <button className="btn btn-ghost btn-sm hide-on-mobile" onClick={logout} data-tooltip="Logout">
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile slide-out drawer — must be outside <header> to escape sticky stacking context */}
      {user && mobileMenuOpen && (
        <>
          <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <nav className="mobile-menu-drawer">
            <div className="mobile-menu-user">👋 {user.name}</div>
            <div className="mobile-menu-links">
              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-menu-link${isActive ? ' active' : ''}`}>
                  <Icon size={18} /> {label}
                </NavLink>
              ))}
              <NavLink to="/profile" className={({ isActive }) => `mobile-menu-link${isActive ? ' active' : ''}`}>
                <UserCog size={18} /> Profile
              </NavLink>
            </div>
            <div className="mobile-menu-footer">
              <button className="mobile-menu-logout" onClick={() => { setMobileMenuOpen(false); logout(); }}>
                <LogOut size={18} /> Logout
              </button>
            </div>
          </nav>
        </>
      )}

      {/* Inline mobile search results dropdown */}
      {user && mobileSearchActive && mobileQuery && (
        <>
          <div className="gs-inline-backdrop" onClick={() => setMobileSearchActive(false)} />
          <GlobalSearch
            inline
            externalQuery={mobileQuery}
            onClose={() => { setMobileQuery(''); setMobileSearchActive(false); }}
          />
        </>
      )}

      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
    </>
  );
}

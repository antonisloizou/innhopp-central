import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.webp';
import { useAuth } from '../auth/AuthProvider';
import { isParticipantOnlySession } from '../auth/access';

const Layout = () => {
  const { logout, stopImpersonating, user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const participantOnly = isParticipantOnlySession(user);
  const navItems = participantOnly
    ? [{ to: '/events', label: 'Events' }]
    : [
        { to: '/events', label: 'Events' },
        { to: '/participants', label: 'Participants' },
        { to: '/logistics', label: 'Logistics' }
      ];
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem('innhopp-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const preventNumberScroll = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      const activeNumberInput = target?.closest('input[type="number"]');
      if (activeNumberInput && document.activeElement === activeNumberInput) {
        event.preventDefault();
      }
    };
    window.addEventListener('wheel', preventNumberScroll, { passive: false });
    return () => window.removeEventListener('wheel', preventNumberScroll);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('innhopp-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const shouldLockScroll =
      navOpen && window.matchMedia && window.matchMedia('(max-width: 960px)').matches;
    document.body.classList.toggle('nav-open', shouldLockScroll);
    return () => document.body.classList.remove('nav-open');
  }, [navOpen]);

  const handleNavClick = () => setNavOpen(false);
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  const handleLogout = async () => {
    await logout();
    setNavOpen(false);
    navigate('/login', { replace: true });
  };

  const handleStopImpersonation = async () => {
    try {
      setRestoring(true);
      await stopImpersonating();
      window.location.replace(`${location.pathname}${location.search}${location.hash}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src={logo} alt="Innhopp Central logo" className="brand-logo" />
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`ghost menu-toggle ${navOpen ? 'open' : ''}`}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className="menu-icon" aria-hidden="true">
              <span className="bar" />
              <span className="bar" />
              <span className="bar" />
            </span>
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav className={`app-nav ${navOpen ? 'open' : ''}`}>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/events'}
                  reloadDocument
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={handleNavClick}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="nav-bottom">
            <NavLink
              to="/profile"
              reloadDocument
              className={({ isActive }) => (isActive ? 'nav-user nav-user-link active' : 'nav-user nav-user-link')}
              onClick={handleNavClick}
            >
              {user?.full_name || user?.email}
            </NavLink>
            <button type="button" className="nav-link logout-link" onClick={() => void handleLogout()}>
              Sign out
            </button>
            <div className="nav-footer">
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={toggleTheme}
                aria-pressed={theme === 'light'}
              >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
          </div>
        </nav>
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
        <main className="app-content">
          {user?.impersonator && (
            <section className="card" style={{ marginBottom: '1rem' }}>
              <div className="page-header" style={{ gap: '1rem' }}>
                <div>
                  <strong>Impersonating {user.full_name || user.email}</strong>
                  <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                    Original admin: {user.impersonator.full_name || user.impersonator.email}
                  </p>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={restoring}
                    onClick={() => void handleStopImpersonation()}
                  >
                    {restoring ? 'Restoring…' : 'Stop impersonating'}
                  </button>
                </div>
              </div>
            </section>
          )}
          <Outlet key={location.pathname} />
        </main>
      </div>
    </div>
  );
};

export default Layout;

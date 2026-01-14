import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import logo from '../assets/logo.webp';

const navItems = [
  { to: '/events', label: 'Events' },
  { to: '/participants', label: 'Participants' },
  { to: '/logistics', label: 'Logistics' }
];

const Layout = () => {
  const [navOpen, setNavOpen] = useState(false);
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
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={handleNavClick}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="nav-bottom">
            <NavLink to="/login" className="nav-link logout-link">
              Sign out
            </NavLink>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

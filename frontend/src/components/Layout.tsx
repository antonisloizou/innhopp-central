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

  const handleNavClick = () => setNavOpen(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src={logo} alt="Innhopp Central logo" className="brand-logo" />
          <div className="brand-text">
            <h1 className="brand-title">Innhopp Central</h1>
            <p className="brand-subtitle">Events, Participants, and Logistics all in one place</p>
          </div>
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
          <NavLink to="/login" className="logout-link">
            Sign out
          </NavLink>
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

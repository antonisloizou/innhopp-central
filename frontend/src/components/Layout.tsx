import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/events', label: 'Event Calendar' },
  { to: '/manifests', label: 'Manifest Management' },
  { to: '/participants', label: 'Participant Onboarding' },
  { to: '/logistics', label: 'Logistics Dashboards' }
];

const Layout = () => (
  <div className="app-shell">
    <header className="app-header">
      <div>
        <h1>Innhopp Central</h1>
        <p className="app-tagline">Operations, manifests, and logistics in one place.</p>
      </div>
      <NavLink to="/login" className="logout-link">
        Sign out
      </NavLink>
    </header>
    <div className="app-body">
      <nav className="app-nav">
        <ul>
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  </div>
);

export default Layout;

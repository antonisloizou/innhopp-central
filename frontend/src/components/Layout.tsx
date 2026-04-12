import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getMyParticipantProfile } from '../api/participants';
import { listMyRegistrations } from '../api/registrations';
import { useAuth } from '../auth/AuthProvider';
import { isParticipantOnlySession } from '../auth/access';
import AppHeader from './AppHeader';

const hasText = (value?: string | number | null) => String(value ?? '').trim().length > 0;

const isProfileCompleteForRegistration = (profile: Awaited<ReturnType<typeof getMyParticipantProfile>>) =>
  hasText(profile.full_name) &&
  hasText(profile.email) &&
  hasText(profile.whatsapp) &&
  hasText(profile.license) &&
  hasText(profile.main_canopy) &&
  hasText(profile.wingload) &&
  typeof profile.years_in_sport === 'number' &&
  typeof profile.jump_count === 'number' &&
  typeof profile.recent_jump_count === 'number';

const Layout = () => {
  const { logout, stopImpersonating, user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [hasPendingDeposits, setHasPendingDeposits] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const participantOnly = isParticipantOnlySession(user);
  const forceDocumentNavigation = !!user?.impersonator;
  const navItems = participantOnly
    ? [{ to: '/events', label: 'Events' }]
    : [
        { to: '/events', label: 'Events' },
        { to: '/participants', label: 'Participants' },
        { to: '/logistics', label: 'Logistics' },
        { to: '/communications', label: 'Communications' }
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

  useEffect(() => {
    let cancelled = false;

    const loadProfileCompletion = async () => {
      if (!user) {
        setProfileIncomplete(false);
        setHasPendingDeposits(false);
        return;
      }
      try {
        const [profile, registrations] = await Promise.all([
          getMyParticipantProfile(),
          listMyRegistrations()
        ]);
        if (!cancelled) {
          setProfileIncomplete(!isProfileCompleteForRegistration(profile));
          setHasPendingDeposits(
            registrations.some((registration) =>
              (registration.payments || []).some((payment) => payment.kind === 'deposit' && payment.status === 'pending')
            )
          );
        }
      } catch (error) {
        if (cancelled) return;
        const status = (error as Error & { status?: number })?.status;
        setProfileIncomplete(status === 404);
        setHasPendingDeposits(false);
      }
    };

    void loadProfileCompletion();
    const handleProfileUpdated = () => {
      void loadProfileCompletion();
    };
    window.addEventListener('participant-profile-updated', handleProfileUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('participant-profile-updated', handleProfileUpdated);
    };
  }, [user?.email, user?.account_id]);

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
      <AppHeader
        actions={
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
        }
      />
      <div className="app-body">
        <nav className={`app-nav ${navOpen ? 'open' : ''}`}>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/events'}
                  reloadDocument={forceDocumentNavigation}
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
              reloadDocument={forceDocumentNavigation}
              className={({ isActive }) => (isActive ? 'nav-user nav-user-link active' : 'nav-user nav-user-link')}
              onClick={handleNavClick}
            >
              <span className="nav-user-label">
                <span>{user?.full_name || user?.email}</span>
                {profileIncomplete || hasPendingDeposits ? (
                  <span
                    className="nav-user-warning"
                    title={
                      profileIncomplete
                        ? 'Complete your profile to be able to register to events'
                        : 'Pending deposit payments require attention'
                    }
                    aria-label={
                      profileIncomplete
                        ? 'Complete your profile to be able to register to events'
                        : 'Pending deposit payments require attention'
                    }
                  >
                    !
                  </span>
                ) : null}
              </span>
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
            <section className="card layout-impersonation-card">
              <div className="page-header layout-impersonation-header">
                <div>
                  <strong>Impersonating {user.full_name || user.email}</strong>
                  <p className="muted layout-impersonation-copy">
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

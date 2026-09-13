import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Event, listEventSummaries } from '../api/events';
import { getMyParticipantProfile } from '../api/participants';
import { listMyRegistrations } from '../api/registrations';
import { useAuth } from '../auth/AuthProvider';
import { isParticipantOnlySession } from '../auth/access';
import { budgetsV1Enabled } from '../config/flags';
import { incompleteProfileWarning, isProfileCompleteForRegistration } from '../utils/profileCompleteness';
import AppHeader from './AppHeader';

const Layout = () => {
  const { logout, stopImpersonating, user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [hasPendingPayments, setHasPendingPayments] = useState(false);
  const [registeredEvents, setRegisteredEvents] = useState<Event[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const participantOnly = isParticipantOnlySession(user);
  // Participant-only sessions need a document navigation so the browser picks up
  // the session-backed view, matching the event gear menu behavior.
  const forceDocumentNavigation = !!user?.impersonator || participantOnly;
  const navItems = participantOnly
    ? [{ to: '/events', label: 'Events' }]
      : [
        { to: '/events', label: 'Events' },
        { to: '/checklists', label: 'Operational Checks' },
        { to: '/participants', label: 'The Innhopp Family' },
        { to: '/logistics', label: 'Logistics' },
        ...(budgetsV1Enabled ? [{ to: '/finance', label: 'Finance' }] : []),
        { to: '/communications', label: 'Communications' }
      ];
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem('innhopp-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  const registeredUpcomingEvents = useMemo(
    () =>
      registeredEvents
        .filter((event) => event.status !== 'past' && event.status !== 'cancelled')
        .sort((a, b) => {
          const byStart = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
          return byStart || a.id - b.id;
        }),
    [registeredEvents]
  );

  useEffect(() => {
    const selectNumberInputValue = (event: FocusEvent | MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const numberInput = target?.closest('input[type="number"]') as HTMLInputElement | null;
      if (!numberInput || numberInput.disabled || numberInput.readOnly) return;

      window.requestAnimationFrame(() => {
        if (document.activeElement !== numberInput) return;
        try {
          numberInput.select();
        } catch {
          // Some browsers may not support selection APIs on number inputs.
        }
      });
    };

    const preventNumberScroll = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      const activeNumberInput = target?.closest('input[type="number"]');
      if (activeNumberInput && document.activeElement === activeNumberInput) {
        event.preventDefault();
      }
    };

    window.addEventListener('focusin', selectNumberInputValue);
    window.addEventListener('click', selectNumberInputValue);
    window.addEventListener('wheel', preventNumberScroll, { passive: false });
    return () => {
      window.removeEventListener('focusin', selectNumberInputValue);
      window.removeEventListener('click', selectNumberInputValue);
      window.removeEventListener('wheel', preventNumberScroll);
    };
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
        setHasPendingPayments(false);
        return;
      }
      try {
        const [profile, registrations] = await Promise.all([
          getMyParticipantProfile(),
          listMyRegistrations()
        ]);
        if (!cancelled) {
          setProfileIncomplete(!isProfileCompleteForRegistration(profile));
          setHasPendingPayments(
            registrations.some((registration) =>
              (registration.payments || []).some((payment) => payment.status === 'pending')
            )
          );
        }
      } catch (error) {
        if (cancelled) return;
        const status = (error as Error & { status?: number })?.status;
        setProfileIncomplete(status === 404);
        setHasPendingPayments(false);
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

  useEffect(() => {
    let cancelled = false;

    const loadRegisteredEvents = async () => {
      if (!participantOnly) {
        setRegisteredEvents([]);
        return;
      }

      try {
        const [registrations, events] = await Promise.all([listMyRegistrations(), listEventSummaries()]);
        if (cancelled) return;
        const activeRegistrationEventIds = new Set(
          registrations
            .filter((registration) => registration.status !== 'cancelled' && registration.status !== 'expired')
            .map((registration) => registration.event_id)
        );
        setRegisteredEvents(events.filter((event) => activeRegistrationEventIds.has(event.id)));
      } catch {
        if (!cancelled) setRegisteredEvents([]);
      }
    };

    void loadRegisteredEvents();
    return () => {
      cancelled = true;
    };
  }, [participantOnly, user?.account_id]);

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
                {participantOnly && item.to === '/events' && registeredUpcomingEvents.length > 0 && (
                  <ul className="nav-event-links" aria-label="Your upcoming events">
                    {registeredUpcomingEvents.map((event) => (
                      <li key={event.id}>
                        <NavLink
                          to={`/events/${event.id}`}
                          reloadDocument={forceDocumentNavigation}
                          className={({ isActive }) =>
                            isActive ? 'nav-link nav-event-link active' : 'nav-link nav-event-link'
                          }
                          onClick={handleNavClick}
                        >
                          {event.name}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
                {participantOnly && item.to === '/events' && (
                  <NavLink
                    to="/profile"
                    reloadDocument={forceDocumentNavigation}
                    className={({ isActive }) =>
                      isActive ? 'nav-link nav-profile-link active' : 'nav-link nav-profile-link'
                    }
                    onClick={handleNavClick}
                  >
                    <span className="nav-user-label">
                      <span>My Profile</span>
                      {profileIncomplete || hasPendingPayments ? (
                        <span
                          className="nav-user-warning"
                          title={
                            profileIncomplete
                              ? incompleteProfileWarning
                              : 'Pending payments require attention'
                          }
                          aria-label={
                            profileIncomplete
                              ? incompleteProfileWarning
                              : 'Pending payments require attention'
                          }
                        >
                          !
                        </span>
                      ) : null}
                    </span>
                  </NavLink>
                )}
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
                {profileIncomplete || hasPendingPayments ? (
                  <span
                    className="nav-user-warning"
                    title={
                      profileIncomplete
                        ? incompleteProfileWarning
                        : 'Pending payments require attention'
                    }
                    aria-label={
                      profileIncomplete
                        ? incompleteProfileWarning
                        : 'Pending payments require attention'
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

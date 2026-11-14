import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

const RequireAuth = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="login-layout">
        <section className="login-panel">
          <p>Checking session…</p>
        </section>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.onboarding_required && location.pathname !== '/profile') {
    const slug = user.pending_registration?.event_slug;
    const target = slug
      ? `/profile?publicRegistration=1&registrationSlug=${encodeURIComponent(slug)}`
      : '/profile?publicRegistration=1';
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
};

export default RequireAuth;

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import logo from '../assets/logo.webp';
import { useAuth } from '../auth/AuthProvider';

const LoginPage = () => {
  const { user, isLoading, startLogin } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const from = location.state?.from?.pathname;

  useEffect(() => {
    setError(null);
  }, [user]);

  if (!isLoading && user) {
    return <Navigate to={typeof from === 'string' ? from : '/events'} replace />;
  }

  const handleLogin = async () => {
    try {
      setError(null);
      await startLogin();
    } catch (loginError) {
      if (loginError instanceof Error) {
        setError(loginError.message);
        return;
      }
      setError('Unable to start Google sign-in.');
    }
  };

  return (
    <div className="login-layout">
      <section className="login-panel">
        <img src={logo} alt="Innhopp Central logo" className="login-logo" />
        <button
          type="button"
          className="google-signin-button"
          onClick={() => void handleLogin()}
          disabled={isLoading}
          aria-label={isLoading ? 'Checking session' : 'Sign in with Google'}
        >
          <span className="google-signin-button__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M17.64 9.2045C17.64 8.56632 17.5827 7.95268 17.4764 7.36359H9V10.845H13.8436C13.635 11.97 12.9936 12.9232 12.03 13.5614V15.8195H14.9382C16.6405 14.2527 17.64 11.9455 17.64 9.2045Z"
                fill="#4285F4"
              />
              <path
                d="M9 18C11.43 18 13.4673 17.1941 14.9382 15.8195L12.03 13.5614C11.2241 14.1014 10.1932 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.42046 15.9486 5.42864 18 9 18Z"
                fill="#34A853"
              />
              <path
                d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.355909 6.15545 0 7.51091 0 9C0 10.4891 0.355909 11.8445 0.957273 13.0418L3.96409 10.71Z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.57955C10.3023 3.57955 11.4718 4.02773 12.3914 4.90773L15.0032 2.29591C13.4632 0.856364 11.4259 0 9 0C5.42864 0 2.42046 2.05136 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
                fill="#EA4335"
              />
            </svg>
          </span>
          <span className="google-signin-button__label">
            {isLoading ? 'Checking session…' : 'Sign in with Google'}
          </span>
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </div>
  );
};

export default LoginPage;

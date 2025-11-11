import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { googleClientId, hasConfiguredGoogleClient } from '../config/google';
import { decodeGoogleCredential, GoogleProfile } from '../utils/googleJwt';

const scriptSrc = 'https://accounts.google.com/gsi/client';

const LoginPage = () => {
  const [profile, setProfile] = useState<GoogleProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const readyToNavigate = useMemo(() => Boolean(profile?.email), [profile]);

  useEffect(() => {
    if (!buttonRef.current) {
      return;
    }

    const initializeGoogle = () => {
      if (!window.google?.accounts?.id) {
        setError('Google Identity Services SDK is unavailable.');
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          const decodedProfile = decodeGoogleCredential(response.credential);
          if (!decodedProfile) {
            setError('Unable to decode Google credential.');
            return;
          }
          setProfile(decodedProfile);
          setError(null);
        }
      });

      window.google.accounts.id.renderButton(buttonRef.current as HTMLElement, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with'
      });

      window.google.accounts.id.prompt();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);
    if (existingScript?.getAttribute('data-loaded')) {
      initializeGoogle();
      return;
    }

    const script = existingScript ?? document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      initializeGoogle();
    };

    if (!existingScript) {
      document.head.appendChild(script);
    }

    return () => {
      // No cleanup required because the Google Identity script manages its own lifecycle,
      // but keeping the return allows React to short-circuit when the component unmounts.
    };
  }, []);

  useEffect(() => {
    if (readyToNavigate) {
      const timeout = window.setTimeout(() => navigate('/events'), 800);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [readyToNavigate, navigate]);

  return (
    <div className="login-layout">
      <section className="login-panel">
        <h1>Innhopp Central Access</h1>
        <p>
          Sign in with your operational Google Workspace account to continue to manifests, logistics dashboards, and
          participant tools.
        </p>
        {!hasConfiguredGoogleClient && (
          <div className="notice warning">
            <strong>Configuration reminder:</strong> Provide <code>VITE_GOOGLE_CLIENT_ID</code> in an <code>.env</code> file to
            enable live authentication.
          </div>
        )}
        <div ref={buttonRef} className="google-button" aria-live="polite" />
        {profile && (
          <div className="profile-preview">
            <img src={profile.picture} alt={profile.name} />
            <div>
              <p className="profile-name">{profile.name}</p>
              <p className="profile-email">{profile.email}</p>
            </div>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>
      <aside className="login-sidebar">
        <h2>Why Google Identity?</h2>
        <ul>
          <li>Single sign-on reduces credential sprawl and speeds jump-day access.</li>
          <li>Multi-factor enforcement aligns with aviation safety requirements.</li>
          <li>Identity tokens can be exchanged with the Go backend for session hardening.</li>
        </ul>
      </aside>
    </div>
  );
};

export default LoginPage;

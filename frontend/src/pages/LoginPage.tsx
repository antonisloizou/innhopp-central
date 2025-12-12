import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { googleClientId, hasConfiguredGoogleClient } from '../config/google';
import { decodeGoogleCredential, GoogleProfile } from '../utils/googleJwt';

const scriptSrc = 'https://accounts.google.com/gsi/client';

const LoginPage = () => {
  const [profile, setProfile] = useState<GoogleProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [isDebugAuthenticated, setIsDebugAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const buttonRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const readyToNavigate = useMemo(
    () => Boolean(profile?.email) || isDebugAuthenticated,
    [profile, isDebugAuthenticated]
  );

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
          setDebugError(null);
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

  const handleDebugLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (username === 'admin' && password === 'admin') {
      setIsDebugAuthenticated(true);
      setDebugError(null);
      setUsername('');
      setPassword('');
      return;
    }
    setIsDebugAuthenticated(false);
    setDebugError('Invalid debug credentials. Use admin/admin.');
  };

  return (
    <div className="login-layout">
      <section className="login-panel">
        <h1>Innhopp Central</h1>
        <p>Events, Participants, Operations, Manifests, and Logistics all in one place.</p>
        <p>Sign in to continue.</p>
        <div ref={buttonRef} className="google-button" aria-live="polite" />
        <div className="debug-login" role="group" aria-labelledby="debug-login-heading">
          <h2 id="debug-login-heading">Debug credentials</h2>
          <p className="debug-login-description">
            Temporary access path for local development when Google Identity is unavailable.
          </p>
          <form onSubmit={handleDebugLogin} className="debug-login-form">
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="admin"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="admin"
                required
              />
            </label>
            <button type="submit" className="primary">Log in</button>
          </form>
          {debugError && <p className="error-text">{debugError}</p>}
          {isDebugAuthenticated && !debugError && (
            <p className="success-text">Debug login successful. Redirecting…</p>
          )}
        </div>
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
    </div>
  );
};

export default LoginPage;

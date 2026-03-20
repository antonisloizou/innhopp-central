# Innhopp Central Frontend

This package contains a React + TypeScript single-page application that provides navigation for the login, event calendar, manifest management, participant onboarding, and logistics dashboards described in the root project README.

## Getting started

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server will start on [http://localhost:5173](http://localhost:5173).

## Google OIDC login configuration

The login page now starts the backend OIDC flow at `/api/auth/login`, so the Google OAuth setup lives on the backend service rather than in `frontend/.env`. For localhost:

1. Create a Google OAuth 2.0 Client ID for a web application.
2. In Google Cloud Console add:
   - Authorized JavaScript origin: `http://localhost:5173`
   - Authorized redirect URI: `http://localhost:8080/api/auth/callback`
3. Start the backend with:

   ```env
   OIDC_ISSUER=https://accounts.google.com
   OIDC_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
   OIDC_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
   OIDC_REDIRECT_URL=http://localhost:8080/api/auth/callback
   FRONTEND_URL=http://localhost:5173
   SESSION_COOKIE_SECURE=false
   DEV_ALLOW_ALL=false
   ```

4. Restart the backend if it is already running.

## Google Maps route duration configuration

The event schedule page can show estimated driving duration for transport and ground crew routes. To enable it:

1. Create a Google Maps API key for a web app.
2. Enable the `Maps JavaScript API` on the same Google Cloud project.
3. Add this to `frontend/.env`:

   ```env
   VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
   ```

4. Restart the dev server if it is running.

When the `/login` route loads, the app checks `/api/auth/session`. If there is no session, clicking the sign-in button redirects to Google. After the backend callback succeeds, the browser is redirected back to the SPA and the cookie-backed session unlocks the protected routes.

## Available routes

| Route | Description |
| --- | --- |
| `/login` | Google OIDC hand-off through the backend |
| `/events` | Event calendar cards for upcoming experiences |
| `/manifests` | Manifest load sheets with crew assignments |
| `/participants` | Participant onboarding task summaries |
| `/logistics` | Basic logistics dashboards for transport and gear |

The shared navigation shell lives in `src/components/Layout.tsx` while page-specific content resides under `src/pages/`.

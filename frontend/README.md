# Innhopp Central Frontend

This package contains a React + TypeScript single-page application that provides navigation for the login, event calendar, manifest management, participant onboarding, and logistics dashboards described in the root project README.

## Getting started

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server will start on [http://localhost:5173](http://localhost:5173).

## Google Identity configuration

The login page integrates the [Google Identity Services JavaScript SDK](https://developers.google.com/identity/gsi/web) just like the static demo described in the project README. To use it:

1. Create a Google OAuth 2.0 Client ID for a web application.
2. Copy the client ID into a `.env` file in this directory:

   ```env
   VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
   ```

3. Restart the dev server if it is running.

## Google Maps route duration configuration

The event schedule page can show estimated driving duration for transport and ground crew routes. To enable it:

1. Create a Google Maps API key for a web app.
2. Enable the `Maps JavaScript API` on the same Google Cloud project.
3. Add this to `frontend/.env`:

   ```env
   VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
   ```

4. Restart the dev server if it is running.

When the `/login` route loads, the Google sign-in button renders automatically. After successful authentication the decoded profile preview is shown and the app navigates to the event calendar.

## Available routes

| Route | Description |
| --- | --- |
| `/login` | Google Identity login hand-off with profile preview |
| `/events` | Event calendar cards for upcoming experiences |
| `/manifests` | Manifest load sheets with crew assignments |
| `/participants` | Participant onboarding task summaries |
| `/logistics` | Basic logistics dashboards for transport and gear |

The shared navigation shell lives in `src/components/Layout.tsx` while page-specific content resides under `src/pages/`.

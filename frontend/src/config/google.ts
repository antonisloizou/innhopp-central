const placeholderClientId = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

export const googleClientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || placeholderClientId;

export const hasConfiguredGoogleClient = googleClientId !== placeholderClientId;

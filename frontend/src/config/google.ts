const placeholderClientId = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const placeholderMapsApiKey = 'YOUR_GOOGLE_MAPS_API_KEY';

export const googleClientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || placeholderClientId;

export const hasConfiguredGoogleClient = googleClientId !== placeholderClientId;

export const googleMapsApiKey =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || placeholderMapsApiKey;

export const hasConfiguredGoogleMapsApiKey = googleMapsApiKey !== placeholderMapsApiKey;

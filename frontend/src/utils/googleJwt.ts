export interface GoogleProfile {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export const decodeGoogleCredential = (credential: string): GoogleProfile | null => {
  try {
    const [, payload] = credential.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded));
    return decoded as GoogleProfile;
  } catch (error) {
    console.error('Failed to decode Google credential', error);
    return null;
  }
};

import { ParticipantProfile } from '../api/participants';

const hasText = (value?: string | number | null) => String(value ?? '').trim().length > 0;

export const isProfileCompleteForRegistration = (profile: ParticipantProfile) =>
  hasText(profile.full_name) &&
  hasText(profile.email) &&
  hasText(profile.whatsapp) &&
  hasText(profile.license) &&
  hasText(profile.main_canopy) &&
  hasText(profile.wingload) &&
  typeof profile.years_in_sport === 'number' &&
  typeof profile.jump_count === 'number' &&
  typeof profile.recent_jump_count === 'number';

export const incompleteProfileWarning = 'Complete your profile to be able to register to events';

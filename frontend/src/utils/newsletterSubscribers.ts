import type { ParticipantProfile } from '../api/participants';

export const isNewsletterSubscriberOnly = (profile: ParticipantProfile, eventCount: number) => {
  const normalize = (value: string) => value.trim().toLowerCase();
  const hasAdditionalText = [
    profile.phone,
    profile.notes,
    profile.emergency_contact,
    profile.emergency_contact_name,
    profile.emergency_contact_phone,
    profile.whatsapp,
    profile.instagram,
    profile.citizenship,
    profile.date_of_birth,
    profile.main_canopy,
    profile.wingload,
    profile.license,
    profile.canopy_course,
    profile.landing_area_preference,
    profile.tshirt_size,
    profile.tshirt_gender,
    profile.medical_conditions
  ].some((value) => Boolean(value?.trim()));
  const hasAdditionalValues =
    typeof profile.years_in_sport === 'number' ||
    typeof profile.jump_count === 'number' ||
    typeof profile.recent_jump_count === 'number' ||
    profile.ratings.length > 0 ||
    profile.disciplines.length > 0 ||
    profile.other_air_sports.length > 0 ||
    profile.dietary_restrictions.length > 0 ||
    profile.medical_expertise.length > 0 ||
    profile.hss_qualities.length > 0 ||
    profile.roles.some((role) => role !== 'Participant') ||
    profile.account_roles.length > 0;

  return eventCount === 0 &&
    normalize(profile.full_name) === normalize(profile.email) &&
    !hasAdditionalText &&
    !hasAdditionalValues;
};

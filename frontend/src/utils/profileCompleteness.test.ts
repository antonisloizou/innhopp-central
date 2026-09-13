import { describe, expect, it } from 'vitest';
import { ParticipantProfile } from '../api/participants';
import { isProfileCompleteForRegistration } from './profileCompleteness';

const completeProfile: ParticipantProfile = {
  id: 1,
  full_name: 'Aviator Ada',
  email: 'ada@example.test',
  emergency_contact_name: 'Grace Hopper',
  emergency_contact_phone: '+49 123 456',
  whatsapp: '+49 987 654',
  jumper: true,
  years_in_sport: 4,
  jump_count: 300,
  recent_jump_count: 25,
  main_canopy: 'Sabre 3',
  wingload: '1.2',
  license: 'C',
  roles: ['Participant'],
  ratings: [],
  disciplines: [],
  other_air_sports: [],
  dietary_restrictions: [],
  medical_expertise: [],
  hss_qualities: [],
  account_roles: [],
  created_at: '2026-09-13T00:00:00Z'
};

describe('isProfileCompleteForRegistration', () => {
  it('keeps a profile incomplete when emergency contact details are missing', () => {
    expect(isProfileCompleteForRegistration({ ...completeProfile, emergency_contact_name: '' })).toBe(false);
    expect(isProfileCompleteForRegistration({ ...completeProfile, emergency_contact_phone: '' })).toBe(false);
  });
});

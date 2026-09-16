import { describe, expect, it } from 'vitest';
import type { ParticipantProfile } from '../api/participants';
import { isNewsletterSubscriberOnly } from './newsletterSubscribers';

const newsletterProfile: ParticipantProfile = {
  id: 1,
  full_name: 'subscriber@example.com',
  email: 'subscriber@example.com',
  jumper: false,
  roles: ['Participant'],
  ratings: [],
  disciplines: [],
  other_air_sports: [],
  dietary_restrictions: [],
  accommodation: '',
  medical_expertise: [],
  hss_qualities: [],
  account_roles: [],
  created_at: ''
};

describe('isNewsletterSubscriberOnly', () => {
  it('identifies an unassigned newsletter-only profile', () => {
    expect(isNewsletterSubscriberOnly(newsletterProfile, 0)).toBe(true);
  });

  it('keeps a profile that has been assigned to an event', () => {
    expect(isNewsletterSubscriberOnly(newsletterProfile, 1)).toBe(false);
  });

  it('keeps a profile with additional information', () => {
    expect(isNewsletterSubscriberOnly({ ...newsletterProfile, phone: '+386 40 123 456' }, 0)).toBe(false);
  });
});

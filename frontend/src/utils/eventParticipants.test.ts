import { describe, expect, it } from 'vitest';
import type { ParticipantProfile } from '../api/participants';
import { countVisibleParticipants } from './eventParticipants';

const participant = (id: number, roles: string[]): ParticipantProfile => ({
  id,
  full_name: `Participant ${id}`,
  email: `p${id}@example.com`,
  jumper: true,
  roles,
  ratings: [],
  disciplines: [],
  other_air_sports: [],
  dietary_restrictions: [],
  medical_expertise: [],
  hss_qualities: [],
  account_roles: [],
  created_at: '2026-01-01T00:00:00Z'
});

describe('countVisibleParticipants', () => {
  it('excludes staff when role data is available', () => {
    const lookup = new Map<number, ParticipantProfile>([
      [1, participant(1, ['Participant'])],
      [2, participant(2, ['Participant', 'Staff'])],
      [3, participant(3, ['Jump Master'])]
    ]);

    expect(countVisibleParticipants([1, 2, 3], lookup)).toBe(2);
  });

  it('counts unknown profiles instead of dropping them', () => {
    expect(countVisibleParticipants([1, 2], new Map())).toBe(2);
  });

  it('returns zero for empty input', () => {
    expect(countVisibleParticipants(undefined, new Map())).toBe(0);
  });
});

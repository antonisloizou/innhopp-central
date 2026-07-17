import type { ParticipantProfile } from '../api/participants';

export const countVisibleParticipants = (
  participantIds?: number[] | null,
  participantLookup?: Map<number, ParticipantProfile>,
  participantCount?: number | null
) => {
  if (typeof participantCount === 'number' && Number.isFinite(participantCount)) {
    return Math.max(0, participantCount);
  }
  if (!Array.isArray(participantIds)) return 0;

  return participantIds.reduce((count, id) => {
    const roles = participantLookup?.get(id)?.roles;
    return Array.isArray(roles) && roles.includes('Staff') ? count : count + 1;
  }, 0);
};

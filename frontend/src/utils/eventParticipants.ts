import type { ParticipantProfile } from '../api/participants';

export const countVisibleParticipants = (
  participantIds?: number[] | null,
  participantLookup?: Map<number, ParticipantProfile>
) => {
  if (!Array.isArray(participantIds)) return 0;

  return participantIds.reduce((count, id) => {
    const roles = participantLookup?.get(id)?.roles;
    return Array.isArray(roles) && roles.includes('Staff') ? count : count + 1;
  }, 0);
};

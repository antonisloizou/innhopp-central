import { apiRequest } from './client';

export type RosterCheckInEntry = {
  participant_id: number;
  participant_name: string;
  roles: string[];
  is_present: boolean;
  distance_from_target_meters?: number | null;
};

export type RosterCheckIn = {
  id: number;
  event_id: number;
  schedule_item_type: RosterCheckInItemType;
  schedule_item_id: number;
  checked_in_count: number;
  expected_count: number;
  average_distance_meters?: number | null;
  created_at: string;
  entries: RosterCheckInEntry[];
};

export type RosterCheckInSummary = Pick<
  RosterCheckIn,
  'schedule_item_type' | 'schedule_item_id' | 'checked_in_count' | 'expected_count' | 'average_distance_meters'
>;

export type RosterCheckInItemType = 'innhopp' | 'transport' | 'ground_crew' | 'accommodation' | 'other' | 'meal';

const itemPath = (eventId: number, itemType: RosterCheckInItemType, itemId: number) =>
  `/roster-check-ins/events/${eventId}/items/${itemType}/${itemId}`;

export const listRosterCheckInSummaries = (eventId: number) =>
  apiRequest<RosterCheckInSummary[]>(`/roster-check-ins/events/${eventId}/summaries`);

export const getRosterCheckIn = (eventId: number, itemType: RosterCheckInItemType, itemId: number) =>
  apiRequest<RosterCheckIn>(itemPath(eventId, itemType, itemId));

export const createRosterCheckIn = (eventId: number, itemType: RosterCheckInItemType, itemId: number) =>
  apiRequest<RosterCheckIn>(itemPath(eventId, itemType, itemId), { method: 'POST' });

export const updateRosterCheckInEntry = (
  checkInId: number,
  participantId: number,
  payload: { is_present?: boolean; distance_from_target_meters?: number }
) => apiRequest<RosterCheckIn>(`/roster-check-ins/${checkInId}/entries/${participantId}`, { method: 'POST', body: JSON.stringify(payload) });

export const deleteRosterCheckIn = (checkInId: number) =>
  apiRequest<void>(`/roster-check-ins/${checkInId}`, { method: 'DELETE' });

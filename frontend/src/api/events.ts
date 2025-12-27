import { apiRequest } from './client';

export type EventStatus = 'draft' | 'planned' | 'scouted' | 'launched' | 'live' | 'past';

export interface Season {
  id: number;
  name: string;
  starts_on: string;
  ends_on?: string | null;
  created_at: string;
}

export interface LandingArea {
  name?: string | null;
  description?: string | null;
  size?: string | null;
  obstacles?: string | null;
}

export interface LandOwner {
  name?: string | null;
  telephone?: string | null;
  email?: string | null;
}

export interface Innhopp {
  id: number;
  event_id: number;
  sequence: number;
  name: string;
  coordinates?: string | null;
  elevation?: number | null;
  takeoff_airfield_id?: number | null;
  scheduled_at?: string | null;
  notes?: string | null;
  reason_for_choice?: string | null;
  adjust_altimeter_aad?: string | null;
  notam?: string | null;
  distance_by_air?: number | null;
  distance_by_road?: number | null;
  primary_landing_area?: LandingArea;
  secondary_landing_area?: LandingArea;
  risk_assessment?: string | null;
  safety_precautions?: string | null;
  jumprun?: string | null;
  hospital?: string | null;
  rescue_boat?: boolean | null;
  minimum_requirements?: string | null;
  land_owners?: LandOwner[];
  land_owner_permission?: boolean | null;
  created_at: string;
}

export interface Event {
  id: number;
  season_id: number;
  name: string;
  location?: string;
  slots: number;
  status: EventStatus;
  starts_at: string;
  ends_at?: string | null;
  airfield_ids: number[];
  participant_ids: number[];
  innhopps: Innhopp[];
  created_at: string;
}

export interface Accommodation {
  id: number;
  event_id: number;
  name: string;
  capacity: number;
  coordinates?: string | null;
  booked?: boolean | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface CreateSeasonPayload {
  name: string;
  starts_on: string;
  ends_on?: string;
}

export interface CreateEventPayload {
  season_id: number;
  name: string;
  location?: string;
  slots?: number;
  status?: EventStatus;
  starts_at: string;
  ends_at?: string;
  airfield_ids?: number[];
  participant_ids?: number[];
  innhopps?: InnhoppInput[];
}

export const listSeasons = () => apiRequest<Season[]>('/events/seasons');

export const createSeason = (payload: CreateSeasonPayload) =>
  apiRequest<Season>('/events/seasons', { method: 'POST', body: JSON.stringify(payload) });

export const listEvents = () => apiRequest<Event[]>('/events/events');

export const createEvent = (payload: CreateEventPayload) =>
  apiRequest<Event>('/events/events', { method: 'POST', body: JSON.stringify(payload) });

export const getEvent = (id: number) => apiRequest<Event>(`/events/events/${id}`);
export const deleteEvent = (id: number) =>
  apiRequest<void>(`/events/events/${id}`, { method: 'DELETE' });

export const listAccommodations = (eventId: number) =>
  apiRequest<Accommodation[]>(`/events/events/${eventId}/accommodations`);
export const listAllAccommodations = () => apiRequest<Accommodation[]>(`/events/accommodations`);

export type CreateAccommodationPayload = {
  name: string;
  capacity: number;
  coordinates?: string;
  booked?: boolean;
  check_in_at?: string;
  check_out_at?: string;
  notes?: string;
};

export const createAccommodation = (eventId: number, payload: CreateAccommodationPayload) =>
  apiRequest<Accommodation>(`/events/events/${eventId}/accommodations`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getAccommodation = (eventId: number, accId: number) =>
  apiRequest<Accommodation>(`/events/events/${eventId}/accommodations/${accId}`);

export const updateAccommodation = (eventId: number, accId: number, payload: CreateAccommodationPayload) =>
  apiRequest<Accommodation>(`/events/events/${eventId}/accommodations/${accId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteAccommodation = (eventId: number, accId: number) =>
  apiRequest<void>(`/events/events/${eventId}/accommodations/${accId}`, { method: 'DELETE' });

export interface InnhoppInput {
  sequence?: number;
  name: string;
  coordinates?: string;
  elevation?: number;
  takeoff_airfield_id?: number;
  scheduled_at?: string;
  notes?: string;
  reason_for_choice?: string;
  adjust_altimeter_aad?: string;
  notam?: string;
  distance_by_air?: number;
  distance_by_road?: number;
  primary_landing_area?: LandingArea;
  secondary_landing_area?: LandingArea;
  risk_assessment?: string;
  safety_precautions?: string;
  jumprun?: string;
  hospital?: string;
  rescue_boat?: boolean;
  minimum_requirements?: string;
  land_owners?: LandOwner[];
  land_owner_permission?: boolean;
}

export interface UpdateInnhoppPayload {
  sequence?: number;
  name: string;
  coordinates?: string;
  elevation?: number;
  takeoff_airfield_id?: number;
  scheduled_at?: string;
  notes?: string;
  reason_for_choice?: string;
  adjust_altimeter_aad?: string;
  notam?: string;
  distance_by_air?: number;
  distance_by_road?: number;
  primary_landing_area?: LandingArea;
  secondary_landing_area?: LandingArea;
  risk_assessment?: string;
  safety_precautions?: string;
  jumprun?: string;
  hospital?: string;
  rescue_boat?: boolean;
  minimum_requirements?: string;
  land_owners?: LandOwner[];
  land_owner_permission?: boolean;
}

export interface UpdateEventPayload extends CreateEventPayload {
  participant_ids?: number[];
  innhopps?: InnhoppInput[];
}

export const updateEvent = (id: number, payload: UpdateEventPayload) =>
  apiRequest<Event>(`/events/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const getInnhopp = (id: number) => apiRequest<Innhopp>(`/innhopps/${id}`);

export const createInnhopp = (eventId: number, payload: InnhoppInput) =>
  apiRequest<Innhopp>(`/events/events/${eventId}/innhopps`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateInnhopp = (id: number, payload: UpdateInnhoppPayload) =>
  apiRequest<Innhopp>(`/innhopps/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteInnhopp = (id: number) =>
  apiRequest<void>(`/innhopps/${id}`, { method: 'DELETE' });

export interface Manifest {
  id: number;
  event_id: number;
  load_number: number;
  capacity: number;
  staff_slots?: number | null;
  notes?: string | null;
  participant_ids: number[];
  created_at: string;
}

export interface CreateManifestPayload {
  event_id: number;
  load_number: number;
  capacity?: number;
  staff_slots?: number;
  notes?: string;
  participant_ids?: number[];
}

export const listManifests = () => apiRequest<Manifest[]>('/events/manifests');

export const createManifest = (payload: CreateManifestPayload) =>
  apiRequest<Manifest>('/events/manifests', { method: 'POST', body: JSON.stringify(payload) });

export const getManifest = (id: number) => apiRequest<Manifest>(`/events/manifests/${id}`);

export const updateManifest = (id: number, payload: CreateManifestPayload) =>
  apiRequest<Manifest>(`/events/manifests/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

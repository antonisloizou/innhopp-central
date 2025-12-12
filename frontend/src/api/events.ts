import { apiRequest } from './client';

export type EventStatus = 'draft' | 'planned' | 'scouted' | 'launched' | 'live' | 'past';

export interface Season {
  id: number;
  name: string;
  starts_on: string;
  ends_on?: string | null;
  created_at: string;
}

export interface Innhopp {
  id: number;
  event_id: number;
  sequence: number;
  name: string;
  scheduled_at?: string | null;
  notes?: string | null;
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
  participant_ids: number[];
  innhopps: Innhopp[];
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

export interface InnhoppInput {
  sequence?: number;
  name: string;
  scheduled_at?: string;
  notes?: string;
}

export interface UpdateEventPayload extends CreateEventPayload {
  participant_ids?: number[];
  innhopps?: InnhoppInput[];
}

export const updateEvent = (id: number, payload: UpdateEventPayload) =>
  apiRequest<Event>(`/events/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export interface Manifest {
  id: number;
  event_id: number;
  load_number: number;
  capacity: number;
  notes?: string | null;
  participant_ids: number[];
  created_at: string;
}

export interface CreateManifestPayload {
  event_id: number;
  load_number: number;
  capacity?: number;
  notes?: string;
  participant_ids?: number[];
}

export const listManifests = () => apiRequest<Manifest[]>('/events/manifests');

export const createManifest = (payload: CreateManifestPayload) =>
  apiRequest<Manifest>('/events/manifests', { method: 'POST', body: JSON.stringify(payload) });

export const getManifest = (id: number) => apiRequest<Manifest>(`/events/manifests/${id}`);

export const updateManifest = (id: number, payload: CreateManifestPayload) =>
  apiRequest<Manifest>(`/events/manifests/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

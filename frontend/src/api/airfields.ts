import { apiRequest } from './client';

export interface Airfield {
  id: number;
  name: string;
  latitude: string;
  longitude: string;
  elevation: number;
  coordinates: string;
  description?: string | null;
  created_at: string;
}

export interface CreateAirfieldPayload {
  name: string;
  elevation: number;
  coordinates: string;
  description?: string;
}

export const listAirfields = () => apiRequest<Airfield[]>('/events/airfields');

export const createAirfield = (payload: CreateAirfieldPayload) =>
  apiRequest<Airfield>('/events/airfields', { method: 'POST', body: JSON.stringify(payload) });

export const getAirfield = (id: number) => apiRequest<Airfield>(`/events/airfields/${id}`);

export const updateAirfield = (id: number, payload: CreateAirfieldPayload) =>
  apiRequest<Airfield>(`/events/airfields/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const deleteAirfield = (id: number) =>
  apiRequest<void>(`/events/airfields/${id}`, { method: 'DELETE' });

import { apiRequest } from './client';

export interface ParticipantProfile {
  id: number;
  full_name: string;
  email: string;
  phone?: string;
  experience_level?: string;
  emergency_contact?: string;
  roles: string[];
  created_at: string;
}

export const listParticipantProfiles = () =>
  apiRequest<ParticipantProfile[]>('/participants/profiles');

export interface CreateParticipantPayload {
  full_name: string;
  email: string;
  phone?: string;
  experience_level?: string;
  emergency_contact?: string;
  roles?: string[];
}

export const createParticipantProfile = (payload: CreateParticipantPayload) =>
  apiRequest<ParticipantProfile>('/participants/profiles', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getParticipantProfile = (id: number) =>
  apiRequest<ParticipantProfile>(`/participants/profiles/${id}`);

export const updateParticipantProfile = (id: number, payload: CreateParticipantPayload) =>
  apiRequest<ParticipantProfile>(`/participants/profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

import { apiRequest } from './client';

export interface ParticipantProfile {
  id: number;
  full_name: string;
  email: string;
  phone?: string;
  experience_level?: string;
  emergency_contact?: string;
  whatsapp?: string;
  instagram?: string;
  citizenship?: string;
  date_of_birth?: string;
  jumper: boolean;
  years_in_sport?: number;
  jump_count?: number;
  recent_jump_count?: number;
  main_canopy?: string;
  wingload?: string;
  license?: string;
  roles: string[];
  ratings: string[];
  disciplines: string[];
  other_air_sports: string[];
  canopy_course?: string;
  landing_area_preference?: string;
  tshirt_size?: string;
  tshirt_gender?: string;
  dietary_restrictions: string[];
  medical_conditions?: string;
  medical_expertise: string[];
  hss_qualities: string[];
  account_roles: string[];
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
  whatsapp?: string;
  instagram?: string;
  citizenship?: string;
  date_of_birth?: string;
  jumper?: boolean;
  years_in_sport?: number;
  jump_count?: number;
  recent_jump_count?: number;
  main_canopy?: string;
  wingload?: string;
  license?: string;
  roles?: string[];
  ratings?: string[];
  disciplines?: string[];
  other_air_sports?: string[];
  canopy_course?: string;
  landing_area_preference?: string;
  tshirt_size?: string;
  tshirt_gender?: string;
  dietary_restrictions?: string[];
  medical_conditions?: string;
  medical_expertise?: string[];
  hss_qualities?: string[];
  account_roles?: string[];
}

export const createParticipantProfile = (payload: CreateParticipantPayload) =>
  apiRequest<ParticipantProfile>('/participants/profiles', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getParticipantProfile = (id: number) =>
  apiRequest<ParticipantProfile>(`/participants/profiles/${id}`);

export const getMyParticipantProfile = () =>
  apiRequest<ParticipantProfile>('/participants/profiles/me');

export const upsertMyParticipantProfile = (payload: CreateParticipantPayload) =>
  apiRequest<ParticipantProfile>('/participants/profiles/me', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const updateParticipantProfile = (id: number, payload: CreateParticipantPayload) =>
  apiRequest<ParticipantProfile>(`/participants/profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteParticipantProfile = (id: number) =>
  apiRequest<void>(`/participants/profiles/${id}`, {
    method: 'DELETE'
  });

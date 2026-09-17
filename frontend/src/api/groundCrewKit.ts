import { apiRequest } from './client';

export type GroundCrewKitItem = { key: string; checked: boolean };
export type GroundCrewKit = { items: GroundCrewKitItem[] };

export const getGroundCrewKit = (innhoppId: number) =>
  apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/ground-crew-kit`);

export const updateGroundCrewKitItem = (innhoppId: number, key: string, checked: boolean) =>
  apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/ground-crew-kit/${key}`, {
    method: 'POST', body: JSON.stringify({ checked })
  });

export const getGroundCrewReturnKit = (innhoppId: number) => apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/ground-crew-kit?stage=site_clearing`);
export const updateGroundCrewReturnKitItem = (innhoppId: number, key: string, checked: boolean) => apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/ground-crew-kit/${key}?stage=site_clearing`, { method: 'POST', body: JSON.stringify({ checked }) });

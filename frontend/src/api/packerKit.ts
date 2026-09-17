import { apiRequest } from './client';
import type { GroundCrewKit } from './groundCrewKit';

export const getPackerKit = (innhoppId: number) =>
  apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/packer-kit`);

export const updatePackerKitItem = (innhoppId: number, key: string, checked: boolean, absent = false) =>
  apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/packer-kit/${key}`, {
    method: 'POST', body: JSON.stringify({ checked, absent })
  });

export const getPackerReturnKit = (innhoppId: number) =>
  apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/packer-kit?stage=site_clearing`);

export const updatePackerReturnKitItem = (innhoppId: number, key: string, checked: boolean, absent = false) =>
  apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/packer-kit/${key}?stage=site_clearing`, {
    method: 'POST', body: JSON.stringify({ checked, absent })
  });

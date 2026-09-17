import { apiRequest } from './client';
import type { GroundCrewKit } from './groundCrewKit';

export const getPackerTasks = (innhoppId: number) =>
  apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/packer-tasks`);

export const updatePackerTask = (innhoppId: number, key: string, checked: boolean) =>
  apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/packer-tasks/${key}`, {
    method: 'POST', body: JSON.stringify({ checked })
  });

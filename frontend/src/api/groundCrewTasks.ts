import { apiRequest } from './client';
import type { GroundCrewKit } from './groundCrewKit';

export const getGroundCrewTasks = (innhoppId: number) => apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/ground-crew-tasks`);
export const updateGroundCrewTask = (innhoppId: number, key: string, checked: boolean) => apiRequest<GroundCrewKit>(`/checklists/innhopps/${innhoppId}/ground-crew-tasks/${key}`, { method: 'POST', body: JSON.stringify({ checked }) });

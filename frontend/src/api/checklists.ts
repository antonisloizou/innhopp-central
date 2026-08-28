import { apiRequest } from './client';

export type ChecklistRole = 'jump_leader' | 'jump_master' | 'ground_crew' | 'boat_crew';
export type ChecklistPhase = 'readiness' | 'execution' | 'closeout';
export type ChecklistItem = { id: number; item_key: string; label: string; detail?: string; phase: ChecklistPhase; sort_order: number; completed: boolean; checked_by?: string; checked_at?: string };
export type ChecklistOverride = { actor: string; reason: string; created_at: string };
export type InnhoppChecklist = { innhopp_id: number; event_id: number; innhopp_name: string; role: ChecklistRole; required_roles: ChecklistRole[]; ready: boolean; overridden: boolean; override?: ChecklistOverride; operational_status: 'planned'|'proceeding'|'completed'|'cancelled'; items: ChecklistItem[] };
export type ChecklistInnhopp = { id:number; sequence:number; name:string; rescue_boat:boolean; required_roles:ChecklistRole[]; ready:boolean; overridden:boolean; operational_status:'planned'|'proceeding'|'completed'|'cancelled' };
export type ChecklistHistoryEvent = { id:number; item_label:string; role:ChecklistRole | 'admin'; action:'completed'|'reversed'|'overridden'|'reset'; actor:string; reason?:string; created_at:string };
export const listChecklistInnhopps = (eventId:number) => apiRequest<ChecklistInnhopp[]>(`/checklists/events/${eventId}/innhopps`);
export const getChecklist = (innhoppId:number, role:ChecklistRole) => apiRequest<InnhoppChecklist>(`/checklists/innhopps/${innhoppId}?role=${role}`);
export const completeChecklistItem = (innhoppId:number,itemId:number,role:ChecklistRole) => apiRequest<InnhoppChecklist>(`/checklists/innhopps/${innhoppId}/items/${itemId}/complete`,{method:'POST',body:JSON.stringify({role})});
export const reverseChecklistItem = (innhoppId:number,itemId:number,role:ChecklistRole,reason?:string) => apiRequest<InnhoppChecklist>(`/checklists/innhopps/${innhoppId}/items/${itemId}/reverse`,{method:'POST',body:JSON.stringify({role,reason:reason || ''})});
export const getChecklistHistory = (innhoppId:number) => apiRequest<ChecklistHistoryEvent[]>(`/checklists/innhopps/${innhoppId}/history`);
export const createChecklistOverride = (innhoppId:number,reason:string) => apiRequest<{overridden:boolean}>(`/checklists/innhopps/${innhoppId}/override`,{method:'POST',body:JSON.stringify({reason})});
export const resetOperationalChecks = (innhoppId:number,reason?:string) => apiRequest<{operational_status:'planned'}>(`/checklists/innhopps/${innhoppId}/reset`,{method:'POST',body:JSON.stringify({reason:reason || ''})});
export const proceedWithInnhopp = (innhoppId:number) => apiRequest<{operational_status:'proceeding'}>(`/checklists/innhopps/${innhoppId}/proceed`,{method:'POST'});
export const completeInnhoppOperation = (innhoppId:number) => apiRequest<{operational_status:'completed'}>(`/checklists/innhopps/${innhoppId}/complete-operation`,{method:'POST'});

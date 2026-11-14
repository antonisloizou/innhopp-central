import { apiRequest } from './client';

export interface Task {
  id: number;
  event_id: number;
  event_name: string;
  title: string;
  description: string;
  assignee_account_id?: number | null;
  assignee_name?: string;
  due_on?: string | null;
  completed_at?: string | null;
  completed_by_name?: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by_name?: string;
  deleted_reason?: string;
  comment_count: number;
  has_unread_notification: boolean;
  overdue: boolean;
}

export interface TaskComment {
  id: number;
  task_id: number;
  body: string;
  author_name: string;
  created_at: string;
}

export interface TaskAuditEvent {
  id: number;
  action: string;
  actor_name: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export interface TaskAssignee { id: number; name: string; roles: string[] }
export interface TaskInput {
  event_id: number;
  title: string;
  description: string;
  assignee_account_id?: number | null;
  due_on?: string | null;
}

export const listTasks = (filters: { eventId?: number; state?: string; assignee?: string; q?: string }) => {
  const params = new URLSearchParams();
  if (filters.eventId) params.set('event_id', String(filters.eventId));
  if (filters.state) params.set('state', filters.state);
  if (filters.assignee) params.set('assignee_account_id', filters.assignee);
  if (filters.q) params.set('q', filters.q);
  return apiRequest<Task[]>(`/tasks/?${params}`);
};
export const getTask = (id: number) => apiRequest<Task>(`/tasks/${id}`);
export const createTask = (payload: TaskInput) => apiRequest<Task>('/tasks/', { method: 'POST', body: JSON.stringify(payload) });
export const updateTask = (id: number, payload: Partial<TaskInput> & { updated_at: string }) => apiRequest<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const completeTask = (id: number) => apiRequest<Task>(`/tasks/${id}/complete`, { method: 'POST' });
export const reopenTask = (id: number) => apiRequest<Task>(`/tasks/${id}/reopen`, { method: 'POST' });
export const deleteTask = (id: number, reason?: string) => apiRequest<void>(`/tasks/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: reason || '' }) });
export const restoreTask = (id: number) => apiRequest<Task>(`/tasks/${id}/restore`, { method: 'POST' });
export const listTaskComments = (id: number) => apiRequest<TaskComment[]>(`/tasks/${id}/comments`);
export const addTaskComment = (id: number, body: string) => apiRequest<TaskComment>(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
export const listTaskAudit = (id: number) => apiRequest<TaskAuditEvent[]>(`/tasks/${id}/audit`);
export const listTaskAssignees = () => apiRequest<TaskAssignee[]>('/tasks/assignees');
export const getTaskNotificationSummary = () => apiRequest<{ unread_count: number; task_ids: number[] }>('/tasks/notifications/summary');
export const markTaskNotificationsRead = (id: number) => apiRequest<void>(`/tasks/${id}/notifications/read`, { method: 'POST' });

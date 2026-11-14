import { afterEach, describe, expect, it, vi } from 'vitest';
import { listTasks, updateTask } from './tasks';

afterEach(() => vi.restoreAllMocks());

describe('tasks API', () => {
  it('requests the complete filtered task collection without a client limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await listTasks({ eventId: 42, state: 'open', assignee: 'unassigned', q: 'transport' });
    const requested = String(fetchMock.mock.calls[0][0]);
    expect(requested).toContain('/api/tasks/?');
    expect(requested).toContain('event_id=42');
    expect(requested).toContain('state=open');
    expect(requested).toContain('assignee_account_id=unassigned');
    expect(requested).toContain('q=transport');
    expect(requested).not.toContain('limit=');
    expect(requested).not.toContain('cursor=');
  });

  it('sends the current updated_at version with PATCH edits', async () => {
    const response = { id: 7, updated_at: '2026-11-14T12:00:00Z' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await updateTask(7, { title: 'Updated', updated_at: '2026-11-14T11:00:00Z' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ title: 'Updated', updated_at: '2026-11-14T11:00:00Z' });
  });

  it('preserves the current task returned by a stale-write conflict', async () => {
    const currentTask = { id: 7, title: 'Someone else changed this', updated_at: '2026-11-14T12:00:00Z' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'task changed since it was opened', current_task: currentTask }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
    await expect(updateTask(7, { title: 'My edit', updated_at: '2026-11-14T11:00:00Z' })).rejects.toMatchObject({
      status: 409,
      payload: { current_task: currentTask }
    });
  });
});

import { describe, expect, it } from 'vitest';
import { StaffMeetingItem } from '../api/events';
import { defaultStaffMeetingAgenda, defaultStaffMeetingChecklist, normalizeStaffMeetingItems } from './staffMeeting';

describe('normalizeStaffMeetingItems', () => {
  it('backfills every default and keeps review schedule first in the checklist', () => {
    const result = normalizeStaffMeetingItems([], []);
    expect(result.filter((item) => item.kind === 'agenda')).toEqual(defaultStaffMeetingAgenda);
    expect(result.filter((item) => item.kind === 'tomorrow')).toEqual(defaultStaffMeetingChecklist);
    expect(result.filter((item) => item.kind === 'tomorrow')[0].title).toBe('Review schedule for tomorrow');
  });

  it('preserves checked states and notes while applying canonical default labels', () => {
    const result = normalizeStaffMeetingItems([
      { id:'default-7', title:'Tomorrow Weather', kind:'agenda', checked:true, notes:'Rain after 15:00' },
      { id:'default-tomorrow-8', title:'Old title', kind:'tomorrow', checked:true, notes:'Alex' }
    ], []);
    expect(result.find((item) => item.id === 'default-7')).toMatchObject({ title:"Tommorrow's Weather", checked:true, notes:'Rain after 15:00' });
    expect(result.find((item) => item.id === 'default-tomorrow-8')).toMatchObject({ checked:true, notes:'Alex' });
  });

  it('keeps custom items absent after removal and preserves remaining custom items', () => {
    const remaining:StaffMeetingItem = { id:'custom-2', title:'Remaining', kind:'tomorrow', checked:true, notes:'Keep me' };
    const result = normalizeStaffMeetingItems([remaining], []);
    expect(result.find((item) => item.id === 'custom-1')).toBeUndefined();
    expect(result.find((item) => item.id === 'custom-2')).toEqual(remaining);
  });

  it('emits each scheduled Innhopp exactly once when reopening a saved meeting', () => {
    const result = normalizeStaffMeetingItems([
      { id:'innhopp-21', title:'Old name', kind:'innhopp', checked:true, notes:'Windy landing' }
    ], [{ id:21, name:'New name', sequence:1 }]);
    expect(result.filter((item) => item.id === 'innhopp-21')).toEqual([
      { id:'innhopp-21', title:'New name', kind:'agenda', checked:true, notes:'Windy landing' }
    ]);
    expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
  });

  it('drops unscheduled Innhopps, adds new ones, and follows current schedule order', () => {
    const result = normalizeStaffMeetingItems([
      { id:'innhopp-10', title:'Removed', kind:'agenda', checked:true, notes:'Old' },
      { id:'innhopp-20', title:'Renamed', kind:'agenda', checked:true, notes:'Preserved' }
    ], [
      { id:30, name:'First today', sequence:1 },
      { id:20, name:'Second today', sequence:2 }
    ]);
    const rows = result.filter((item) => item.id.startsWith('innhopp-'));
    expect(rows.map((item) => item.id)).toEqual(['innhopp-30', 'innhopp-20']);
    expect(rows[1]).toMatchObject({ title:'Second today', checked:true, notes:'Preserved' });
    expect(result.find((item) => item.id === 'innhopp-10')).toBeUndefined();
  });

  it('removes the retired checklist agenda item and de-duplicates malformed custom IDs', () => {
    const result = normalizeStaffMeetingItems([
      { id:'default-5', title:'Checklist for tomorrow', kind:'agenda', checked:false },
      { id:'custom-1', title:'First copy', kind:'agenda', checked:false },
      { id:'custom-1', title:'Duplicate copy', kind:'agenda', checked:true }
    ], []);
    expect(result.find((item) => item.id === 'default-5')).toBeUndefined();
    expect(result.filter((item) => item.id === 'custom-1')).toHaveLength(1);
  });
});

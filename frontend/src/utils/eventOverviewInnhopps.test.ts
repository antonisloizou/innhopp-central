import { describe, expect, it } from 'vitest';
import { ScheduleEntry } from '../components/schedulePreviewTypes';
import { getLongestCommonPrefix, mergeOverviewInnhoppEntries, truncateEventOverviewTitle } from './eventOverviewInnhopps';

const innhopp = (id: string, sequence: number, name: string, sortValue = 600): ScheduleEntry => ({
  id,
  hourKey: '10:00',
  sortValue,
  title: `Innhopp #${sequence}: ${name}`,
  type: 'Innhopp',
  innhoppSequence: sequence,
  innhoppName: name
});

describe('event overview innhopps', () => {
  it('limits overview titles to 30 characters including the truncation marker', () => {
    expect(truncateEventOverviewTitle('Innhopp #2: North Ridge with a very long title')).toBe('Innhopp #2: North Ridge wit...');
    expect(truncateEventOverviewTitle('Short title')).toBe('Short title');
  });

  it('finds the longest common title prefix', () => {
    expect(getLongestCommonPrefix(['North Ridge A', 'North Ridge B', 'North Ridge C'])).toBe('North Ridge');
  });

  it('merges innhopps with the same sequence number', () => {
    const merged = mergeOverviewInnhoppEntries([
      innhopp('first', 2, 'North Ridge A', 660),
      innhopp('second', 2, 'North Ridge B', 600),
      innhopp('third', 3, 'South Face')
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ title: 'Innhopp #2: North Ridge', hourKey: '10:00', sortValue: 600 });
    expect(merged[1].title).toBe('Innhopp #3: South Face');
  });
});

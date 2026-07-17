import { ScheduleEntry } from '../components/schedulePreviewTypes';

const EVENT_OVERVIEW_TITLE_MAX_LENGTH = 30;

export const truncateEventOverviewTitle = (title: string): string =>
  title.length > EVENT_OVERVIEW_TITLE_MAX_LENGTH
    ? `${title.slice(0, EVENT_OVERVIEW_TITLE_MAX_LENGTH - 3)}...`
    : title;

export const getLongestCommonPrefix = (values: string[]): string => {
  if (values.length === 0) return '';

  let prefix = values[0];
  for (const value of values.slice(1)) {
    let index = 0;
    while (index < prefix.length && index < value.length && prefix[index] === value[index]) {
      index += 1;
    }
    prefix = prefix.slice(0, index);
    if (!prefix) return '';
  }

  return prefix.trim();
};

export const mergeOverviewInnhoppEntries = (entries: ScheduleEntry[]): ScheduleEntry[] => {
  const groupedEntries = new Map<number, ScheduleEntry[]>();

  entries.forEach((entry) => {
    if (entry.type !== 'Innhopp' || !Number.isFinite(entry.innhoppSequence)) return;
    const sequence = entry.innhoppSequence as number;
    groupedEntries.set(sequence, [...(groupedEntries.get(sequence) || []), entry]);
  });

  const mergedEntryByID = new Map<string, ScheduleEntry>();
  groupedEntries.forEach((group, sequence) => {
    if (group.length < 2) return;

    const first = group.reduce((earliest, entry) => (entry.sortValue < earliest.sortValue ? entry : earliest));
    const prefix = getLongestCommonPrefix(group.map((entry) => entry.innhoppName || 'Untitled innhopp'));
    mergedEntryByID.set(group[0].id, {
      ...first,
      id: group.map((entry) => entry.id).join('+'),
      title: `Innhopp #${sequence}${prefix ? `: ${prefix}` : ''}`,
      ready: group.every((entry) => entry.ready),
      sortValue: first.sortValue,
      hourKey: first.hourKey,
      scheduledAt: first.scheduledAt
    });
  });

  return entries.flatMap((entry) => {
    const mergedEntry = mergedEntryByID.get(entry.id);
    if (mergedEntry) return [mergedEntry];
    const sequence = entry.innhoppSequence;
    if (entry.type === 'Innhopp' && typeof sequence === 'number' && (groupedEntries.get(sequence)?.length || 0) > 1) {
      return [];
    }
    return [entry];
  });
};

const TZ_SUFFIX_RE = /([+-]\d{2}:?\d{2}|Z)$/i;
const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const pad = (value: number) => String(value).padStart(2, '0');

const stripTimezone = (value: string) => value.replace(TZ_SUFFIX_RE, '');

const parseParts = (raw?: string | null): DateParts | null => {
  if (!raw) return null;
  const trimmed = stripTimezone(raw.trim());
  if (!trimmed) return null;
  const match = trimmed.match(DATE_TIME_RE);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr ?? '0');
  const minute = Number(minuteStr ?? '0');
  const second = Number(secondStr ?? '0');
  if (
    [year, month, day, hour, minute, second].some((value) => Number.isNaN(value))
  ) {
    return null;
  }
  return { year, month, day, hour, minute, second };
};

export const parseEventLocal = (value?: string | null): Date | null => {
  const parts = parseParts(value);
  if (!parts) return null;
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  );
  return Number.isNaN(date.getTime()) ? null : date;
};

export const toEventLocalPickerDate = (value?: string | null): Date | undefined => {
  const parts = parseParts(value);
  if (!parts) return undefined;
  const date = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const fromEventLocalPickerDate = (date: Date): string => {
  const utcDate = new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    )
  );
  return utcDate.toISOString();
};

export const formatEventLocal = (
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  const date = parseEventLocal(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...options }).format(date);
};

export const formatEventLocalDate = (value?: string | null): string =>
  formatEventLocal(value, { dateStyle: 'medium' });

export const formatEventLocalDateInput = (value?: string | null): string => {
  const date = parseEventLocal(value);
  if (!date) return '';
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export const toEventLocalInput = (value?: string | null): string => {
  const date = parseEventLocal(value);
  if (!date) return '';
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};

export const formatEventLocalInputFromDate = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(
    date.getUTCHours()
  )}:${pad(date.getUTCMinutes())}`;

export const formatEventLocalPickerDateTime = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;

export const fromEventLocalInput = (value?: string | null): string => {
  const date = parseEventLocal(value);
  return date ? date.toISOString() : '';
};

export const fromEventLocalDateInput = (value: string): string =>
  fromEventLocalInput(value ? `${value}T00:00` : '');

export const getEventLocalTimeParts = (
  value?: string | null
): { hour: number; minute: number } | null => {
  const date = parseEventLocal(value);
  if (date) {
    return { hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
  if (!value) return null;
  const match = value.match(/(?:T|\s)(\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
};

export const getEventLocalDateKey = (value?: string | null): string => {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = parseEventLocal(value);
  if (!date) return '';
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

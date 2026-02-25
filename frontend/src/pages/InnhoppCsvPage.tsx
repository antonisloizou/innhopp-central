import { useEffect, useMemo, useState } from 'react';
import { listEvents } from '../api/events';

type CsvRow = {
  eventId: number;
  date: string;
  time: string;
  name: string;
  coordinates: string;
};

type CsvEvent = {
  id: number;
  name: string;
};

const csvEscape = (value: string) => {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
};

const toDateAndTime = (value?: string | null) => {
  if (!value) return { date: '', time: '' };
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (direct) return { date: direct[1], time: direct[2] };
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (dateOnly) return { date: dateOnly[0], time: '' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: value, time: '' };
  const iso = parsed.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

const InnhoppCsvPage = () => {
  const [events, setEvents] = useState<CsvEvent[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const events = await listEvents();
        if (!active) return;
        const eventOptions = events
          .map((event) => ({ id: event.id, name: event.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const allRows = events
          .flatMap((event) =>
            (Array.isArray(event.innhopps) ? event.innhopps : []).map((innhopp) => {
              const { date, time } = toDateAndTime(innhopp.scheduled_at);
              return {
                eventId: event.id,
                date,
                time,
                name: innhopp.name?.trim() || '',
                coordinates: innhopp.coordinates?.trim() || ''
              };
            })
          )
          .sort((a, b) => {
            const dateCmp = a.date.localeCompare(b.date);
            if (dateCmp !== 0) return dateCmp;
            const timeCmp = a.time.localeCompare(b.time);
            if (timeCmp !== 0) return timeCmp;
            return a.name.localeCompare(b.name);
          });
        setEvents(eventOptions);
        setRows(allRows);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Failed to load innhopps';
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (selectedEventId === 'all') return rows;
    const eventId = Number(selectedEventId);
    return rows.filter((row) => row.eventId === eventId);
  }, [rows, selectedEventId]);

  const csv = useMemo(() => {
    const lines = ['date,time,name,coordinates'];
    filteredRows.forEach((row) => {
      lines.push([csvEscape(row.date), csvEscape(row.time), csvEscape(row.name), row.coordinates].join(','));
    });
    return lines.join('\n');
  }, [filteredRows]);

  return (
    <section className="stack">
      <header className="page-header">
        <h1>Innhopps CSV</h1>
        <p className="muted">All innhopps as comma-separated values: date, time, name, coordinates.</p>
      </header>
      <article className="card">
        {loading ? <p className="muted">Loading innhopps…</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error ? (
          <>
            <label className="form-field" style={{ maxWidth: '24rem' }}>
              <span>Event</span>
              <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
                <option value="all">All events</option>
                {events.map((event) => (
                  <option key={event.id} value={String(event.id)}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}
            </p>
            <textarea
              readOnly
              value={csv}
              rows={Math.max(12, Math.min(filteredRows.length + 2, 32))}
              style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
          </>
        ) : null}
      </article>
    </section>
  );
};

export default InnhoppCsvPage;

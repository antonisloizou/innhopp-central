import { useEffect, useMemo, useState } from 'react';
import { listAirfields, Airfield } from '../api/airfields';
import { Event, Innhopp, listEvents } from '../api/events';

type AirfieldUsageRow = {
  airfield: Airfield;
  usedAt: number;
};

const getInnhoppSortTime = (innhopp: Innhopp) => {
  const parsed = innhopp.scheduled_at ? Date.parse(innhopp.scheduled_at) : NaN;
  if (!Number.isNaN(parsed)) return parsed;
  return Number.MAX_SAFE_INTEGER;
};

const EventAirfieldsUsagePage = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [selectedEventID, setSelectedEventID] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [eventResp, airfieldResp] = await Promise.all([listEvents(), listAirfields()]);
        if (cancelled) return;
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setAirfields(Array.isArray(airfieldResp) ? airfieldResp : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === Number(selectedEventID)),
    [events, selectedEventID]
  );

  const usageRows = useMemo(() => {
    if (!selectedEvent) return [];

    const airfieldsByID = new Map<number, Airfield>(airfields.map((airfield) => [airfield.id, airfield]));
    const sortedInnhopps = [...(selectedEvent.innhopps || [])].sort((a, b) => {
      const byTime = getInnhoppSortTime(a) - getInnhoppSortTime(b);
      if (byTime !== 0) return byTime;
      return (a.sequence || 0) - (b.sequence || 0);
    });

    const firstUseByAirfieldID = new Map<number, AirfieldUsageRow>();
    sortedInnhopps.forEach((innhopp) => {
      const usedAt = getInnhoppSortTime(innhopp);
      const idsInOrder = [innhopp.takeoff_airfield_id, innhopp.landing_airfield_id].filter(
        (id): id is number => typeof id === 'number' && id > 0
      );

      idsInOrder.forEach((airfieldID) => {
        if (firstUseByAirfieldID.has(airfieldID)) return;
        const airfield = airfieldsByID.get(airfieldID);
        if (!airfield) return;
        firstUseByAirfieldID.set(airfieldID, { airfield, usedAt });
      });
    });

    return [...firstUseByAirfieldID.values()].sort((a, b) => a.usedAt - b.usedAt);
  }, [airfields, selectedEvent]);

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>Event Airfields</h2>
        </div>
      </header>

      <article className="card">
        <div className="form-grid logistics-list-filters">
          <label className="form-field">
            <span>Event</span>
            <select
              value={selectedEventID}
              onChange={(e) => setSelectedEventID(e.target.value)}
              className="logistics-list-event-select"
            >
              <option value="">Select an event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {selectedEventID && !loading && !error ? (
        <article className="card">
          {usageRows.length === 0 ? (
            <p className="muted">No scheduled airfield usage found for this event.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Airfield</th>
                    <th>Coordinates</th>
                  </tr>
                </thead>
                <tbody>
                  {usageRows.map((row, index) => (
                    <tr key={row.airfield.id}>
                      <td>{index + 1}</td>
                      <td>{row.airfield.name}</td>
                      <td>{row.airfield.coordinates || `${row.airfield.latitude}, ${row.airfield.longitude}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
};

export default EventAirfieldsUsagePage;

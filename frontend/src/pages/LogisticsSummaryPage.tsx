import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listEvents, listSeasons, Event, Season, Accommodation, listAllAccommodations } from '../api/events';
import { listTransports, Transport, listOthers, OtherLogistic, listMeals, Meal, listGroundCrews, GroundCrew } from '../api/logistics';
import { listEventVehicles, EventVehicle } from '../api/logistics';

const LogisticsSummaryPage = () => {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [groundCrews, setGroundCrews] = useState<GroundCrew[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [others, setOthers] = useState<OtherLogistic[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [vehicles, setVehicles] = useState<EventVehicle[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [seasonResp, eventResp, transportResp, groundCrewResp, accResp, vehResp, otherResp, mealsResp] = await Promise.all([
          listSeasons(),
          listEvents(),
          listTransports(),
          listGroundCrews(),
          listAllAccommodations(),
          listEventVehicles(),
          listOthers(),
          listMeals()
        ]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setTransports(Array.isArray(transportResp) ? transportResp : []);
        setGroundCrews(Array.isArray(groundCrewResp) ? groundCrewResp : []);
        setAccommodations(Array.isArray(accResp) ? accResp : []);
        setVehicles(Array.isArray(vehResp) ? vehResp : []);
        setOthers(Array.isArray(otherResp) ? otherResp : []);
        setMeals(Array.isArray(mealsResp) ? mealsResp : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load logistics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    return events.filter((ev) => ev.season_id === Number(selectedSeason));
  }, [events, selectedSeason]);

  const filteredTransports = useMemo(() => {
    return transports.filter((t) => {
      if (selectedEvent) return t.event_id === Number(selectedEvent);
      if (selectedSeason) {
        const ev = events.find((e) => e.id === t.event_id);
        return ev?.season_id === Number(selectedSeason);
      }
      return true;
    });
  }, [transports, selectedEvent, selectedSeason, events]);

  const filteredAccommodations = useMemo(() => {
    return accommodations.filter((a) => {
      if (selectedEvent) return a.event_id === Number(selectedEvent);
      if (selectedSeason) {
        const ev = events.find((e) => e.id === a.event_id);
        return ev?.season_id === Number(selectedSeason);
      }
      return true;
    });
  }, [accommodations, selectedEvent, selectedSeason, events]);

  const filteredGroundCrews = useMemo(() => {
    return groundCrews.filter((g) => {
      if (selectedEvent) return g.event_id === Number(selectedEvent);
      if (selectedSeason) {
        const ev = events.find((e) => e.id === g.event_id);
        return ev?.season_id === Number(selectedSeason);
      }
      return true;
    });
  }, [groundCrews, selectedEvent, selectedSeason, events]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (selectedEvent) return v.event_id === Number(selectedEvent);
      if (selectedSeason) {
        const ev = events.find((e) => e.id === v.event_id);
        return ev?.season_id === Number(selectedSeason);
      }
      return true;
    });
  }, [vehicles, selectedEvent, selectedSeason, events]);

  const filteredOthers = useMemo(() => {
    return others.filter((o) => {
      if (selectedEvent) return o.event_id === Number(selectedEvent);
      if (selectedSeason) {
        const ev = events.find((e) => e.id === o.event_id);
        return ev?.season_id === Number(selectedSeason);
      }
      return true;
    });
  }, [others, selectedEvent, selectedSeason, events]);

  const filteredMeals = useMemo(() => {
    return meals.filter((m) => {
      if (selectedEvent) return m.event_id === Number(selectedEvent);
      if (selectedSeason) {
        const ev = events.find((e) => e.id === m.event_id);
        return ev?.season_id === Number(selectedSeason);
      }
      return true;
    });
  }, [meals, selectedEvent, selectedSeason, events]);

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>Logistics</h2>
        </div>
      </header>

      <article className="card">
        <div
          className="form-grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            alignItems: 'end',
            gap: '0.75rem'
          }}
        >
          <label className="form-field">
            <span>Season</span>
            <select
              value={selectedSeason}
              onChange={(e) => {
                setSelectedSeason(e.target.value);
                setSelectedEvent('');
              }}
              style={{ width: '100%', minWidth: '140px', maxWidth: '180px' }}
            >
              <option value="">All seasons</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Event</span>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              style={{ width: '100%', minWidth: '160px' }}
            >
              <option value="">All events</option>
              {filteredEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      {error && <p className="error-text">{error}</p>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem'
        }}
      >
        <article
          className="card clickable"
          onClick={() => navigate('/logistics/transport')}
        >
          <header className="card-header">
            <h3>Transport</h3>
            <span className="badge neutral">{filteredTransports.length}</span>
          </header>
          <p className="muted">View and manage transport routes.</p>
        </article>

        <article
          className="card clickable"
          onClick={() => navigate('/logistics/ground-crew')}
        >
          <header className="card-header">
            <h3>Ground Crew</h3>
            <span className="badge neutral">{filteredGroundCrews.length}</span>
          </header>
          <p className="muted">View and manage ground crew entries.</p>
        </article>

        <article
          className="card clickable"
          onClick={() => navigate('/logistics/accommodations')}
        >
          <header className="card-header">
            <h3>Accommodations</h3>
            <span className="badge neutral">{filteredAccommodations.length}</span>
          </header>
          <p className="muted">Manage accommodations.</p>
        </article>

        <article
          className="card clickable"
          onClick={() => navigate('/logistics/meals')}
        >
          <header className="card-header">
            <h3>Meals</h3>
            <span className="badge neutral">{filteredMeals.length}</span>
          </header>
          <p className="muted">Plan meals and service times.</p>
        </article>

        <article
          className="card clickable"
          onClick={() => navigate('/logistics/others')}
        >
          <header className="card-header">
            <h3>Other</h3>
            <span className="badge neutral">{filteredOthers.length}</span>
          </header>
          <p className="muted">Activities, other points of Interest, etc.</p>
        </article>
      </div>
    </section>
  );
};

export default LogisticsSummaryPage;

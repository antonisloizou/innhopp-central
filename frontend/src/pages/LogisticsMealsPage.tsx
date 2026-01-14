import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { listEvents, listSeasons, Event, Season } from '../api/events';
import { Meal, listMeals } from '../api/logistics';

const formatDateTime = (iso?: string | null) => {
  if (!iso) return 'Not scheduled';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const LogisticsMealsPage = () => {
  const location = useLocation();
  const highlightMealId = (location.state as any)?.highlightMealId as number | undefined;
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
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
        const [seasonResp, eventResp, mealResp] = await Promise.all([listSeasons(), listEvents(), listMeals()]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setMeals(Array.isArray(mealResp) ? mealResp : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load meals');
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
    <section>
      <header className="page-header">
        <div>
          <h2>Meals</h2>
        </div>
        <div className="card-actions" style={{ gap: '0.5rem' }}>
          <Link className="ghost" to="/logistics" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
            Back to logistics
          </Link>
          <Link className="primary button-link" to="/logistics/meals/new">
            Create meal
          </Link>
        </div>
      </header>

      <article className="card">
        <div
          className="form-grid"
          style={{
            gridTemplateColumns: 'minmax(140px, 0.25fr) minmax(160px, 0.5fr)',
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

      <article className="card">
        <header className="card-header">
          <div>
            <h3>Meals</h3>
          </div>
          <span className="badge neutral">{filteredMeals.length} meals</span>
        </header>
        {loading ? (
          <p className="muted">Loading meals…</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : filteredMeals.length === 0 ? (
          <p className="muted">No meals match the selected filters.</p>
        ) : (
          <ul className="status-list" style={{ maxHeight: '24rem', overflowY: 'auto', width: '100%' }}>
            {filteredMeals.map((meal) => (
              <li
                key={meal.id}
                style={{
                  width: '100%',
                  background: highlightMealId === meal.id ? '#e6f4ff' : undefined,
                  border: highlightMealId === meal.id ? '1px solid #1d7ed8' : undefined,
                  borderRadius: highlightMealId === meal.id ? '10px' : undefined
                }}
              >
                <Link
                  to={`/logistics/meals/${meal.id}`}
                  className="card-link"
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', width: '100%' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    <strong>{meal.name}</strong>
                    <span className="badge" style={{ backgroundColor: '#2b8a3e', color: '#fff' }}>
                      {events.find((e) => e.id === meal.event_id)?.name || `Event #${meal.event_id}`}
                    </span>
                  </div>
                  <div className="muted" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {meal.location ? `Location: ${meal.location}` : 'Location not set'}
                    {meal.scheduled_at ? `• ${formatDateTime(meal.scheduled_at)}` : ''}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
};

export default LogisticsMealsPage;

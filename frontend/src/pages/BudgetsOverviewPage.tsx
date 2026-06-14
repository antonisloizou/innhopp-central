import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BudgetSummary, getBudgetSummary, getEventBudget } from '../api/budgets';
import { Event, Season, listEvents, listSeasons } from '../api/events';

type BudgetOverviewCard = {
  event: Event;
  summary: BudgetSummary;
};

const formatMoney = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount || 0);

const formatDateRange = (startsAt: string, endsAt?: string | null) => {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return 'Date TBD';
  const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  if (!end || Number.isNaN(end.getTime())) return dateFormat.format(start);
  return `${dateFormat.format(start)} - ${dateFormat.format(end)}`;
};

const BudgetsOverviewPage = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [budgetCards, setBudgetCards] = useState<BudgetOverviewCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [seasonResp, eventResp] = await Promise.all([listSeasons(), listEvents()]);
        if (cancelled) return;
        const loadedSeasons = Array.isArray(seasonResp) ? seasonResp : [];
        const loadedEvents = Array.isArray(eventResp) ? eventResp : [];
        setSeasons(loadedSeasons);
        setEvents(loadedEvents);

        const budgetResults = await Promise.all(
          loadedEvents.map(async (event) => {
            try {
              const budget = await getEventBudget(event.id);
              const summary = await getBudgetSummary(budget.id);
              return { event, summary };
            } catch (err) {
              const status = (err as Error & { status?: number }).status;
              if (status === 404) return null;
              throw err;
            }
          })
        );

        if (cancelled) return;
        setBudgetCards(
          budgetResults
            .filter((entry): entry is BudgetOverviewCard => entry !== null)
            .sort((left, right) => new Date(left.event.starts_at).getTime() - new Date(right.event.starts_at).getTime())
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load budgets overview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    return events.filter((event) => event.season_id === Number(selectedSeason));
  }, [events, selectedSeason]);

  const filteredEventIds = useMemo(
    () => new Set(filteredEvents.map((event) => event.id)),
    [filteredEvents]
  );

  const filteredCards = useMemo(
    () => budgetCards.filter((entry) => filteredEventIds.has(entry.event.id)),
    [budgetCards, filteredEventIds]
  );

  const seasonNameById = useMemo(
    () => new Map(seasons.map((season) => [season.id, season.name])),
    [seasons]
  );

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>Budgets</h2>
          <p className="muted budget-overview-subtitle">
            Overview of all event budgets. Open an event to work in its full budget.
          </p>
        </div>
      </header>

      <article className="card">
        <div className="form-grid logistics-list-filters">
          <label className="form-field">
            <span>Season</span>
            <select
              value={selectedSeason}
              onChange={(event) => setSelectedSeason(event.target.value)}
              className="logistics-list-season-select"
            >
              <option value="">All seasons</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      {loading ? <p>Loading budgets…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!loading && !error ? (
        filteredCards.length > 0 ? (
          <div className="budget-overview-grid">
            {filteredCards.map(({ event, summary }) => {
              const currency = summary.budget.base_currency || 'EUR';
              const worstCase = summary.scenarios?.worst_case_gate;
              return (
                <Link
                  key={event.id}
                  to={`/events/${event.id}/budget`}
                  className="card clickable budget-overview-card"
                >
                  <header className="card-header">
                    <div>
                      <h3>{event.name}</h3>
                      <p className="muted budget-overview-meta">
                        {seasonNameById.get(event.season_id) || 'Unknown season'}
                      </p>
                    </div>
                    <span className={`badge status-${summary.budget.status}`}>{summary.budget.status}</span>
                  </header>
                  <p className="budget-overview-meta">{event.location || 'Location TBD'}</p>
                  <p className="muted budget-overview-meta">
                    {formatDateRange(event.starts_at, event.ends_at)}
                  </p>
                  <div className="budget-overview-kpis">
                    <div className="finance-summary-kpi">
                      <span className="field-label">Expected Cost</span>
                      <strong>{formatMoney(summary.expected_cost, currency)}</strong>
                    </div>
                    <div className="finance-summary-kpi">
                      <span className="field-label">Target Revenue</span>
                      <strong>{formatMoney(summary.target_revenue, currency)}</strong>
                    </div>
                    <div className="finance-summary-kpi">
                      <span className="field-label">Worst Case Margin</span>
                      <strong>{formatMoney(worstCase?.margin_without_tip || 0, currency)}</strong>
                    </div>
                    <div className="finance-summary-kpi">
                      <span className="field-label">Worst Case Participants</span>
                      <strong>{Math.round(worstCase?.participants || 0)}</strong>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <article className="card">
            <h3>No budgets found</h3>
            <p className="muted">
              {selectedSeason
                ? 'No events in this season have a budget yet.'
                : 'No events have a budget yet.'}
            </p>
          </article>
        )
      ) : null}
    </section>
  );
};

export default BudgetsOverviewPage;

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BudgetActualsReport, getBudgetActuals } from '../api/accounting';
import { Event, Season, listEvents, listSeasons } from '../api/events';

type AccountingOverviewCard = {
  event: Event;
  actuals: BudgetActualsReport;
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

const AccountingOverviewPage = () => {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [accountingCards, setAccountingCards] = useState<AccountingOverviewCard[]>([]);
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

        const accountingResults = await Promise.all(
          loadedEvents.map(async (event) => {
            try {
              const actuals = await getBudgetActuals(event.id);
              return { event, actuals };
            } catch (err) {
              const status = (err as Error & { status?: number }).status;
              if (status === 404) return null;
              throw err;
            }
          })
        );

        if (cancelled) return;
        setAccountingCards(
          accountingResults
            .filter((entry): entry is AccountingOverviewCard => entry !== null)
            .sort((left, right) => new Date(left.event.starts_at).getTime() - new Date(right.event.starts_at).getTime())
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load accounting overview');
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
    () => accountingCards.filter((entry) => filteredEventIds.has(entry.event.id)),
    [accountingCards, filteredEventIds]
  );

  const seasonNameById = useMemo(
    () => new Map(seasons.map((season) => [season.id, season.name])),
    [seasons]
  );

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>Accounting</h2>
          <p className="muted budget-overview-subtitle">
            Overview of accounting status across events. Open an event to work in its full accounting workspace.
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

      {loading ? <p>Loading accounting…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!loading && !error ? (
        filteredCards.length > 0 ? (
          <div className="budget-overview-grid">
            {filteredCards.map(({ event, actuals }) => {
              const currency = actuals.currency || 'EUR';
              return (
                <Link
                  key={event.id}
                  to={`/events/${event.id}/accounting`}
                  className="card clickable budget-overview-card"
                >
                  <header className="card-header">
                    <div>
                      <h3>{event.name}</h3>
                      <p className="muted budget-overview-meta">
                        {seasonNameById.get(event.season_id) || 'Unknown season'}
                      </p>
                    </div>
                    <span className="badge neutral">{actuals.lines.length} lines</span>
                  </header>
                  <p className="budget-overview-meta">{event.location || 'Location TBD'}</p>
                  <p className="muted budget-overview-meta">
                    {formatDateRange(event.starts_at, event.ends_at)}
                  </p>
                  <div className="budget-overview-kpis">
                    <div className="finance-summary-kpi">
                      <span className="field-label">Expected Cost</span>
                      <strong>{formatMoney(actuals.totals.planned_amount, currency)}</strong>
                    </div>
                    <div className="finance-summary-kpi">
                      <span className="field-label">Invoiced</span>
                      <strong>{formatMoney(actuals.totals.invoiced_amount, currency)}</strong>
                    </div>
                    <div className="finance-summary-kpi">
                      <span className="field-label">Paid</span>
                      <strong>{formatMoney(actuals.totals.paid_amount, currency)}</strong>
                    </div>
                    <div className="finance-summary-kpi">
                      <span className="field-label">Open</span>
                      <strong>{formatMoney(actuals.totals.open_invoice_amount, currency)}</strong>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <article className="card">
            <h3>No accounting workspaces found</h3>
            <p className="muted">
              {selectedSeason
                ? 'No events in this season have accounting data yet.'
                : 'No events have accounting data yet.'}
            </p>
          </article>
        )
      ) : null}
    </section>
  );
};

export default AccountingOverviewPage;

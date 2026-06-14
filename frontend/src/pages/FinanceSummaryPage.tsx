import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BudgetSummary, getBudgetSummary, getEventBudget } from '../api/budgets';
import { getBudgetActuals } from '../api/accounting';
import { Event, Season, listEvents, listSeasons } from '../api/events';

type BudgetSummaryResult = {
  eventId: number;
  summary: BudgetSummary;
};

type AccountingActualsSummary = Awaited<ReturnType<typeof getBudgetActuals>>;

const formatMoney = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount || 0);

const FinanceSummaryPage = () => {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [budgetSummaries, setBudgetSummaries] = useState<BudgetSummaryResult[]>([]);
  const [accountingSummaries, setAccountingSummaries] = useState<AccountingActualsSummary[]>([]);
  const [selectedEventActuals, setSelectedEventActuals] = useState<AccountingActualsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingActuals, setLoadingActuals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountingMessage, setAccountingMessage] = useState<string | null>(null);

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
              return { eventId: event.id, summary };
            } catch (err) {
              const status = (err as Error & { status?: number }).status;
              if (status === 404) return null;
              throw err;
            }
          })
        );

        const accountingResults = await Promise.all(
          loadedEvents.map(async (event) => {
            try {
              return await getBudgetActuals(event.id);
            } catch (err) {
              const status = (err as Error & { status?: number }).status;
              if (status === 404) return null;
              throw err;
            }
          })
        );

        if (cancelled) return;
        setBudgetSummaries(budgetResults.filter((entry): entry is BudgetSummaryResult => entry !== null));
        setAccountingSummaries(
          accountingResults.filter((entry): entry is AccountingActualsSummary => entry !== null)
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load finance');
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

  useEffect(() => {
    let cancelled = false;

    const eventId = Number(selectedEvent);
    if (!eventId) {
      setSelectedEventActuals(null);
      setAccountingMessage(null);
      return;
    }

    const loadActuals = async () => {
      setLoadingActuals(true);
      setAccountingMessage(null);
      try {
        const actuals = await getBudgetActuals(eventId);
        if (!cancelled) setSelectedEventActuals(actuals);
      } catch (err) {
        if (cancelled) return;
        const status = (err as Error & { status?: number }).status;
        if (status === 404) {
          setSelectedEventActuals(null);
          setAccountingMessage('Accounting API not available for this event yet.');
        } else {
          setSelectedEventActuals(null);
          setAccountingMessage(err instanceof Error ? err.message : 'Failed to load accounting summary');
        }
      } finally {
        if (!cancelled) setLoadingActuals(false);
      }
    };

    void loadActuals();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent]);

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    return events.filter((event) => event.season_id === Number(selectedSeason));
  }, [events, selectedSeason]);

  const filteredEventIds = useMemo(() => {
    if (selectedEvent) return new Set([Number(selectedEvent)]);
    return new Set(filteredEvents.map((event) => event.id));
  }, [filteredEvents, selectedEvent]);

  const filteredBudgetSummaries = useMemo(
    () => budgetSummaries.filter((entry) => filteredEventIds.has(entry.eventId)),
    [budgetSummaries, filteredEventIds]
  );

  const selectedBudgetSummary = useMemo(
    () => budgetSummaries.find((entry) => entry.eventId === Number(selectedEvent)) ?? null,
    [budgetSummaries, selectedEvent]
  );

  const budgetTotals = useMemo(() => {
    return filteredBudgetSummaries.reduce(
      (acc, entry) => {
        acc.expectedCost += entry.summary.expected_cost || 0;
        acc.targetRevenue += entry.summary.target_revenue || 0;
        acc.eventsWithBudget += 1;
        if (entry.summary.budget.status === 'approved') {
          acc.approved += 1;
        }
        return acc;
      },
      { expectedCost: 0, targetRevenue: 0, eventsWithBudget: 0, approved: 0 }
    );
  }, [filteredBudgetSummaries]);

  const filteredAccountingSummaries = useMemo(
    () => accountingSummaries.filter((entry) => filteredEventIds.has(entry.event_id)),
    [accountingSummaries, filteredEventIds]
  );
  const scopedEventCount = filteredEventIds.size;

  const aggregatedAccountingTotals = useMemo(() => {
    return filteredAccountingSummaries.reduce(
      (acc, entry) => {
        acc.planned += entry.totals.planned_amount || 0;
        acc.invoiced += entry.totals.invoiced_amount || 0;
        acc.paid += entry.totals.paid_amount || 0;
        return acc;
      },
      { planned: 0, invoiced: 0, paid: 0 }
    );
  }, [filteredAccountingSummaries]);

  const budgetCurrency = filteredBudgetSummaries[0]?.summary.budget.base_currency || 'EUR';
  const expectedCostAmount = selectedEvent
    ? (selectedBudgetSummary?.summary.expected_cost ?? 0)
    : budgetTotals.expectedCost;
  const invoicedAmount = selectedEvent
    ? (selectedEventActuals?.totals.invoiced_amount ?? 0)
    : aggregatedAccountingTotals.invoiced;
  const paidAmount = selectedEvent
    ? (selectedEventActuals?.totals.paid_amount ?? 0)
    : aggregatedAccountingTotals.paid;
  const actualsCurrency = selectedEventActuals?.currency || filteredAccountingSummaries[0]?.currency || budgetCurrency;

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>Finance</h2>
        </div>
      </header>

      <article className="card">
        <div className="form-grid logistics-list-filters">
          <label className="form-field">
            <span>Season</span>
            <select
              value={selectedSeason}
              onChange={(event) => {
                setSelectedSeason(event.target.value);
                setSelectedEvent('');
              }}
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
          <label className="form-field">
            <span>Event</span>
            <select
              value={selectedEvent}
              onChange={(event) => setSelectedEvent(event.target.value)}
              className="logistics-list-event-select"
            >
              <option value="">All events</option>
              {filteredEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </article>

      {loading ? <p>Loading finance…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!loading && !error ? (
        <div className="logistics-summary-grid">
          <article
            className="card clickable finance-summary-card"
            onClick={() => navigate(selectedEvent ? `/events/${selectedEvent}/budget` : '/budgets')}
          >
            <header className="card-header">
              <h3>Budgets</h3>
              <span className="badge neutral">{scopedEventCount}</span>
            </header>
            <div className="finance-summary-kpi">
              <span className="field-label">Budgeted</span>
              <strong>{budgetTotals.eventsWithBudget}</strong>
            </div>
            <div className="finance-summary-kpi">
              <span className="field-label">Approved</span>
              <strong>{budgetTotals.approved}</strong>
            </div>
            <div className="finance-summary-kpi">
              <span className="field-label">Expected Cost</span>
              <strong>{formatMoney(budgetTotals.expectedCost, budgetCurrency)}</strong>
            </div>
            <div className="finance-summary-kpi">
              <span className="field-label">Target Revenue</span>
              <strong>{formatMoney(budgetTotals.targetRevenue, budgetCurrency)}</strong>
            </div>
          </article>

          <article
            className="card clickable finance-summary-card"
            onClick={() => navigate(selectedEvent ? `/events/${selectedEvent}/accounting` : '/finance/accounting')}
          >
            <header className="card-header">
              <h3>Accounting</h3>
              <span className="badge neutral">{scopedEventCount}</span>
            </header>
            <div className="finance-summary-kpi">
              <span className="field-label">Expected Cost</span>
              <strong>{formatMoney(expectedCostAmount, budgetCurrency)}</strong>
            </div>
            <div className="finance-summary-kpi">
              <span className="field-label">Invoiced</span>
              <strong>{formatMoney(invoicedAmount, actualsCurrency)}</strong>
            </div>
            <div className="finance-summary-kpi">
              <span className="field-label">Paid</span>
              <strong>{formatMoney(paidAmount, actualsCurrency)}</strong>
            </div>
            {loadingActuals ? <p className="muted finance-summary-note">Loading accounting totals…</p> : null}
            {accountingMessage ? <p className="muted finance-summary-note">{accountingMessage}</p> : null}
          </article>
        </div>
      ) : null}
    </section>
  );
};

export default FinanceSummaryPage;

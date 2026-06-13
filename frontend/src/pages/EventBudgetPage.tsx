import { FormEvent, Fragment, MouseEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Budget,
  BudgetLineItem,
  BudgetSection,
  BudgetSummary,
  createBudgetLineItem,
  createEventBudget,
  deleteBudgetLineItem,
  getBudgetAssumptions,
  getBudgetCurrencies,
  getBudgetSummary,
  getEventBudget,
  listBudgetLineItems,
  listBudgetSections,
  previewBudgetCurrencyRates,
  updateBudget,
  updateBudgetAssumptions,
  updateBudgetLineItem,
  updateBudgetCurrencies
} from '../api/budgets';
import { ISO_CURRENCY_CODES } from '../constants/currencies';
import { Event, Season, copyEvent, deleteEvent, listEvents, listSeasons, updateEvent } from '../api/events';
import { Airfield, listAirfields } from '../api/airfields';
import EventGearMenu from '../components/EventGearMenu';
import ScheduleEntryPreviewOverlay from '../components/ScheduleEntryPreviewOverlay';
import { EntryType, ScheduleEntry } from '../components/schedulePreviewTypes';
import { useAuth } from '../auth/AuthProvider';
import { canUseStaffMapsActions } from '../auth/access';
import { isInnhoppReady } from '../utils/innhoppReadiness';
import {
  CostSplitMode,
  buildCostSplit,
  buildMarginCurveModel,
  buildScenarioBars,
  isSubmitForReviewDisabled,
  isWorstCaseGreen
} from './eventBudgetViewModel';

const parameterLabels: Record<string, string> = {
  full_load_size: 'Full load size',
  crew_on_load_count: 'Crew on load',
  confirm_load_count: 'Confirm load count',
  full_load_count: 'Full load count',
  target_markup_percent: 'Target markup %',
  optional_tip_percent: 'Optional tip %',
  cost_drift_percent: 'Cost drift %',
  estimate_accommodation_per_person_night: 'Accommodation (1 person 1 night)',
  estimate_transport_per_day: 'Transport (1 day)',
  estimate_food_per_day: 'Food (1 Person 1 Day)',
  estimate_staff_salary_per_person_day: 'Staff salary (1 person 1 day)'
};
const BUDGET_METHOD_KEY = 'budget_method';
const BUDGET_METHOD_ESTIMATES = 0;
const BUDGET_METHOD_LINE_ITEMS = 1;
const BUDGET_METHOD_HYBRID = 2;
const ESTIMATE_PARAMETER_KEYS = [
  'estimate_accommodation_per_person_night',
  'estimate_transport_per_day',
  'estimate_food_per_day',
  'estimate_staff_salary_per_person_day'
] as const;

type BudgetSectionKey =
  | 'overview'
  | 'parameters'
  | 'costRevenue'
  | 'profitability'
  | 'costSplit'
  | 'lineItems';

type ParametersTabKey = 'load' | 'pricing' | 'estimates' | 'currencies';
type CostSplitTabKey = 'section' | 'innhopp' | 'day';
type LabelScenarioKey = 'confirm' | 'worst' | 'full';
type ScenarioSummaryKey = 'confirm_case' | 'worst_case_gate' | 'full_capacity_case';
type OverviewScenarioCardKey = 'expectedCost' | 'costWithDrift' | 'targetRevenue' | 'perParticipant';

const labelScenarioMeta: Record<LabelScenarioKey, { label: string; long: string }> = {
  confirm: { label: 'Confirm', long: 'Confirm scenario' },
  worst: { label: 'Worst', long: 'Worst-case scenario' },
  full: { label: 'Full', long: 'Full-capacity scenario' }
};

const scenarioSummaryKeyByLabel: Record<LabelScenarioKey, ScenarioSummaryKey> = {
  confirm: 'confirm_case',
  worst: 'worst_case_gate',
  full: 'full_capacity_case'
};
const AUTO_AIRCRAFT_MISSING_DISTANCE_MARKER = ':missing-distance';
const AUTO_AIRCRAFT_MISSING_AIRCRAFT_MARKER = ':missing-aircraft';
const AUTO_AIRCRAFT_SLOT_OVERFLOW_MARKER = ':slot-overflow';
const AUTO_AIRCRAFT_LINE_ITEM_PREFIX = '[auto-aircraft-innhopp]:';
const AUTO_ESTIMATE_LINE_ITEM_PREFIX = '[auto-estimate]:';
const AUTO_ESTIMATE_WARNING_MARKER = ':estimate-generated';
const formatQty = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, '');
};
const formatMinutesAsHours = (minutes: number) => {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  return `${hours} hrs ${remainingMinutes} min`;
};
const formatDurationMinutesForInnhopp = (minutes?: number | null) => {
  if (!Number.isFinite(minutes) || (minutes as number) <= 0) return 'Unavailable';
  const total = minutes as number;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
};

const EventBudgetPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canOpenMapsActions = canUseStaffMapsActions(user);
  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingParameters, setSavingParameters] = useState(false);
  const [savingLineItem, setSavingLineItem] = useState(false);
  const [addingLineItem, setAddingLineItem] = useState(false);
  const [editingLineItemID, setEditingLineItemID] = useState<number | null>(null);
  const [openLineItemActionsFor, setOpenLineItemActionsFor] = useState<number | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [airfields, setAirfields] = useState<Airfield[]>([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [budget, setBudget] = useState<Budget | null>(null);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [sections, setSections] = useState<BudgetSection[]>([]);
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);
  const [parameters, setParameters] = useState<Record<string, number>>({});
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(['EUR']);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [currencySearch, setCurrencySearch] = useState('');
  const [eventRegistrationTotal, setEventRegistrationTotal] = useState('');
  const [eventCurrencyInput, setEventCurrencyInput] = useState('EUR');
  const [pendingBaseCurrency, setPendingBaseCurrency] = useState('EUR');
  const [displayCurrency, setDisplayCurrency] = useState('EUR');
  const [costSplitMode, setCostSplitMode] = useState<CostSplitMode>('amount');
  const isPercentageSplitMode = costSplitMode === 'percentage';
  const isTimeSplitMode = costSplitMode === 'time';
  const [costSplitTab, setCostSplitTab] = useState<CostSplitTabKey>('section');
  const [costSplitScenario, setCostSplitScenario] = useState<LabelScenarioKey>('full');
  const [lineItemsScenario, setLineItemsScenario] = useState<LabelScenarioKey>('full');
  const [lineItemsSectionFilter, setLineItemsSectionFilter] = useState<string>('all');
  const [parametersTab, setParametersTab] = useState<ParametersTabKey>('load');
  const [estimateCurrencies, setEstimateCurrencies] = useState<Record<string, string>>({
    estimate_accommodation_per_person_night: 'EUR',
    estimate_transport_per_day: 'EUR',
    estimate_food_per_day: 'EUR',
    estimate_staff_salary_per_person_day: 'EUR'
  });
  const [curveHover, setCurveHover] = useState<{
    x: number;
    y: number;
    participants: number;
    margin: number;
  } | null>(null);
  const [curvePopup, setCurvePopup] = useState<{
    x: number;
    y: number;
    participants: number;
    margin: number;
    costWithDrift: number;
    revenue: number;
  } | null>(null);
  const [openSections, setOpenSections] = useState<Record<BudgetSectionKey, boolean>>({
    overview: true,
    parameters: true,
    costRevenue: true,
    profitability: true,
    costSplit: true,
    lineItems: true
  });
  const [overviewScenarios, setOverviewScenarios] = useState<Record<OverviewScenarioCardKey, LabelScenarioKey>>({
    expectedCost: 'full',
    costWithDrift: 'full',
    targetRevenue: 'full',
    perParticipant: 'worst'
  });
  const [openScenarioMenuFor, setOpenScenarioMenuFor] = useState<OverviewScenarioCardKey | null>(null);
  const [previewEntry, setPreviewEntry] = useState<ScheduleEntry | null>(null);
  const [renderedPreviewEntry, setRenderedPreviewEntry] = useState<ScheduleEntry | null>(null);
  const [previewClosing, setPreviewClosing] = useState(false);
  const OVERLAY_EXIT_MS = 180;
  useEffect(() => {
    if (previewEntry) {
      setRenderedPreviewEntry(previewEntry);
      setPreviewClosing(false);
      return;
    }
    if (!renderedPreviewEntry) return;
    setPreviewClosing(true);
    const timeoutId = window.setTimeout(() => {
      setRenderedPreviewEntry(null);
      setPreviewClosing(false);
    }, OVERLAY_EXIT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [previewEntry, renderedPreviewEntry]);

  const closePreview = () => setPreviewEntry(null);
  useEffect(() => {
    if (costSplitTab !== 'innhopp' && isTimeSplitMode) {
      setCostSplitMode('amount');
    }
  }, [costSplitTab, isTimeSplitMode]);
  useEffect(() => {
    if (!openScenarioMenuFor) return;
    const onDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenScenarioMenuFor(null);
        return;
      }
      if (target.closest('.budget-scenario-indicator-wrap')) return;
      setOpenScenarioMenuFor(null);
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [openScenarioMenuFor]);
  const [message, setMessage] = useState<string | null>(null);
  const [newLineItem, setNewLineItem] = useState({
    section_id: '',
    name: '',
    service_date: '',
    description: '',
    quantity: '1',
    unit_cost: '',
    cost_currency: 'EUR',
    notes: ''
  });
  const dedupeCurrencies = (codes: string[]) => Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean)));

  const routeEventID = Number(eventId);
  const routeHasEventID = Number.isFinite(routeEventID) && routeEventID > 0;
  const pickedEventID = Number(selectedEvent);
  const activeEventID = routeHasEventID
    ? routeEventID
    : Number.isFinite(pickedEventID) && pickedEventID > 0
      ? pickedEventID
      : 0;
  const hasValidEventID = activeEventID > 0;

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    return events.filter((ev) => ev.season_id === Number(selectedSeason));
  }, [events, selectedSeason]);
  const activeEventData = useMemo(
    () => events.find((ev) => ev.id === activeEventID) || null,
    [events, activeEventID]
  );
  const baseCurrency = budget?.base_currency || 'EUR';
  const eventCurrency = (activeEventData?.currency || 'EUR').trim().toUpperCase() || 'EUR';
  const eventRegistrationAmount = useMemo(() => {
    const deposit = Number(activeEventData?.deposit_amount || 0);
    const mainInvoice = Number(activeEventData?.main_invoice_amount || 0);
    return (Number.isFinite(deposit) ? deposit : 0) + (Number.isFinite(mainInvoice) ? mainInvoice : 0);
  }, [activeEventData?.deposit_amount, activeEventData?.main_invoice_amount]);
  useEffect(() => {
    setEventRegistrationTotal(eventRegistrationAmount > 0 ? String(eventRegistrationAmount) : '0');
  }, [eventRegistrationAmount, activeEventID]);
  useEffect(() => {
    setEventCurrencyInput(eventCurrency);
  }, [eventCurrency, activeEventID]);
  const orderedSelectedCurrencies = useMemo(() => {
    const base = (pendingBaseCurrency || baseCurrency || 'EUR').trim().toUpperCase() || 'EUR';
    const normalized = selectedCurrencies.map((code) => code.trim().toUpperCase()).filter(Boolean);
    const unique = Array.from(new Set(normalized.filter((code) => code !== base)));
    return [base, ...unique];
  }, [selectedCurrencies, pendingBaseCurrency, baseCurrency]);
  const effectiveDisplayCurrency = selectedCurrencies.includes(displayCurrency)
    ? displayCurrency
    : baseCurrency;
  const displayRate =
    effectiveDisplayCurrency === baseCurrency ? 1 : liveRates[effectiveDisplayCurrency] || 1;
  const formatMoney = (amount: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: effectiveDisplayCurrency,
      maximumFractionDigits: 2
    }).format((amount || 0) * displayRate);
  const formatParticipants = (value: number) => {
    return String(Math.round(value));
  };
  const formatLineItemDate = (value?: string | null) => {
    if (!value) return '-';
    const raw = value.slice(0, 10);
    const parts = raw.split('-');
    if (parts.length !== 3) return raw;
    const [year, month, day] = parts;
    return `${day}-${month}-${year}`;
  };
  const formatBaseMoney = (amount: number, currencyCode?: string) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode || 'EUR',
      maximumFractionDigits: 2
    }).format(amount || 0);
  const formatMoneyNumber = (amount: number) =>
    new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
  const convertAmountToDisplayCurrency = (amount: number, sourceCurrency: string) => {
    const source = (sourceCurrency || baseCurrency || 'EUR').trim().toUpperCase() || 'EUR';
    const target = (effectiveDisplayCurrency || baseCurrency || 'EUR').trim().toUpperCase() || 'EUR';
    const safeAmount = Number(amount || 0);
    if (source === target) return safeAmount;
    const sourceRate = source === baseCurrency ? 1 : liveRates[source] || 1;
    const targetRate = target === baseCurrency ? 1 : liveRates[target] || 1;
    if (sourceRate <= 0 || targetRate <= 0) return safeAmount;
    const baseAmount = safeAmount / sourceRate;
    return baseAmount * targetRate;
  };
  const convertBaseAmountToDisplayCurrency = (amount: number) =>
    convertAmountToDisplayCurrency(amount, baseCurrency);
  const rateTooltip = (targetCurrency: string) => {
    const base = (pendingBaseCurrency || baseCurrency || 'EUR').trim().toUpperCase();
    const target = (targetCurrency || '').trim().toUpperCase();
    if (!target) return '';
    if (target === base) return `1 ${base} = 1.0000 ${target}`;
    const rate = liveRates[target];
    if (!rate || rate <= 0) return `1 ${base} = 1.0000 ${target}`;
    return `1 ${base} = ${rate.toFixed(4)} ${target}`;
  };
  const renderNumericParameterField = (key: string) => (
    <label className="form-field" key={key}>
      <span>{parameterLabels[key] || key}</span>
      <input
        type="number"
        step="1"
        value={parameters[key] ?? ''}
        onChange={(e) =>
          setParameters((prev) => ({
            ...prev,
            [key]: Number(e.target.value || 0)
          }))
        }
      />
    </label>
  );
  const renderEstimateParameterField = (key: (typeof ESTIMATE_PARAMETER_KEYS)[number]) => {
    const selectedEstimateCurrency =
      estimateCurrencies[key] && orderedSelectedCurrencies.includes(estimateCurrencies[key])
        ? estimateCurrencies[key]
        : pendingBaseCurrency || baseCurrency || 'EUR';
    const rawLabel = parameterLabels[key] || key;
    const labelMatch = rawLabel.match(/^(.+?)\s*\((.+)\)$/);
    const labelMain = labelMatch ? labelMatch[1] : rawLabel;
    const labelMeta = labelMatch ? labelMatch[2] : '';
    return (
      <div className="budget-estimate-field" key={key}>
        <label className="form-field">
          <span>
            {labelMain}
            {labelMeta ? <small className="budget-estimate-label-meta">{labelMeta}</small> : null}
          </span>
          <input
            type="number"
            step="1"
            value={parameters[key] ?? ''}
            onChange={(e) =>
              setParameters((prev) => ({
                ...prev,
                [key]: Number(e.target.value || 0)
              }))
            }
          />
        </label>
        <label className="form-field">
          <span>Currency</span>
          <select
            value={selectedEstimateCurrency}
            onChange={(e) =>
              setEstimateCurrencies((prev) => ({
                ...prev,
                [key]: e.target.value
              }))
            }
          >
            {orderedSelectedCurrencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };
  const budgetMethod = Number(parameters[BUDGET_METHOD_KEY] ?? BUDGET_METHOD_HYBRID);

  const loadBudgetData = async (targetEventID: number) => {
    setLoading(true);
    setMessage(null);
    try {
      let evtBudget: Budget | null = null;
      try {
        evtBudget = await getEventBudget(targetEventID);
      } catch (err) {
        const status = (err as Error & { status?: number })?.status;
        if (status !== 404) throw err;
      }
      setBudget(evtBudget);
      if (!evtBudget) {
        setSummary(null);
        setSections([]);
        setLineItems([]);
        setParameters({});
        setSelectedCurrencies(['EUR']);
        setPendingBaseCurrency('EUR');
        setLiveRates({});
        return;
      }
      const [summaryResp, sectionResp, lineItemResp, assumptionsResp, currenciesResp] = await Promise.all([
        getBudgetSummary(evtBudget.id),
        listBudgetSections(evtBudget.id),
        listBudgetLineItems(evtBudget.id),
        getBudgetAssumptions(evtBudget.id),
        getBudgetCurrencies(evtBudget.id)
      ]);
      setSummary(summaryResp);
      setSections(Array.isArray(sectionResp) ? sectionResp : []);
      setLineItems(Array.isArray(lineItemResp) ? lineItemResp : []);
      setParameters(assumptionsResp.parameters || assumptionsResp.values || {});
      setSelectedCurrencies(
        Array.isArray(currenciesResp.currencies) && currenciesResp.currencies.length > 0
          ? dedupeCurrencies(currenciesResp.currencies)
          : ['EUR']
      );
      setLiveRates(currenciesResp.live_rates || {});
      setPendingBaseCurrency(currenciesResp.base_currency || evtBudget.base_currency || 'EUR');
      const loadedBaseCurrency = currenciesResp.base_currency || evtBudget.base_currency || 'EUR';
      setEstimateCurrencies((prev) => {
        const next: Record<string, string> = { ...prev, ...(assumptionsResp.estimate_currencies || {}) };
        ESTIMATE_PARAMETER_KEYS.forEach((key) => {
          if (!next[key]) next[key] = loadedBaseCurrency;
        });
        return next;
      });
      setDisplayCurrency((prev) =>
        currenciesResp.currencies?.includes(prev) ? prev : currenciesResp.base_currency || 'EUR'
      );
      if (sectionResp.length > 0) {
        setNewLineItem((prev) => ({
          ...prev,
          section_id: String(sectionResp[0].id),
          cost_currency: currenciesResp.base_currency || 'EUR'
        }));
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load budget');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadFilters = async () => {
      setLoadingFilters(true);
      try {
        const [seasonResp, eventResp, airfieldResp] = await Promise.all([listSeasons(), listEvents(), listAirfields()]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
        setAirfields(Array.isArray(airfieldResp) ? airfieldResp : []);
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : 'Failed to load events');
        }
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    };
    loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (routeHasEventID) {
      setSelectedEvent(String(routeEventID));
    }
  }, [routeHasEventID, routeEventID]);

  useEffect(() => {
    if (!hasValidEventID) {
      setBudget(null);
      setSummary(null);
      setSections([]);
      setLineItems([]);
      setParameters({});
      setSelectedCurrencies(['EUR']);
      setPendingBaseCurrency('EUR');
      setDisplayCurrency('EUR');
      setLiveRates({});
      setLoading(false);
      return;
    }
    void loadBudgetData(activeEventID);
  }, [activeEventID]);

  useEffect(() => {
    if (!budget) return;
    const base = (pendingBaseCurrency || budget.base_currency || 'EUR').trim().toUpperCase();
    if (base.length !== 3) return;
    const currencies = Array.from(new Set([base, ...selectedCurrencies.map((c) => c.trim().toUpperCase())]));
    let cancelled = false;
    const refreshRates = async () => {
      try {
        const ratesResp = await previewBudgetCurrencyRates(budget.id, {
          base_currency: base,
          currencies
        });
        if (cancelled) return;
        setLiveRates(ratesResp.live_rates || {});
      } catch {
        // Keep current rates when preview fetch fails.
      }
    };
    void refreshRates();
    return () => {
      cancelled = true;
    };
  }, [budget?.id, budget?.base_currency, pendingBaseCurrency, selectedCurrencies]);
  useEffect(() => {
    if (!budget?.id) return;
    const storageKey = `budget-estimate-currencies:${budget.id}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      setEstimateCurrencies((prev) => ({ ...prev, ...parsed }));
    } catch {
      // Ignore invalid local storage payloads.
    }
  }, [budget?.id]);
  useEffect(() => {
    if (!budget?.id) return;
    const storageKey = `budget-estimate-currencies:${budget.id}`;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(estimateCurrencies));
    } catch {
      // Ignore local storage write failures.
    }
  }, [budget?.id, estimateCurrencies]);

  const createBudget = async () => {
    if (!hasValidEventID) return;
    setCreating(true);
    setMessage(null);
    try {
      await createEventBudget(activeEventID, {
        name: 'Event budget',
        base_currency: 'EUR'
      });
      await loadBudgetData(activeEventID);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create budget');
    } finally {
      setCreating(false);
    }
  };

  const onSaveParameters = async (e: FormEvent) => {
    e.preventDefault();
    if (!budget) return;
    setSavingParameters(true);
    setMessage(null);
    try {
      if (activeEventData) {
        const currentDeposit = Math.max(0, Number(activeEventData.deposit_amount || 0));
        const requestedTotal = Math.max(0, Number(eventRegistrationTotal || 0));
        if (!Number.isFinite(requestedTotal)) {
          throw new Error('Event registration must be a valid number');
        }
        const requestedCurrency = (eventCurrencyInput || '').trim().toUpperCase() || 'EUR';
        if (requestedCurrency.length !== 3) {
          throw new Error('Event currency must be a valid 3-letter ISO code');
        }
        let nextDeposit = currentDeposit;
        let nextMainInvoice = Math.max(0, requestedTotal - currentDeposit);
        if (requestedTotal < currentDeposit) {
          nextDeposit = requestedTotal;
          nextMainInvoice = 0;
        }
        const currentTotal = Math.max(
          0,
          Number(activeEventData.deposit_amount || 0) + Number(activeEventData.main_invoice_amount || 0)
        );
        const currentCurrency = (activeEventData.currency || 'EUR').trim().toUpperCase() || 'EUR';
        const hasChanged = Math.abs(requestedTotal - currentTotal) > 0.0001;
        const hasCurrencyChanged = requestedCurrency !== currentCurrency;
        if (hasChanged || hasCurrencyChanged) {
          const updatedEvent = await updateEvent(activeEventData.id, {
            season_id: activeEventData.season_id,
            name: activeEventData.name,
            location: activeEventData.location || undefined,
            slots: activeEventData.slots || 0,
            status: activeEventData.status,
            starts_at: activeEventData.starts_at,
            ends_at: activeEventData.ends_at || undefined,
            public_registration_slug: activeEventData.public_registration_slug || undefined,
            public_registration_enabled: activeEventData.public_registration_enabled,
            registration_open_at: activeEventData.registration_open_at || undefined,
            main_invoice_deadline: activeEventData.main_invoice_deadline || undefined,
            deposit_amount: nextDeposit,
            main_invoice_amount: nextMainInvoice,
            currency: requestedCurrency,
            minimum_deposit_count: activeEventData.minimum_deposit_count || 0,
            commercial_status: activeEventData.commercial_status
          });
          setEvents((prev) => prev.map((ev) => (ev.id === updatedEvent.id ? updatedEvent : ev)));
        }
      }
      const resolvedBaseCurrency = pendingBaseCurrency || baseCurrency;
      const payload = Array.from(new Set([resolvedBaseCurrency, ...selectedCurrencies]));
      const updatedBudget = await updateBudget(budget.id, {
        base_currency: resolvedBaseCurrency
      });
      const currenciesResp = await updateBudgetCurrencies(budget.id, payload);
      const assumptionsPayload = { ...parameters };
      const estimateCurrencyPayload: Record<string, string> = {};
      ESTIMATE_PARAMETER_KEYS.forEach((key) => {
        const rawAmount = Number(assumptionsPayload[key] || 0);
        assumptionsPayload[key] = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
        estimateCurrencyPayload[key] = (estimateCurrencies[key] || resolvedBaseCurrency).trim().toUpperCase();
      });
      await updateBudgetAssumptions(budget.id, {
        values: assumptionsPayload,
        estimate_currencies: estimateCurrencyPayload
      });
      const nextCurrencies = currenciesResp.currencies?.length
        ? dedupeCurrencies(currenciesResp.currencies)
        : [resolvedBaseCurrency];
      setBudget(updatedBudget);
      setSelectedCurrencies(nextCurrencies);
      setLiveRates(currenciesResp.live_rates || {});
      setPendingBaseCurrency(currenciesResp.base_currency || updatedBudget.base_currency || resolvedBaseCurrency);
      if (!nextCurrencies.includes(displayCurrency)) {
        setDisplayCurrency(currenciesResp.base_currency || updatedBudget.base_currency || resolvedBaseCurrency);
      }
      const [latestSummary, latestLineItems] = await Promise.all([
        getBudgetSummary(budget.id),
        listBudgetLineItems(budget.id)
      ]);
      setSummary(latestSummary);
      setLineItems(Array.isArray(latestLineItems) ? latestLineItems : []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save parameters');
    } finally {
      setSavingParameters(false);
    }
  };

  const onAddCurrency = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!ISO_CURRENCY_CODES.includes(normalized as (typeof ISO_CURRENCY_CODES)[number])) {
      setMessage('Currency must be a valid ISO 3-letter code');
      return;
    }
    if (!normalized || selectedCurrencies.includes(normalized)) return;
    setSelectedCurrencies((prev) => [...prev, normalized]);
    setCurrencySearch('');
  };

  const onRemoveCurrency = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (normalized === pendingBaseCurrency) return;
    setSelectedCurrencies((prev) => prev.filter((curr) => curr !== normalized));
    setNewLineItem((prev) => ({
      ...prev,
      cost_currency: prev.cost_currency === normalized ? pendingBaseCurrency : prev.cost_currency
    }));
  };

  const onAddLineItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!budget) return;
    if (!newLineItem.section_id || !newLineItem.name.trim()) {
      return;
    }
    setSavingLineItem(true);
    setMessage(null);
    try {
      const payload = {
        section_id: Number(newLineItem.section_id),
        name: newLineItem.name.trim(),
        service_date: newLineItem.service_date || undefined,
        description: newLineItem.description || undefined,
        quantity: Number(newLineItem.quantity || '1'),
        unit_cost: Number(newLineItem.unit_cost || '0'),
        cost_currency: newLineItem.cost_currency || baseCurrency,
        notes: newLineItem.notes || undefined
      };
      if (editingLineItemID) {
        await updateBudgetLineItem(budget.id, editingLineItemID, payload);
      } else {
        await createBudgetLineItem(budget.id, payload);
      }
      setNewLineItem((prev) => ({
        ...prev,
        name: '',
        service_date: '',
        description: '',
        quantity: '1',
        unit_cost: '',
        cost_currency: baseCurrency,
        notes: ''
      }));
      setAddingLineItem(false);
      setEditingLineItemID(null);
      await loadBudgetData(activeEventID);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : editingLineItemID ? 'Failed to update line item' : 'Failed to add line item');
    } finally {
      setSavingLineItem(false);
    }
  };

  const onDeleteLineItem = async (lineItemId: number) => {
    if (!budget) return;
    setMessage(null);
    try {
      await deleteBudgetLineItem(budget.id, lineItemId);
      await loadBudgetData(activeEventID);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete line item');
    }
  };
  const isAutogeneratedLineItem = (item: BudgetLineItem) => {
    const notes = (item.notes || '').trim().toLowerCase();
    return notes.startsWith('[auto-estimate]') || notes.startsWith('[auto-aircraft-innhopp]');
  };
  const onEditLineItem = (item: BudgetLineItem) => {
    setNewLineItem({
      section_id: String(item.section_id),
      name: item.name || '',
      service_date: item.service_date ? item.service_date.slice(0, 10) : '',
      description: item.description || '',
      quantity: String(item.quantity ?? 1),
      unit_cost: String(item.unit_cost ?? ''),
      cost_currency: item.cost_currency || baseCurrency,
      notes: item.notes || ''
    });
    setEditingLineItemID(item.id);
    setAddingLineItem(true);
    setOpenLineItemActionsFor(null);
  };

  const onSubmitForReview = async () => {
    if (!budget) return;
    setSubmittingReview(true);
    setMessage(null);
    try {
      await updateBudget(budget.id, { status: 'review' });
      await loadBudgetData(activeEventID);
      setMessage('Budget moved to review.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to submit budget for review');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleCopyEvent = async () => {
    if (!routeHasEventID || !hasValidEventID) return;
    setCopying(true);
    setMessage(null);
    try {
      const cloned = await copyEvent(activeEventID);
      navigate(`/events/${cloned.id}/budget`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to copy event');
    } finally {
      setCopying(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!routeHasEventID || !hasValidEventID) return;
    const confirmed = window.confirm('Delete this event and its budget? This cannot be undone.');
    if (!confirmed) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteEvent(activeEventID);
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const scenarioBars = useMemo(() => buildScenarioBars(summary), [summary]);
  const confirmLoads = Math.max(
    0,
    Math.round(
      parameters.confirm_load_count ??
        summary?.parameters?.confirm_load_count ??
        summary?.assumptions?.confirm_load_count ??
        0
    )
  );
  const fullLoads = Math.max(
    0,
    Math.round(
      parameters.full_load_count ??
        summary?.parameters?.full_load_count ??
        summary?.assumptions?.full_load_count ??
        0
    )
  );
  const fullScenarioParticipants = summary?.scenarios?.full_capacity_case?.participants || 0;
  const getScenarioScales = (scenario: LabelScenarioKey) => {
    const scenarioAircraftLoads = scenario === 'confirm' ? confirmLoads : scenario === 'worst' ? confirmLoads + 1 : fullLoads;
    const selectedScenario = summary?.scenarios?.[scenarioSummaryKeyByLabel[scenario]] || null;
    const selectedScenarioParticipants = selectedScenario?.participants || 0;
    const aircraftScale = fullLoads <= 0 || scenarioAircraftLoads <= 0 ? 1 : scenarioAircraftLoads / fullLoads;
    const participantScaleValue =
      fullScenarioParticipants <= 0 || selectedScenarioParticipants <= 0
        ? 1
        : selectedScenarioParticipants / fullScenarioParticipants;
    const expected = selectedScenario?.expected_cost || 0;
    const withDrift = selectedScenario?.cost_with_drift || 0;
    const driftScale = expected <= 0 || withDrift <= 0 ? 1 : withDrift / expected;
    return {
      selectedScenario,
      aircraftScale,
      participantScale: participantScaleValue,
      driftScale
    };
  };
  const costSplitScales = getScenarioScales(costSplitScenario);
  const selectedCostSplitScenario = costSplitScales.selectedScenario;
  const aircraftLoadScale = costSplitScales.aircraftScale;
  const participantScale = costSplitScales.participantScale;
  const scenarioDriftScale = costSplitScales.driftScale;
  const isLoadBasedCrewMode = budgetMethod === BUDGET_METHOD_ESTIMATES || budgetMethod === BUDGET_METHOD_HYBRID;
  const isEstimateOrHybridMode = budgetMethod === BUDGET_METHOD_ESTIMATES || budgetMethod === BUDGET_METHOD_HYBRID;
  const costSplit = useMemo(() => {
    const split = buildCostSplit(summary, costSplitMode);
    const scaledSections = split.map((section) => {
      const sectionCode = (section.key || '').trim().toLowerCase();
      const isAircraft = sectionCode === 'aircraft';
      const isPayableCrew = sectionCode === 'payable_crew';
      const isFoodAccommodation = sectionCode === 'food_accommodation';
      const loadScale = isAircraft || (isPayableCrew && isLoadBasedCrewMode);
      const paxScale = isFoodAccommodation && isEstimateOrHybridMode;
      const scaledTotal =
        section.total * (loadScale ? aircraftLoadScale : 1) * (paxScale ? participantScale : 1) * scenarioDriftScale;
      return {
        ...section,
        total: scaledTotal,
        displayTotal: convertBaseAmountToDisplayCurrency(scaledTotal)
      };
    });
    const scaledTotalAll = scaledSections.reduce((acc, section) => acc + section.total, 0);
    const scaledMax = scaledSections.reduce((acc, section) => Math.max(acc, section.total), 0);
    return scaledSections.map((section) => {
      const scaledPercentage = scaledTotalAll > 0 ? (section.total / scaledTotalAll) * 100 : 0;
      return {
        ...section,
        percentage: scaledPercentage,
        barPct: scaledMax > 0 ? (section.total / scaledMax) * 100 : 0,
        displayValue: costSplitMode === 'percentage' ? scaledPercentage : section.displayTotal
      };
    });
  }, [
    summary,
    costSplitMode,
    aircraftLoadScale,
    participantScale,
    isLoadBasedCrewMode,
    isEstimateOrHybridMode,
    scenarioDriftScale
  ]);
  const targetMarkupPercent =
    parameters.target_markup_percent ??
    summary?.parameters?.target_markup_percent ??
    summary?.assumptions?.target_markup_percent ??
    0;
  const marginCurve = useMemo(
    () => buildMarginCurveModel(summary, targetMarkupPercent),
    [summary, targetMarkupPercent]
  );
  const worstCaseGreen = useMemo(() => isWorstCaseGreen(summary), [summary]);
  const innhoppsByID = useMemo(
    () => new Map((activeEventData?.innhopps || []).map((innhopp) => [innhopp.id, innhopp])),
    [activeEventData?.innhopps]
  );
  const aircraftByID = useMemo(
    () => new Map((activeEventData?.aircraft || []).map((aircraft) => [aircraft.id, aircraft])),
    [activeEventData?.aircraft]
  );
  const airfieldsByID = useMemo(() => new Map(airfields.map((airfield) => [airfield.id, airfield])), [airfields]);
  const typeBadgeClassNames: Record<EntryType, string> = {
    Innhopp: 'schedule-type-badge schedule-type-badge--innhopp',
    Transport: 'schedule-type-badge schedule-type-badge--transport',
    'Ground Crew': 'schedule-type-badge schedule-type-badge--ground-crew',
    Accommodation: 'schedule-type-badge schedule-type-badge--accommodation',
    Meal: 'schedule-type-badge schedule-type-badge--meal',
    Other: 'schedule-type-badge schedule-type-badge--other'
  };
  const warningMessageForNotes = (notes?: string) => {
    if (typeof notes !== 'string') return null;
    if (notes.includes(AUTO_AIRCRAFT_MISSING_AIRCRAFT_MARKER)) {
      return 'No aircraft assigned to this innhopp.';
    }
    if (notes.includes(AUTO_AIRCRAFT_MISSING_DISTANCE_MARKER)) {
      return 'Distance missing; minimum load duration used.';
    }
    if (notes.includes(AUTO_AIRCRAFT_SLOT_OVERFLOW_MARKER)) {
      return 'Distance exceeds the highest slot band; last band used as fallback.';
    }
    if (notes.includes(AUTO_ESTIMATE_LINE_ITEM_PREFIX) || notes.includes(AUTO_ESTIMATE_WARNING_MARKER)) {
      return 'Estimate-generated fallback line item.';
    }
    return null;
  };
  const aircraftPerInnhoppRows = useMemo(() => {
    const fallbackAircraftCostCurrency = (baseCurrency || 'EUR').trim().toUpperCase() || 'EUR';
    const seedRows = (activeEventData?.innhopps || []).map((innhopp) => {
      const cleanName = (innhopp.name || '').trim() || `Innhopp ${innhopp.id}`;
      const label = innhopp.sequence && innhopp.sequence > 0 ? `#${innhopp.sequence} ${cleanName}` : cleanName;
        return {
          key: innhopp.id,
          label,
          sequence: innhopp.sequence || Number.MAX_SAFE_INTEGER,
          sortOrder: 0,
          minutes: 0,
          unitCost: 0,
          totalCost: 0,
          displayTotalCost: 0,
          costCurrency: fallbackAircraftCostCurrency,
          hasMissingDistanceWarning: false
        };
      });
    const byInnhoppID = new Map(seedRows.map((row) => [row.key, row]));
    lineItems
      .filter(
        (item): item is BudgetLineItem & { innhopp_id: number } =>
          (item.section_code || '').trim().toLowerCase() === 'aircraft' &&
          typeof item.innhopp_id === 'number' &&
          item.innhopp_id > 0
      )
      .forEach((item) => {
        const innhopp = innhoppsByID.get(item.innhopp_id);
        const existing = byInnhoppID.get(item.innhopp_id);
        const fallbackName = item.description || item.name || `Innhopp ${item.innhopp_id}`;
        const normalizedName = fallbackName.trim().replace(/^#\d+\s+/, '');
        const cleanName = normalizedName || `Innhopp ${item.innhopp_id}`;
        const label =
          innhopp?.sequence && innhopp.sequence > 0 ? `#${innhopp.sequence} ${cleanName}` : cleanName;
        const converted = convertAmountToDisplayCurrency(
          Number(item.line_total || 0),
          (item.cost_currency || fallbackAircraftCostCurrency).trim().toUpperCase() || fallbackAircraftCostCurrency
        );
        if (existing) {
          existing.minutes += Number(item.quantity || 0);
          existing.totalCost += Number(item.line_total || 0);
          existing.displayTotalCost += converted;
          existing.hasMissingDistanceWarning =
            existing.hasMissingDistanceWarning || warningMessageForNotes(item.notes) !== null;
          return;
        }
        byInnhoppID.set(item.innhopp_id, {
          key: item.innhopp_id,
          label,
          sequence: innhopp?.sequence || Number.MAX_SAFE_INTEGER,
          sortOrder: item.sort_order || 0,
          minutes: Number(item.quantity || 0),
          unitCost: Number(item.unit_cost || 0),
          totalCost: Number(item.line_total || 0),
          displayTotalCost: converted,
          costCurrency:
            (item.cost_currency || fallbackAircraftCostCurrency).trim().toUpperCase() || fallbackAircraftCostCurrency,
          hasMissingDistanceWarning: warningMessageForNotes(item.notes) !== null
        });
      });
    return Array.from(byInnhoppID.values()).sort(
      (a, b) => a.sequence - b.sequence || a.sortOrder - b.sortOrder || a.key - b.key
    );
  }, [lineItems, innhoppsByID, activeEventData?.innhopps, baseCurrency, effectiveDisplayCurrency, liveRates]);
  const aircraftPerInnhoppSplit = useMemo(() => {
    const scaledRows = aircraftPerInnhoppRows.map((row) => ({
      ...row,
      displayTotalCost: row.displayTotalCost * aircraftLoadScale
    }));
    const aircraftSectionBaseTotal =
      summary?.section_totals?.find((section) => (section.code || '').trim().toLowerCase() === 'aircraft')?.total || 0;
    const aircraftSectionScenarioTotal = convertBaseAmountToDisplayCurrency(
      aircraftSectionBaseTotal * aircraftLoadScale * scenarioDriftScale
    );
    const rawTotal = scaledRows.reduce((acc, row) => acc + row.displayTotalCost, 0);
    const normalizeRatio = rawTotal > 0 ? aircraftSectionScenarioTotal / rawTotal : 1;
    const normalizedRows =
      costSplitMode === 'amount'
        ? scaledRows.map((row) => ({
            ...row,
            displayTotalCost: row.displayTotalCost * normalizeRatio
          }))
        : scaledRows;
    const total = normalizedRows.reduce((acc, row) => acc + row.displayTotalCost, 0);
    const max = normalizedRows.reduce((acc, row) => Math.max(acc, row.displayTotalCost), 0);
    return normalizedRows.map((row) => {
      const percentage = total > 0 ? (row.displayTotalCost / total) * 100 : 0;
      return {
        ...row,
        percentage,
        barPct: max > 0 ? (row.displayTotalCost / max) * 100 : 0
      };
    });
  }, [aircraftPerInnhoppRows, aircraftLoadScale, costSplitMode, summary?.section_totals, scenarioDriftScale]);
  const costSplitByDay = useMemo(() => {
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
    const formatDayLabel = (isoDate: string) => {
      const parts = isoDate.split('-').map((part) => Number(part));
      if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return isoDate;
      const [year, month, day] = parts;
      const date = new Date(Date.UTC(year, month - 1, day));
      const weekday = weekdayNames[date.getUTCDay()];
      const monthName = monthNames[date.getUTCMonth()];
      return `${weekday}, ${monthName} ${day} ${year}`;
    };
    const dailyTotals = new Map<
      string,
      {
        key: string;
        label: string;
        displayTotalCost: number;
        aircraftDisplayTotalCost: number;
        payableCrewDisplayTotalCost: number;
        foodAccommodationDisplayTotalCost: number;
        nonLoadBasedDisplayTotalCost: number;
      }
    >();
    const startDate = activeEventData?.starts_at ? activeEventData.starts_at.slice(0, 10) : '';
    const endDate = activeEventData?.ends_at ? activeEventData.ends_at.slice(0, 10) : startDate;
    if (startDate) {
      const [startY, startM, startD] = startDate.split('-').map((part) => Number(part));
      const [endY, endM, endD] = (endDate || startDate).split('-').map((part) => Number(part));
      const startUTC = Date.UTC(startY, startM - 1, startD);
      const endUTC = Date.UTC(endY, endM - 1, endD);
      if (Number.isFinite(startUTC) && Number.isFinite(endUTC)) {
        const step = 24 * 60 * 60 * 1000;
        const from = Math.min(startUTC, endUTC);
        const to = Math.max(startUTC, endUTC);
        for (let ts = from; ts <= to; ts += step) {
          const d = new Date(ts);
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          const key = `${y}-${m}-${day}`;
          dailyTotals.set(key, {
            key,
            label: formatDayLabel(key),
            displayTotalCost: 0,
            aircraftDisplayTotalCost: 0,
            payableCrewDisplayTotalCost: 0,
            foodAccommodationDisplayTotalCost: 0,
            nonLoadBasedDisplayTotalCost: 0
          });
        }
      }
    }
    lineItems.forEach((item) => {
      const key = item.service_date ? item.service_date.slice(0, 10) : 'undated';
      const label = item.service_date ? formatDayLabel(item.service_date.slice(0, 10)) : 'Undated';
      const sectionCode = (item.section_code || '').trim().toLowerCase();
      const isAircraft = sectionCode === 'aircraft';
      const isPayableCrew = sectionCode === 'payable_crew';
      const isFoodAccommodation = sectionCode === 'food_accommodation';
      const converted = convertAmountToDisplayCurrency(
        Number(item.line_total || 0),
        (item.cost_currency || baseCurrency).trim().toUpperCase() || baseCurrency
      );
      const existing = dailyTotals.get(key);
      if (existing) {
        existing.displayTotalCost += converted;
        if (isAircraft) {
          existing.aircraftDisplayTotalCost += converted;
        } else if (isPayableCrew) {
          existing.payableCrewDisplayTotalCost += converted;
        } else if (isFoodAccommodation) {
          existing.foodAccommodationDisplayTotalCost += converted;
        } else {
          existing.nonLoadBasedDisplayTotalCost += converted;
        }
      } else {
        dailyTotals.set(key, {
          key,
          label,
          displayTotalCost: converted,
          aircraftDisplayTotalCost: isAircraft ? converted : 0,
          payableCrewDisplayTotalCost: isPayableCrew ? converted : 0,
          foodAccommodationDisplayTotalCost: isFoodAccommodation ? converted : 0,
          nonLoadBasedDisplayTotalCost: !isAircraft && !isPayableCrew && !isFoodAccommodation ? converted : 0
        });
      }
    });
    const rows = Array.from(dailyTotals.values()).sort((a, b) => {
      if (a.key === 'undated') return 1;
      if (b.key === 'undated') return -1;
      return a.key.localeCompare(b.key);
    });
    let dayNumber = 0;
    const numberedRows = rows.map((row) => {
      if (row.key === 'undated') return row;
      dayNumber += 1;
      return {
        ...row,
        label: `#${dayNumber} ${row.label}`
      };
    });
    const scaledRows = numberedRows.map((row) => ({
      ...row,
      displayTotalCost:
        row.nonLoadBasedDisplayTotalCost +
        row.aircraftDisplayTotalCost * aircraftLoadScale +
        row.payableCrewDisplayTotalCost * (isLoadBasedCrewMode ? aircraftLoadScale : 1) +
        row.foodAccommodationDisplayTotalCost * (isEstimateOrHybridMode ? participantScale : 1)
    }));
    const dayRowsAmountAdjusted = (() => {
      const totalFromRows = scaledRows.reduce((acc, row) => acc + row.displayTotalCost, 0);
      const targetFromSections = costSplit.reduce(
        (acc, section) => acc + (typeof section.displayTotal === 'number' ? section.displayTotal : 0),
        0
      );
      const delta = targetFromSections - totalFromRows;
      if (Math.abs(delta) < 0.0001) return scaledRows;
      const datedRows = scaledRows.filter((row) => row.key !== 'undated');
      const bucketRows = datedRows.length > 0 ? datedRows : scaledRows;
      if (!bucketRows.length) return scaledRows;
      const perRowDelta = delta / bucketRows.length;
      return scaledRows.map((row) => {
        const shouldAdjust = bucketRows.some((bucket) => bucket.key === row.key);
        if (!shouldAdjust) return row;
        return {
          ...row,
          displayTotalCost: row.displayTotalCost + perRowDelta
        };
      });
    })();
    const total = dayRowsAmountAdjusted.reduce((acc, row) => acc + row.displayTotalCost, 0);
    const max = dayRowsAmountAdjusted.reduce((acc, row) => Math.max(acc, row.displayTotalCost), 0);
    return dayRowsAmountAdjusted.map((row) => {
      const percentage = total > 0 ? (row.displayTotalCost / total) * 100 : 0;
      return {
        ...row,
        percentage,
        barPct: max > 0 ? (row.displayTotalCost / max) * 100 : 0,
        displayValue: costSplitMode === 'percentage' ? percentage : row.displayTotalCost
      };
    });
  }, [
    lineItems,
    costSplitMode,
    costSplit,
    aircraftLoadScale,
    participantScale,
    isLoadBasedCrewMode,
    isEstimateOrHybridMode,
    baseCurrency,
    effectiveDisplayCurrency,
    liveRates,
    activeEventData?.starts_at,
    activeEventData?.ends_at
  ]);
  const lineItemsScales = getScenarioScales(lineItemsScenario);
  const lineItemsSectionOptions = useMemo(
    () =>
      sections.map((section) => ({
        id: String(section.id),
        name: section.name
      })),
    [sections]
  );
  const scenarioLineItems = useMemo<
    Array<BudgetLineItem & { scenario_quantity: number; scenario_line_total: number }>
  >(
    () =>
      lineItems
        .filter((item) => lineItemsSectionFilter === 'all' || String(item.section_id) === lineItemsSectionFilter)
        .sort((a, b) => {
          const aDate = a.service_date ? a.service_date.slice(0, 10) : '9999-12-31';
          const bDate = b.service_date ? b.service_date.slice(0, 10) : '9999-12-31';
          if (aDate !== bDate) return aDate.localeCompare(bDate);

          const aSection = a.section_name || a.section_code || '';
          const bSection = b.section_name || b.section_code || '';
          if (aSection !== bSection) return aSection.localeCompare(bSection, undefined, { sensitivity: 'base' });

          const aItem = a.name || '';
          const bItem = b.name || '';
          if (aItem !== bItem) return aItem.localeCompare(bItem, undefined, { sensitivity: 'base' });

          const aDescription = a.description || '';
          const bDescription = b.description || '';
          if (aDescription !== bDescription) {
            return aDescription.localeCompare(bDescription, undefined, { sensitivity: 'base' });
          }

          return a.id - b.id;
        })
        .map((item) => {
          const sectionCode = (item.section_code || '').trim().toLowerCase();
          const isAircraft = sectionCode === 'aircraft';
          const isPayableCrew = sectionCode === 'payable_crew';
          const isFoodAccommodation = sectionCode === 'food_accommodation';
          const loadScale = isAircraft || (isPayableCrew && isLoadBasedCrewMode) ? lineItemsScales.aircraftScale : 1;
          const paxScale = isFoodAccommodation && isEstimateOrHybridMode ? lineItemsScales.participantScale : 1;
          const scaledQuantity = Number(item.quantity || 0) * loadScale;
          const scenarioQuantity = isAircraft ? Math.ceil(scaledQuantity) : scaledQuantity;
          const scenarioScale = loadScale * paxScale * lineItemsScales.driftScale;
          const scenarioLineTotal = isAircraft
            ? scenarioQuantity * Number(item.unit_cost || 0) * lineItemsScales.driftScale
            : Number(item.line_total || 0) * scenarioScale;
          return {
            ...item,
            scenario_quantity: scenarioQuantity,
            scenario_line_total: scenarioLineTotal
          };
        }),
    [
      lineItems,
      lineItemsSectionFilter,
      lineItemsScales.aircraftScale,
      lineItemsScales.participantScale,
      lineItemsScales.driftScale,
      isLoadBasedCrewMode,
      isEstimateOrHybridMode
    ]
  );
  const scenarioForCard = (card: OverviewScenarioCardKey) =>
    summary?.scenarios?.[scenarioSummaryKeyByLabel[overviewScenarios[card]]] || null;
  const expectedCostScenario = scenarioForCard('expectedCost');
  const costWithDriftScenario = scenarioForCard('costWithDrift');
  const targetRevenueScenario = scenarioForCard('targetRevenue');
  const perParticipantScenario = scenarioForCard('perParticipant');
  const overviewExpectedCost = expectedCostScenario?.expected_cost ?? summary?.expected_cost ?? 0;
  const overviewCostWithDrift = costWithDriftScenario?.cost_with_drift ?? summary?.cost_with_drift ?? 0;
  const targetRevenueCostWithDrift = targetRevenueScenario?.cost_with_drift ?? summary?.cost_with_drift ?? 0;
  const overviewRevenue = targetRevenueCostWithDrift * (1 + targetMarkupPercent / 100);
  const perParticipantParticipants = perParticipantScenario?.participants || 0;
  const perParticipantCostWithDrift = perParticipantScenario?.cost_with_drift ?? summary?.cost_with_drift ?? 0;
  const perParticipantRevenue = perParticipantScenario?.revenue ?? summary?.target_revenue ?? 0;
  const costPerParticipant =
    perParticipantParticipants > 0 ? perParticipantCostWithDrift / perParticipantParticipants : 0;
  const tipPercent =
    parameters.optional_tip_percent ??
    summary?.parameters?.optional_tip_percent ??
    summary?.assumptions?.optional_tip_percent ??
    0;
  const revenuePerParticipant =
    perParticipantParticipants > 0 ? perParticipantRevenue / perParticipantParticipants : 0;
  const tipPerParticipant = revenuePerParticipant * (tipPercent / 100);
  const targetRegistrationPerParticipant =
    perParticipantParticipants > 0
      ? (perParticipantCostWithDrift * (1 + targetMarkupPercent / 100)) / perParticipantParticipants
      : 0;
  const renderLabelWithScenario = (label: string, card: OverviewScenarioCardKey) => {
    const scenario = overviewScenarios[card];
    const currentMeta = labelScenarioMeta[scenario];
    return (
      <span className="budget-label-with-scenario">
        <span>{label}</span>
        <span className="budget-scenario-indicator-wrap">
          <button
            type="button"
            className={`budget-scenario-indicator budget-scenario-indicator-${scenario}`}
            aria-label={`Calculated with ${currentMeta.long.toLowerCase()}. Click to change scenario.`}
            title={`Calculated with ${currentMeta.long}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenScenarioMenuFor((prev) => (prev === card ? null : card));
            }}
          >
            {currentMeta.label}
            <span className="budget-scenario-indicator-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {openScenarioMenuFor === card ? (
            <div className="budget-scenario-menu" role="menu" onClick={(e) => e.stopPropagation()}>
              {(['confirm', 'worst', 'full'] as LabelScenarioKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`budget-scenario-menu-item ${scenario === key ? 'is-active' : ''}`}
                  role="menuitemradio"
                  aria-checked={scenario === key}
                  onClick={() => {
                    setOverviewScenarios((prev) => ({ ...prev, [card]: key }));
                    setOpenScenarioMenuFor(null);
                  }}
                >
                  {labelScenarioMeta[key].label}
                </button>
              ))}
            </div>
          ) : null}
        </span>
      </span>
    );
  };
  const toggleSection = (key: BudgetSectionKey) =>
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const getCurveMarginAtX = (x: number) => {
    if (!marginCurve || marginCurve.points.length === 0) return 0;
    const points = [...marginCurve.points].sort((a, b) => a.x - b.x);
    if (x <= points[0].x) return points[0].margin;
    if (x >= points[points.length - 1].x) return points[points.length - 1].margin;
    for (let index = 1; index < points.length; index += 1) {
      const left = points[index - 1];
      const right = points[index];
      if (x <= right.x) {
        const span = right.x - left.x || 1;
        const ratio = (x - left.x) / span;
        return left.margin + ratio * (right.margin - left.margin);
      }
    }
    return points[points.length - 1].margin;
  };
  const getCurvePointerPoint = (event: MouseEvent<SVGSVGElement>) => {
    if (!marginCurve) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const localX = ((event.clientX - rect.left) / rect.width) * marginCurve.chartWidth;
    const pointerX = clamp(localX, marginCurve.plotLeft, marginCurve.plotRight);
    const pointerXRatio =
      (pointerX - marginCurve.plotLeft) / (marginCurve.plotRight - marginCurve.plotLeft || 1);
    const pointerParticipants = marginCurve.xMin + pointerXRatio * (marginCurve.xMax - marginCurve.xMin);
    const confirmParticipants = summary?.scenarios?.confirm_case?.participants;
    const fullParticipants = summary?.scenarios?.full_capacity_case?.participants;
    if (
      typeof confirmParticipants === 'number' &&
      typeof fullParticipants === 'number' &&
      (pointerParticipants < confirmParticipants || pointerParticipants > fullParticipants)
    ) {
      return null;
    }
    const participants = Math.round(pointerParticipants);
    const guideXRatio = (participants - marginCurve.xMin) / (marginCurve.xMax - marginCurve.xMin || 1);
    const x = clamp(
      marginCurve.plotLeft + guideXRatio * (marginCurve.plotRight - marginCurve.plotLeft),
      marginCurve.plotLeft,
      marginCurve.plotRight
    );
    const margin = getCurveMarginAtX(x);
    const yRatio = (marginCurve.axisMax - margin) / (marginCurve.axisMax - marginCurve.axisMin || 1);
    const y = clamp(
      marginCurve.plotTop + yRatio * (marginCurve.plotBottom - marginCurve.plotTop),
      marginCurve.plotTop,
      marginCurve.plotBottom
    );
    return { x, y, participants, margin };
  };
  const interpolateScenarioValueAtParticipants = (
    participants: number,
    selector: (scenario: NonNullable<BudgetSummary['scenarios']>['confirm_case']) => number
  ) => {
    const scenarios = summary?.scenarios;
    if (!scenarios) return 0;
    const points = [scenarios.confirm_case, scenarios.worst_case_gate, scenarios.full_capacity_case]
      .filter((scenario): scenario is NonNullable<typeof scenario> => Boolean(scenario))
      .map((scenario) => ({
        participants: Number(scenario.participants || 0),
        value: Number(selector(scenario) || 0)
      }))
      .filter((point) => Number.isFinite(point.participants))
      .sort((a, b) => a.participants - b.participants);
    if (!points.length) return 0;
    if (participants <= points[0].participants) return points[0].value;
    if (participants >= points[points.length - 1].participants) return points[points.length - 1].value;
    for (let i = 1; i < points.length; i += 1) {
      const left = points[i - 1];
      const right = points[i];
      if (participants <= right.participants) {
        const span = right.participants - left.participants || 1;
        const ratio = (participants - left.participants) / span;
        return left.value + ratio * (right.value - left.value);
      }
    }
    return points[points.length - 1].value;
  };
  const handleCurveMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const point = getCurvePointerPoint(event);
    if (!point) {
      setCurveHover(null);
      return;
    }
    setCurveHover(point);
  };
  const handleCurveClick = (event: MouseEvent<SVGSVGElement>) => {
    if (curvePopup) {
      setCurvePopup(null);
      return;
    }
    const point = getCurvePointerPoint(event);
    if (!point) {
      setCurvePopup(null);
      return;
    }
    const costWithDrift = interpolateScenarioValueAtParticipants(point.participants, (scenario) =>
      Number(scenario.cost_with_drift || 0)
    );
    const revenue = interpolateScenarioValueAtParticipants(point.participants, (scenario) =>
      Number(scenario.revenue || 0)
    );
    setCurvePopup({
      ...point,
      costWithDrift,
      revenue
    });
  };
  const clearCurveHover = () => setCurveHover(null);

  return (
    <section className="stack">
      <header className="page-header">
        {routeHasEventID && activeEventData ? (
          <div className="event-schedule-headline-text">
            <div className="event-header-top">
              <h2 className="event-detail-title">{activeEventData.name}: Budget</h2>
            </div>
            <p className="event-location">{activeEventData.location || 'Location TBD'}</p>
            <div className="event-detail-header-badges">
              <span className={`badge status-${activeEventData.status}`}>{activeEventData.status}</span>
            </div>
          </div>
        ) : (
          <div>
            <h2>Budgets</h2>
          </div>
        )}
        {routeHasEventID && activeEventData ? (
          <EventGearMenu
            eventId={activeEventData.id}
            currentPage="budget"
            copying={copying}
            deleting={deleting}
            menuId="event-budget-actions-menu"
            onCopy={() => void handleCopyEvent()}
            onDelete={() => void handleDeleteEvent()}
          />
        ) : routeHasEventID ? (
          <Link to={`/events/${activeEventID}`} className="button-link secondary">
            Back to Event
          </Link>
        ) : null}
      </header>

      {message ? <p className="error-text">{message}</p> : null}
      {loadingFilters ? <p>Loading…</p> : null}

      {!routeHasEventID ? (
        <article className="card">
          <div className="form-grid logistics-list-filters">
            <label className="form-field">
              <span>Season</span>
              <select
                value={selectedSeason}
                onChange={(e) => {
                  setSelectedSeason(e.target.value);
                  setSelectedEvent('');
                }}
                className="logistics-list-season-select"
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
                className="logistics-list-event-select"
              >
                <option value="">Select an event</option>
                {filteredEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="card-actions">
          </div>
        </article>
      ) : null}

      {loading ? <p>Loading budget…</p> : null}

      {!loading && hasValidEventID && !budget ? (
        <article className="card">
          <h3>No budget yet</h3>
          <p className="muted">
            Create the budget for this event to start tracking costs, revenue, and worst-case gate.
          </p>
          <div className="card-actions">
            <button
              type="button"
              className="primary"
              disabled={creating}
              onClick={() => void createBudget()}
            >
              {creating ? 'Creating…' : 'Create budget'}
            </button>
          </div>
        </article>
      ) : null}

      {!loading && budget && summary ? (
        <>
          <article className="card budget-overview-card">
            <header
              className="card-header event-detail-section-header budget-overview-header"
              onClick={() => toggleSection('overview')}
            >
              <div className="event-detail-section-header-main budget-overview-title">
                <button
                  className="ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('overview');
                  }}
                >
                  {openSections.overview ? '▾' : '▸'}
                </button>
                <h3 className="event-detail-section-title">Overview</h3>
                <span className={`badge status-${budget.status}`}>{budget.status}</span>
              </div>
            </header>
            {openSections.overview && (
              <>
            <div className="budget-kpi-grid">
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">{renderLabelWithScenario('Expected Cost', 'expectedCost')}</span>
                <strong>{formatMoney(overviewExpectedCost)}</strong>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">{renderLabelWithScenario('Cost with Drift', 'costWithDrift')}</span>
                <strong>{formatMoney(overviewCostWithDrift)}</strong>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">{renderLabelWithScenario('Target Revenue', 'targetRevenue')}</span>
                <strong>{formatMoney(overviewRevenue)}</strong>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">{renderLabelWithScenario('Per Participant', 'perParticipant')}</span>
                <div className="budget-kpi-badge-row-spacer budget-kpi-badge-row-spacer-top" aria-hidden="true" />
                <div className="budget-kpi-split">
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Cost</span>
                    <strong>{formatMoney(costPerParticipant)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Revenue</span>
                    <strong>{formatMoney(revenuePerParticipant)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Tip</span>
                    <strong>{formatMoney(tipPerParticipant)}</strong>
                  </div>
                </div>
                <div className="budget-kpi-badge-row-spacer" aria-hidden="true" />
                <span className="field-label budget-kpi-section-subtitle budget-kpi-inline-label">Target Registration</span>
                <div className="budget-kpi-single-row">
                  <strong>{formatMoney(targetRegistrationPerParticipant)}</strong>
                </div>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">Revenue</span>
                <div className="budget-kpi-badge-row-spacer budget-kpi-badge-row-spacer-top" aria-hidden="true" />
                <div className="budget-kpi-split">
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Confirm</span>
                    <strong>{formatMoney(summary.scenarios?.confirm_case?.revenue || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Worst</span>
                    <strong>{formatMoney(summary.scenarios?.worst_case_gate?.revenue || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Full</span>
                    <strong>{formatMoney(summary.scenarios?.full_capacity_case?.revenue || 0)}</strong>
                  </div>
                </div>
                <div className="budget-kpi-badge-row-spacer" aria-hidden="true" />
                <span className="field-label budget-kpi-section-subtitle budget-kpi-inline-label">
                  Including tip
                </span>
                <div className="budget-kpi-split">
                  <div className="budget-kpi-split-item">
                    <strong>{formatMoney(summary.scenarios?.confirm_case?.revenue_with_tip || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <strong>{formatMoney(summary.scenarios?.worst_case_gate?.revenue_with_tip || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <strong>{formatMoney(summary.scenarios?.full_capacity_case?.revenue_with_tip || 0)}</strong>
                  </div>
                </div>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">Margin</span>
                <div className="budget-kpi-badge-row-spacer budget-kpi-badge-row-spacer-top" aria-hidden="true" />
                <div className="budget-kpi-split">
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Confirm</span>
                    <strong>{formatMoney(summary.scenarios?.confirm_case?.margin_without_tip || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Worst</span>
                    <strong>{formatMoney(summary.scenarios?.worst_case_gate?.margin_without_tip || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Full</span>
                    <strong>{formatMoney(summary.scenarios?.full_capacity_case?.margin_without_tip || 0)}</strong>
                  </div>
                </div>
                <div className="budget-kpi-split">
                  <div className="budget-kpi-split-item">
                    <span
                      className={`badge ${
                        (summary.scenarios?.confirm_case?.margin_without_tip || 0) >= 0 ? 'success' : 'danger'
                      }`}
                    >
                      {(summary.scenarios?.confirm_case?.margin_without_tip || 0) >= 0 ? 'Green' : 'Red'}
                    </span>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span
                      className={`badge ${
                        (summary.scenarios?.worst_case_gate?.margin_without_tip || 0) >= 0 ? 'success' : 'danger'
                      }`}
                    >
                      {(summary.scenarios?.worst_case_gate?.margin_without_tip || 0) >= 0 ? 'Green' : 'Red'}
                    </span>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span
                      className={`badge ${
                        (summary.scenarios?.full_capacity_case?.margin_without_tip || 0) >= 0 ? 'success' : 'danger'
                      }`}
                    >
                      {(summary.scenarios?.full_capacity_case?.margin_without_tip || 0) >= 0 ? 'Green' : 'Red'}
                    </span>
                  </div>
                </div>
                <span className="field-label budget-kpi-section-subtitle budget-kpi-inline-label">
                  Including tip
                </span>
                <div className="budget-kpi-split">
                  <div className="budget-kpi-split-item">
                    <strong>{formatMoney(summary.scenarios?.confirm_case?.margin_with_tip || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <strong>{formatMoney(summary.scenarios?.worst_case_gate?.margin_with_tip || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <strong>{formatMoney(summary.scenarios?.full_capacity_case?.margin_with_tip || 0)}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="card-actions budget-overview-actions">
              <button
                type="button"
                className="primary"
                disabled={isSubmitForReviewDisabled(budget.status, summary, submittingReview)}
                onClick={() => void onSubmitForReview()}
              >
                {submittingReview ? 'Submitting…' : 'Submit for review'}
              </button>
            </div>
              </>
            )}
          </article>

          <article className="card budget-cost-revenue-card">
            <header
              className="card-header event-detail-section-header"
              onClick={() => toggleSection('costRevenue')}
            >
              <div className="event-detail-section-header-main">
                <button
                  className="ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('costRevenue');
                  }}
                >
                  {openSections.costRevenue ? '▾' : '▸'}
                </button>
                <h3 className="event-detail-section-title">Cost vs Revenue</h3>
              </div>
            </header>
            {openSections.costRevenue && (
            <div className="budget-bars-grid">
              {scenarioBars.map((entry) => (
                <div className="budget-bar-card" key={entry.key}>
                  {(() => {
                    const scenarioTargetRevenue = entry.costWithDrift * (1 + targetMarkupPercent / 100);
                    const scenarioTargetMargin = scenarioTargetRevenue - entry.costWithDrift;
                    const targetRevenuePctRaw =
                      entry.costWithDrift > 0
                        ? entry.costPct * (1 + targetMarkupPercent / 100)
                        : entry.revenue > 0
                          ? entry.revenuePct * (scenarioTargetRevenue / entry.revenue)
                          : 0;
                    const targetRevenuePct = Math.max(0, Math.min(100, targetRevenuePctRaw));
                    return (
                      <>
                  <div className="budget-bar-header">
                    <strong>{entry.label}</strong>
                    <span className="muted">{entry.participants} pax</span>
                  </div>
                  <div className="budget-grouped-bars">
                    <div className="budget-grouped-bar-wrap">
                      <span className="field-label">Cost</span>
                      <div
                        className="budget-bar-track"
                        title={`Expected ${formatMoney(
                          entry.expectedCost
                        )} + Drift ${formatMoney(entry.driftAmount)}`}
                      >
                        <div className="budget-bar budget-bar-red" style={{ width: `${entry.costPct}%` }} />
                      </div>
                    </div>
                    <div className="budget-grouped-bar-wrap">
                      <span className="field-label">Revenue</span>
                      <div className="budget-bar-track">
                        <span
                          className="budget-bar-target-line"
                          style={{ left: `${targetRevenuePct}%` }}
                          title={`Target Revenue: ${formatMoney(scenarioTargetRevenue || 0)}`}
                          aria-hidden="true"
                        />
                        <div
                          className="budget-bar budget-bar-green"
                          style={{ width: `${entry.revenuePct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="budget-bar-table muted" role="table" aria-label={`${entry.label} cost revenue margin summary`}>
                    <div className="budget-bar-table-row budget-bar-table-row-labels" role="row">
                      <span className="field-label" role="cell">Cost</span>
                      <span className="field-label" role="cell">Target</span>
                      <span className="field-label" role="cell">Revenue</span>
                    </div>
                    <div className="budget-bar-table-row" role="row">
                      <span role="cell" className="budget-bar-value-amount">{formatMoney(entry.costWithDrift || 0)}</span>
                      <span role="cell" className="budget-bar-value-amount">{formatMoney(scenarioTargetRevenue || 0)}</span>
                      <span role="cell" className="budget-bar-value-amount">{formatMoney(entry.revenue || 0)}</span>
                    </div>
                    <div className="budget-bar-table-row budget-bar-table-row-spacer" role="row" aria-hidden="true">
                      <span role="cell" />
                      <span role="cell" />
                      <span role="cell" />
                    </div>
                    <div className="budget-bar-table-row budget-bar-table-row-two-col budget-bar-table-row-labels" role="row">
                      <span className="field-label" role="cell">{`Target Margin ${targetMarkupPercent}%`}</span>
                      <span className="field-label" role="cell">Margin</span>
                    </div>
                    <div className="budget-bar-table-row budget-bar-table-row-two-col" role="row">
                      <span role="cell" className="budget-bar-value-amount">{formatMoney(scenarioTargetMargin || 0)}</span>
                      <span role="cell" className="budget-bar-value-amount">{formatMoney(entry.marginWithoutTip || 0)}</span>
                    </div>
                    <div className="budget-bar-table-row budget-bar-table-row-single-col" role="row">
                      <span role="cell">
                        <span className={`badge ${entry.status === 'green' ? 'success' : 'danger'}`}>
                          {entry.status === 'green' ? 'Green' : 'Red'}
                        </span>
                      </span>
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
            )}
          </article>

          <article className="card budget-profitability-card">
            <header
              className="card-header event-detail-section-header"
              onClick={() => toggleSection('profitability')}
            >
              <div className="event-detail-section-header-main">
                <button
                  className="ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('profitability');
                  }}
                >
                  {openSections.profitability ? '▾' : '▸'}
                </button>
                <h3 className="event-detail-section-title">Profitability</h3>
              </div>
            </header>
            {openSections.profitability && (
            <>
            {marginCurve ? (
              <div className="budget-curve-wrap">
                <div className="budget-curve-chart-wrap">
                  <svg
                    className="budget-curve-chart"
                    viewBox={`0 0 ${marginCurve.chartWidth} ${marginCurve.chartHeight}`}
                    role="img"
                    aria-label="Margin across participants"
                    onMouseMove={handleCurveMouseMove}
                    onMouseLeave={clearCurveHover}
                    onClick={handleCurveClick}
                  >
                  <rect
                    x={marginCurve.plotLeft}
                    y={marginCurve.plotTop}
                    width={marginCurve.plotRight - marginCurve.plotLeft}
                    height={marginCurve.zeroY - marginCurve.plotTop}
                    fill="rgba(34, 197, 94, 0.12)"
                  />
                  <rect
                    x={marginCurve.plotLeft}
                    y={marginCurve.zeroY}
                    width={marginCurve.plotRight - marginCurve.plotLeft}
                    height={marginCurve.plotBottom - marginCurve.zeroY}
                    fill="rgba(220, 38, 38, 0.12)"
                  />
                  <line
                    x1={marginCurve.plotLeft}
                    y1={marginCurve.plotTop}
                    x2={marginCurve.plotLeft}
                    y2={marginCurve.plotBottom}
                    className="budget-curve-axis-line"
                  />
                  <line
                    x1={marginCurve.plotLeft}
                    y1={marginCurve.zeroY}
                    x2={marginCurve.plotRight}
                    y2={marginCurve.zeroY}
                    className="budget-curve-axis-line budget-curve-axis-zero"
                  />
                  <text
                    x={marginCurve.plotLeft - 10}
                    y={(marginCurve.plotTop + marginCurve.plotBottom) / 2}
                    className="budget-curve-axis-title field-label"
                    textAnchor="middle"
                    transform={`rotate(-90 ${marginCurve.plotLeft - 10} ${(marginCurve.plotTop + marginCurve.plotBottom) / 2})`}
                  >
                    Margin
                  </text>
                  <text
                    x={(marginCurve.plotLeft + marginCurve.plotRight) / 2}
                    y={marginCurve.plotBottom + 18}
                    className="budget-curve-axis-title field-label"
                    textAnchor="middle"
                  >
                    Participants
                  </text>
                  {curveHover ? (
                    <g>
                      <line
                        x1={curveHover.x}
                        y1={curveHover.y}
                        x2={marginCurve.plotLeft}
                        y2={curveHover.y}
                        className="budget-curve-hover-guide"
                      />
                      <line
                        x1={curveHover.x}
                        y1={curveHover.y}
                        x2={curveHover.x}
                        y2={marginCurve.plotBottom}
                        className="budget-curve-hover-guide"
                      />
                      <text
                        x={marginCurve.plotLeft + 4}
                        y={curveHover.y + 10}
                        className="budget-curve-hover-value"
                        textAnchor="start"
                      >
                        {formatMoney(curveHover.margin)}
                      </text>
                      <text
                        x={curveHover.x <= marginCurve.plotRight - 84 ? curveHover.x + 4 : curveHover.x - 4}
                        y={marginCurve.plotBottom - 4}
                        className="budget-curve-hover-value"
                        textAnchor={curveHover.x <= marginCurve.plotRight - 84 ? 'start' : 'end'}
                      >
                        {formatParticipants(curveHover.participants)} Participants
                      </text>
                    </g>
                  ) : null}
                  <polyline points={marginCurve.polylinePoints} className="budget-curve-line" />
                  <polyline
                    points={marginCurve.targetMarginPolylinePoints}
                    className="budget-curve-line budget-curve-line-target"
                  />
                  {marginCurve.targetMarginLabel ? (
                    <text
                      x={marginCurve.targetMarginLabel.x}
                      y={marginCurve.targetMarginLabel.y}
                      className="budget-curve-target-label"
                      textAnchor="middle"
                    >
                      <tspan x={marginCurve.targetMarginLabel.x} dy="0">
                        Target Margin
                      </tspan>
                      <tspan x={marginCurve.targetMarginLabel.x} dy="1.2em">
                        {`${Math.round(marginCurve.targetMarginLabel.percent)}%`}
                      </tspan>
                    </text>
                  ) : null}
                  {marginCurve.markers.map((marker) => (
                    <g key={marker.key}>
                      <circle
                        cx={marker.x}
                        cy={marker.y}
                        r="5"
                        className={`budget-curve-marker ${
                          marker.key === 'confirm_case'
                            ? 'budget-curve-marker-confirm'
                            : marker.key === 'worst_case_gate'
                              ? 'budget-curve-marker-worst'
                              : 'budget-curve-marker-full'
                        }`}
                      />
                      <text
                        x={marker.labelX}
                        y={marker.labelY}
                        className="budget-curve-label"
                        textAnchor={marker.labelAnchor}
                      >
                        <tspan x={marker.labelX} dy="0">
                          {marker.label}
                        </tspan>
                        <tspan x={marker.labelX} dy="1.2em">
                          {formatMoney(marker.margin)}
                        </tspan>
                      </text>
                    </g>
                  ))}
                  </svg>
                  {curvePopup ? (
                    <div
                      className="budget-curve-popup"
                    >
                      <button
                        type="button"
                        className="ghost budget-curve-popup-close"
                        aria-label="Close profitability popup"
                        onClick={() => setCurvePopup(null)}
                      >
                        ×
                      </button>
                      {(() => {
                        const scenarioTargetRevenue =
                          curvePopup.costWithDrift * (1 + targetMarkupPercent / 100);
                        const scenarioTargetMargin = scenarioTargetRevenue - curvePopup.costWithDrift;
                        const status = curvePopup.margin >= 0 ? 'green' : 'red';
                        return (
                          <div className="budget-bar-card">
                            <div className="budget-bar-header">
                              <strong>{`${curvePopup.participants} participants`}</strong>
                            </div>
                            <div
                              className="budget-bar-table muted"
                              role="table"
                              aria-label={`${curvePopup.participants} participants summary`}
                            >
                              <div className="budget-bar-table-row budget-bar-table-row-labels" role="row">
                                <span className="field-label" role="cell">Cost</span>
                                <span className="field-label" role="cell">Target Revenue</span>
                                <span className="field-label" role="cell">Revenue</span>
                              </div>
                              <div className="budget-bar-table-row" role="row">
                                <span role="cell" className="budget-bar-value-amount">
                                  {formatMoney(curvePopup.costWithDrift || 0)}
                                </span>
                                <span role="cell" className="budget-bar-value-amount">
                                  {formatMoney(scenarioTargetRevenue || 0)}
                                </span>
                                <span role="cell" className="budget-bar-value-amount">
                                  {formatMoney(curvePopup.revenue || 0)}
                                </span>
                              </div>
                              <div
                                className="budget-bar-table-row budget-bar-table-row-spacer"
                                role="row"
                                aria-hidden="true"
                              >
                                <span role="cell" />
                                <span role="cell" />
                                <span role="cell" />
                              </div>
                              <div
                                className="budget-bar-table-row budget-bar-table-row-two-col budget-bar-table-row-labels"
                                role="row"
                              >
                                <span className="field-label" role="cell">{`Target Margin ${targetMarkupPercent}%`}</span>
                                <span className="field-label" role="cell">Margin</span>
                              </div>
                              <div className="budget-bar-table-row budget-bar-table-row-two-col" role="row">
                                <span role="cell" className="budget-bar-value-amount">
                                  {formatMoney(scenarioTargetMargin || 0)}
                                </span>
                                <span role="cell" className="budget-bar-value-amount">
                                  {formatMoney(curvePopup.margin || 0)}
                                </span>
                              </div>
                              <div className="budget-bar-table-row budget-bar-table-row-single-col" role="row">
                                <span role="cell">
                                  <span className={`badge ${status === 'green' ? 'success' : 'danger'}`}>
                                    {status === 'green' ? 'Green' : 'Red'}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="muted">No curve data available yet.</p>
            )}
            </>
            )}
          </article>

          <article className="card budget-cost-split-card">
            <header
              className="card-header event-detail-section-header budget-cost-split-header"
              onClick={() => toggleSection('costSplit')}
            >
              <div className="event-detail-section-header-main">
                <button
                  className="ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('costSplit');
                  }}
                >
                  {openSections.costSplit ? '▾' : '▸'}
                </button>
                <h3 className="event-detail-section-title">Cost Split</h3>
              </div>
              {openSections.costSplit && <div className="budget-cost-split-controls">
              <div className="budget-cost-split-scenario-row">
                <label className="form-field budget-cost-split-scenario-field">
                  <span>Scenario</span>
                  <select
                    value={costSplitScenario}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setCostSplitScenario(e.target.value as LabelScenarioKey)}
                  >
                    <option value="confirm">Confirm</option>
                    <option value="worst">Worst</option>
                    <option value="full">Full</option>
                  </select>
                </label>
              </div>
              <div className="budget-toggle-group budget-cost-split-tabs">
                <button
                  type="button"
                  className={costSplitTab === 'section' ? 'primary' : 'ghost'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCostSplitTab('section');
                  }}
                >
                  Section
                </button>
                <button
                  type="button"
                  className={costSplitTab === 'innhopp' ? 'primary' : 'ghost'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCostSplitTab('innhopp');
                  }}
                >
                  Innhopp
                </button>
                <button
                  type="button"
                  className={costSplitTab === 'day' ? 'primary' : 'ghost'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCostSplitTab('day');
                  }}
                >
                  Day
                </button>
              </div>
              <div className="budget-toggle-group budget-cost-split-mode">
                <button
                  type="button"
                  className={costSplitMode === 'amount' ? 'primary' : 'ghost'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCostSplitMode('amount');
                  }}
                >
                  Amount
                </button>
                <button
                  type="button"
                  className={costSplitMode === 'percentage' ? 'primary' : 'ghost'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCostSplitMode('percentage');
                  }}
                >
                  Percentage
                </button>
                {costSplitTab === 'innhopp' ? (
                  <button
                    type="button"
                    className={costSplitMode === 'time' ? 'primary' : 'ghost'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCostSplitMode('time');
                    }}
                  >
                    Time
                  </button>
                ) : null}
              </div>
              </div>}
            </header>
            {openSections.costSplit && (
            <div className="budget-cost-split-list">
              {costSplitTab === 'section' &&
                (() => {
                  const totalValue = costSplit.reduce((acc, section) => acc + section.displayValue, 0);
                  return (
                    <>
                      {costSplit.map((section) => (
                        <div className="budget-cost-split-item" key={section.key}>
                          <div className="budget-cost-split-top">
                            <span className="field-label">{section.label}</span>
                            <span className="muted">
                              {isPercentageSplitMode
                                ? `${section.displayValue.toFixed(1)}%`
                                : formatBaseMoney(section.displayValue, effectiveDisplayCurrency)}
                            </span>
                          </div>
                          <div className="budget-bar-track">
                            <div className="budget-bar budget-bar-blue" style={{ width: `${section.barPct}%` }} />
                          </div>
                        </div>
                      ))}
                      <div className="budget-cost-split-item budget-cost-split-item-total">
                        <div className="budget-cost-split-top">
                          <span className="field-label">Total</span>
                          <span className="muted">
                            {isPercentageSplitMode
                              ? `${totalValue.toFixed(1)}%`
                              : formatBaseMoney(totalValue, effectiveDisplayCurrency)}
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              {costSplitTab === 'innhopp' &&
                (() => {
                  const totalValue = aircraftPerInnhoppSplit.reduce((acc, row) => {
                    if (isTimeSplitMode) return acc + row.minutes;
                    return acc + (isPercentageSplitMode ? row.percentage : row.displayTotalCost);
                  }, 0);
                  const maxMinutes = aircraftPerInnhoppSplit.reduce((acc, row) => Math.max(acc, row.minutes), 0);
                  return (
                    <>
                      {aircraftPerInnhoppSplit.map((row) => (
                        <div
                          className="budget-cost-split-item"
                          key={row.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            const innhopp = innhoppsByID.get(row.key);
                            if (!innhopp) return;
                            const takeoff = innhopp.takeoff_airfield_id ? airfieldsByID.get(innhopp.takeoff_airfield_id) : null;
                            const landing = innhopp.landing_airfield_id ? airfieldsByID.get(innhopp.landing_airfield_id) : null;
                            const landingName =
                              landing?.name ||
                              ((innhopp.landing_airfield_id == null || innhopp.landing_airfield_id === innhopp.takeoff_airfield_id)
                                ? takeoff?.name || null
                                : null);
                            const aircraft =
                              typeof innhopp.aircraft_id === 'number' && innhopp.aircraft_id > 0
                                ? aircraftByID.get(innhopp.aircraft_id) || null
                                : null;
                            const elevationDiff =
                              typeof innhopp.elevation === 'number' && typeof takeoff?.elevation === 'number'
                                ? innhopp.elevation - takeoff.elevation
                                : null;
                            const minutes = Number(row.minutes || 0);
                            setPreviewEntry({
                              id: `i-${innhopp.id}`,
                              hourKey: '',
                              sortValue: Number.POSITIVE_INFINITY,
                              title: `Innhopp #${innhopp.sequence}: ${innhopp.name}`,
                              subtitle: `Aircraft time: ${formatDurationMinutesForInnhopp(minutes)}`,
                              type: 'Innhopp',
                              to: `/events/${activeEventID}/innhopps/${innhopp.id}`,
                              ready: isInnhoppReady(innhopp),
                              missingCoordinates: !(innhopp.coordinates || '').trim(),
                              description: innhopp.reason_for_choice || innhopp.primary_landing_area?.description || null,
                              notes: innhopp.notes || undefined,
                              innhoppReason: innhopp.reason_for_choice || null,
                              innhoppElevation: innhopp.elevation ?? null,
                              innhoppCoordinates: innhopp.coordinates || null,
                              innhoppTakeoffName: takeoff?.name || null,
                              innhoppLandingName: landingName,
                              innhoppDistanceByAir: innhopp.distance_by_air ?? null,
                              innhoppAircraftSpeedKmh: aircraft?.cruising_speed_kmh ?? null,
                              innhoppMinimumLoadDuration: aircraft?.minimum_load_duration ?? null,
                              innhoppElevationDiff: elevationDiff,
                              innhoppPrimaryName: innhopp.primary_landing_area?.name || null,
                              innhoppPrimarySize: innhopp.primary_landing_area?.size || null,
                              innhoppSecondaryName: innhopp.secondary_landing_area?.name || null,
                              innhoppSecondarySize: innhopp.secondary_landing_area?.size || null,
                              innhoppRisk: innhopp.risk_assessment || null,
                              innhoppMinimumRequirements: innhopp.minimum_requirements || null,
                              innhoppRescueBoat: innhopp.rescue_boat ?? null,
                              innhoppLandOwnerPermission: innhopp.land_owner_permission ?? null,
                              routeDurationLabel: formatDurationMinutesForInnhopp(minutes),
                              scheduledAt: innhopp.scheduled_at
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              (e.currentTarget as HTMLDivElement).click();
                            }
                          }}
                        >
                          <div className="budget-cost-split-top">
                            <span className="field-label">
                              {row.label}
                              {row.hasMissingDistanceWarning ? (
                                <sup
                                  className="nav-user-warning budget-warning-sup"
                                  title="Distance missing; minimum load duration used."
                                  aria-label="Distance missing; minimum load duration used."
                                >
                                  !
                                </sup>
                              ) : null}
                            </span>
                            <span className="muted">
                              {isTimeSplitMode
                                ? formatMinutesAsHours(row.minutes)
                                : isPercentageSplitMode
                                  ? `${row.percentage.toFixed(1)}%`
                                  : formatBaseMoney(row.displayTotalCost, effectiveDisplayCurrency)}
                            </span>
                          </div>
                          <div className="budget-bar-track">
                            <div
                              className="budget-bar budget-bar-blue"
                              style={{
                                width: `${isTimeSplitMode ? (maxMinutes > 0 ? (row.minutes / maxMinutes) * 100 : 0) : row.barPct}%`
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="budget-cost-split-item budget-cost-split-item-total">
                        <div className="budget-cost-split-top">
                          <span className="field-label">Total</span>
                          <span className="muted">
                            {isTimeSplitMode
                              ? formatMinutesAsHours(totalValue)
                              : isPercentageSplitMode
                                ? `${totalValue.toFixed(1)}%`
                                : formatBaseMoney(totalValue, effectiveDisplayCurrency)}
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              {costSplitTab === 'day' &&
                (() => {
                  const totalValue = costSplitByDay.reduce((acc, row) => acc + row.displayValue, 0);
                  return (
                    <>
                      {costSplitByDay.map((row) => (
                        <div className="budget-cost-split-item" key={row.key}>
                          <div className="budget-cost-split-top">
                            <span className="field-label">{row.label}</span>
                            <span className="muted">
                              {isPercentageSplitMode
                                ? `${row.displayValue.toFixed(1)}%`
                                : formatBaseMoney(row.displayValue, effectiveDisplayCurrency)}
                            </span>
                          </div>
                          <div className="budget-bar-track">
                            <div className="budget-bar budget-bar-blue" style={{ width: `${row.barPct}%` }} />
                          </div>
                        </div>
                      ))}
                      <div className="budget-cost-split-item budget-cost-split-item-total">
                        <div className="budget-cost-split-top">
                          <span className="field-label">Total</span>
                          <span className="muted">
                            {isPercentageSplitMode
                              ? `${totalValue.toFixed(1)}%`
                              : formatBaseMoney(totalValue, effectiveDisplayCurrency)}
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              {costSplitTab === 'innhopp' && aircraftPerInnhoppSplit.length === 0 ? (
                <p className="muted">No innhopps available for aircraft calculation yet.</p>
              ) : null}
              {costSplitTab === 'day' && costSplitByDay.length === 0 ? (
                <p className="muted">No dated line items available yet.</p>
              ) : null}
            </div>
            )}
      </article>
      {renderedPreviewEntry ? (
        <ScheduleEntryPreviewOverlay
          entry={renderedPreviewEntry}
          closing={previewClosing}
          onClose={closePreview}
          canOpenMapsActions={canOpenMapsActions}
          typeBadgeClassNames={typeBadgeClassNames}
          onNavigateToEntry={(entry) => {
            if (!entry.to) return;
            navigate(entry.to);
          }}
        />
      ) : null}

          <article className="card budget-parameters-card">
            <header
              className="card-header event-detail-section-header"
              onClick={() => toggleSection('parameters')}
            >
              <div className="event-detail-section-header-main">
                <button
                  className="ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('parameters');
                  }}
                >
                  {openSections.parameters ? '▾' : '▸'}
                </button>
                <h3 className="event-detail-section-title">Parameters</h3>
              </div>
            </header>
            {openSections.parameters && (
            <>
            <form onSubmit={onSaveParameters} className="form-grid budget-assumptions-grid">
              <div className="budget-parameters-tabs" role="tablist" aria-label="Parameter groups">
                <button
                  type="button"
                  role="tab"
                  aria-selected={parametersTab === 'load'}
                  className={parametersTab === 'load' ? 'primary' : 'ghost'}
                  onClick={() => setParametersTab('load')}
                >
                  Load
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={parametersTab === 'pricing'}
                  className={parametersTab === 'pricing' ? 'primary' : 'ghost'}
                  onClick={() => setParametersTab('pricing')}
                >
                  Pricing
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={parametersTab === 'estimates'}
                  className={parametersTab === 'estimates' ? 'primary' : 'ghost'}
                  onClick={() => setParametersTab('estimates')}
                >
                  Estimates
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={parametersTab === 'currencies'}
                  className={parametersTab === 'currencies' ? 'primary' : 'ghost'}
                  onClick={() => setParametersTab('currencies')}
                >
                  Currencies
                </button>
              </div>
              {parametersTab === 'load' && (
                <div className="budget-assumptions-row budget-assumptions-row--load">
                  {['full_load_size', 'crew_on_load_count', 'confirm_load_count', 'full_load_count'].map(
                    renderNumericParameterField
                  )}
                </div>
              )}
              {parametersTab === 'pricing' && (
                <div className="budget-pricing-tab">
                  <div className="budget-currencies-grid">
                    {['target_markup_percent', 'optional_tip_percent', 'cost_drift_percent'].map(
                      renderNumericParameterField
                    )}
                  </div>
                  <div className="budget-currencies-grid">
                    <label className="form-field">
                      <span>Event Registration</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={eventRegistrationTotal}
                        onChange={(e) => setEventRegistrationTotal(e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span>Event Currency</span>
                      <select
                        value={
                          orderedSelectedCurrencies.includes(eventCurrencyInput)
                            ? eventCurrencyInput
                            : pendingBaseCurrency
                        }
                        onChange={(e) => setEventCurrencyInput(e.target.value)}
                      >
                        {orderedSelectedCurrencies.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}
              {parametersTab === 'currencies' && (
                <div className="budget-currencies-grid">
                  <div className="budget-display-currency">
                    <label className="form-field">
                      <span>Base Currency</span>
                      <select
                        value={pendingBaseCurrency}
                        onChange={(e) => {
                          const nextBase = e.target.value;
                          setPendingBaseCurrency(nextBase);
                          if (!selectedCurrencies.includes(nextBase)) {
                            setSelectedCurrencies((prev) => [...prev, nextBase]);
                          }
                          if (!selectedCurrencies.includes(displayCurrency)) {
                            setDisplayCurrency(nextBase);
                          }
                        }}
                      >
                        {orderedSelectedCurrencies.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="budget-display-currency">
                    <label className="form-field">
                      <span>Display Currency</span>
                      <select
                        value={effectiveDisplayCurrency}
                        onChange={(e) => setDisplayCurrency(e.target.value)}
                      >
                        {orderedSelectedCurrencies.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="form-field">
                    <span>Add Currency</span>
                    <input
                      list="budget-currency-options"
                      value={currencySearch}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setCurrencySearch(value);
                        if (ISO_CURRENCY_CODES.includes(value as (typeof ISO_CURRENCY_CODES)[number])) {
                          onAddCurrency(value);
                        }
                      }}
                      placeholder="Type or select ISO code, e.g. USD"
                    />
                    <datalist id="budget-currency-options">
                      {ISO_CURRENCY_CODES.map((code) => (
                        <option key={code} value={code} />
                      ))}
                    </datalist>
                  </label>
                  <div className="budget-currency-selected">
                    <span className="budget-currency-selected-label">Budget currencies:</span>
                    {orderedSelectedCurrencies.map((code) => (
                      <span className="budget-currency-chip" key={code} title={rateTooltip(code)}>
                        <span>{code}</span>
                        {code !== pendingBaseCurrency ? (
                          <button
                            type="button"
                            className="budget-currency-chip-remove"
                            aria-label={`Remove ${code}`}
                            onClick={() => onRemoveCurrency(code)}
                          >
                            ×
                          </button>
                        ) : (
                          <span className="budget-currency-chip-remove-placeholder" aria-hidden="true">
                            ×
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {parametersTab === 'estimates' && (
                <>
                  <div className="budget-estimates-list">
                    {ESTIMATE_PARAMETER_KEYS.map(renderEstimateParameterField)}
                    <label className="form-field">
                      <span>Budget method</span>
                      <select
                        value={budgetMethod}
                        onChange={(e) =>
                          setParameters((prev) => ({
                            ...prev,
                            [BUDGET_METHOD_KEY]: Number(e.target.value)
                          }))
                        }
                      >
                        <option value={BUDGET_METHOD_ESTIMATES}>Estimates</option>
                        <option value={BUDGET_METHOD_LINE_ITEMS}>Line Items</option>
                        <option value={BUDGET_METHOD_HYBRID}>Hybrid</option>
                      </select>
                    </label>
                  </div>
                  {budgetMethod === BUDGET_METHOD_HYBRID && (
                    <p className="muted budget-hybrid-help">
                      Hybrid uses line items on days where they exist, and falls back to estimates for days with no
                      line items.
                    </p>
                  )}
                </>
              )}
              <div className="form-actions">
                <button type="submit" className="primary" disabled={savingParameters}>
                  {savingParameters ? 'Saving…' : 'Save parameters'}
                </button>
              </div>
            </form>
            </>
            )}
          </article>

          <article className="card budget-line-items-card">
            <header
              className="card-header event-detail-section-header budget-cost-split-header"
              onClick={() => toggleSection('lineItems')}
            >
              <div className="event-detail-section-header-main">
                <button
                  className="ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('lineItems');
                  }}
                >
                  {openSections.lineItems ? '▾' : '▸'}
                </button>
                <h3 className="event-detail-section-title">Line Items</h3>
              </div>
              {openSections.lineItems && (
                <div className="budget-cost-split-controls">
                  <div className="budget-cost-split-scenario-row">
                    <label className="form-field budget-cost-split-scenario-field">
                      <span>Scenario</span>
                      <select
                        value={lineItemsScenario}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setLineItemsScenario(e.target.value as LabelScenarioKey)}
                      >
                        <option value="confirm">Confirm</option>
                        <option value="worst">Worst</option>
                        <option value="full">Full</option>
                      </select>
                    </label>
                  </div>
                  <div className="budget-cost-split-scenario-row">
                    <div className="budget-parameters-tabs" role="tablist" aria-label="Line item section filters">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={lineItemsSectionFilter === 'all'}
                        className={lineItemsSectionFilter === 'all' ? 'primary' : 'ghost'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLineItemsSectionFilter('all');
                        }}
                      >
                        All
                      </button>
                      {lineItemsSectionOptions.map((section) => (
                        <button
                          key={section.id}
                          type="button"
                          role="tab"
                          aria-selected={lineItemsSectionFilter === section.id}
                          className={lineItemsSectionFilter === section.id ? 'primary' : 'ghost'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLineItemsSectionFilter(section.id);
                          }}
                        >
                          {section.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </header>
            {openSections.lineItems && (
            <>
            {addingLineItem ? (
            <form id="add-line-item-form" onSubmit={onAddLineItem} className="form-grid budget-lineitem-form">
              <label className="form-field">
                <span>Section</span>
                <select
                  value={newLineItem.section_id}
                  onChange={(e) =>
                    setNewLineItem((prev) => ({ ...prev, section_id: e.target.value }))
                  }
                >
                  <option value="">Select section</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Item</span>
                <input
                  value={newLineItem.name}
                  onChange={(e) => setNewLineItem((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label className="form-field">
                <span>Date</span>
                <input
                  type="date"
                  value={newLineItem.service_date}
                  onChange={(e) =>
                    setNewLineItem((prev) => ({ ...prev, service_date: e.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Description</span>
                <input
                  value={newLineItem.description}
                  onChange={(e) =>
                    setNewLineItem((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Qty</span>
                <input
                  type="number"
                  step="1"
                  value={newLineItem.quantity}
                  onChange={(e) =>
                    setNewLineItem((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Unit Cost</span>
                <input
                  type="number"
                  step="1"
                  value={newLineItem.unit_cost}
                  onChange={(e) =>
                    setNewLineItem((prev) => ({ ...prev, unit_cost: e.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Currency</span>
                <select
                  value={newLineItem.cost_currency}
                  onChange={(e) =>
                    setNewLineItem((prev) => ({ ...prev, cost_currency: e.target.value }))
                  }
                >
                  {orderedSelectedCurrencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field budget-lineitem-notes">
                <span>Notes</span>
                <input
                  value={newLineItem.notes}
                  onChange={(e) => setNewLineItem((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </label>
            </form>
            ) : null}

            <div className="form-actions event-detail-top-margin">
              <button
                type={addingLineItem ? 'submit' : 'button'}
                form={addingLineItem ? 'add-line-item-form' : undefined}
                className="primary"
                disabled={savingLineItem}
                onClick={
                  addingLineItem
                    ? undefined
                    : () => {
                        setAddingLineItem(true);
                      }
                }
              >
                {savingLineItem ? 'Saving…' : addingLineItem ? (editingLineItemID ? 'Update' : 'Save') : 'Add'}
              </button>
              {addingLineItem ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={savingLineItem}
                  onClick={() => {
                    setAddingLineItem(false);
                    setEditingLineItemID(null);
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
            <div className="event-detail-spacer" />

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Section</th>
                    <th>Item</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit Cost</th>
                    <th>Line Total</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioLineItems.map((item, index) => {
                    const isActionsOpen = openLineItemActionsFor === item.id;
                    const canDelete = !isAutogeneratedLineItem(item);
                    const isAircraftItem = (item.section_code || '').trim().toLowerCase() === 'aircraft';
                    const hasInnhoppLink = isAircraftItem && typeof item.innhopp_id === 'number' && item.innhopp_id > 0;
                    return (
                      <Fragment key={item.id}>
                        <tr
                          onClick={() => setOpenLineItemActionsFor((prev) => (prev === item.id ? null : item.id))}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            {index + 1}
                            {warningMessageForNotes(item.notes) ? (
                              <sup
                                className="nav-user-warning budget-warning-sup"
                                title={warningMessageForNotes(item.notes) || undefined}
                                aria-label={warningMessageForNotes(item.notes) || undefined}
                              >
                                !
                              </sup>
                            ) : null}
                          </td>
                          <td>{item.section_name || item.section_code || '-'}</td>
                          <td>
                            {item.name}
                          </td>
                          <td>{formatLineItemDate(item.service_date)}</td>
                          <td>{item.description || '-'}</td>
                          <td>{formatQty(item.scenario_quantity)}</td>
                          <td>{formatMoneyNumber(item.unit_cost || 0)}</td>
                          <td>{formatMoneyNumber(item.scenario_line_total || 0)}</td>
                          <td>{item.cost_currency || baseCurrency}</td>
                        </tr>
                        {isActionsOpen ? (
                          <tr>
                            <td colSpan={9}>
                              <div className="form-actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditLineItem(item);
                                  }}
                                >
                                  Edit
                                </button>
                                {canDelete ? (
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void onDeleteLineItem(item.id);
                                    }}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                                {hasInnhoppLink ? (
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/events/${activeEventID}/innhopps/${item.innhopp_id}`);
                                    }}
                                  >
                                    Open innhopp details
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
            )}
          </article>
        </>
      ) : null}
    </section>
  );
};

export default EventBudgetPage;

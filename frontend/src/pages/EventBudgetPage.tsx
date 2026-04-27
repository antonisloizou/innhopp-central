import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
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
  updateBudgetCurrencies
} from '../api/budgets';
import { ISO_CURRENCY_CODES } from '../constants/currencies';
import { Event, Season, copyEvent, deleteEvent, listEvents, listSeasons, updateEvent } from '../api/events';
import EventGearMenu from '../components/EventGearMenu';
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
  aircraft_price_per_minute: 'Aircraft rate per min',
  aircraft_cruising_speed_kmh: 'Aircraft speed km/h',
  target_markup_percent: 'Target markup %',
  optional_tip_percent: 'Optional tip %',
  cost_drift_percent: 'Cost drift %'
};

type BudgetSectionKey =
  | 'overview'
  | 'parameters'
  | 'costRevenue'
  | 'profitability'
  | 'costSplit'
  | 'aircraftPerInnhopp'
  | 'lineItems';

const EventBudgetPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingParameters, setSavingParameters] = useState(false);
  const [savingLineItem, setSavingLineItem] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
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
  const [aircraftCurrency, setAircraftCurrency] = useState('EUR');
  const [displayCurrency, setDisplayCurrency] = useState('EUR');
  const [costSplitMode, setCostSplitMode] = useState<CostSplitMode>('amount');
  const [aircraftSplitMode, setAircraftSplitMode] = useState<CostSplitMode>('amount');
  const [curveHover, setCurveHover] = useState<{
    x: number;
    y: number;
    participants: number;
    margin: number;
  } | null>(null);
  const [openSections, setOpenSections] = useState<Record<BudgetSectionKey, boolean>>({
    overview: true,
    parameters: true,
    costRevenue: true,
    profitability: true,
    costSplit: true,
    aircraftPerInnhopp: true,
    lineItems: true
  });
  const [message, setMessage] = useState<string | null>(null);
  const [newLineItem, setNewLineItem] = useState({
    section_id: '',
    name: '',
    service_date: '',
    location_label: '',
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
  const formatBaseMoney = (amount: number, currencyCode?: string) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currencyCode || 'EUR',
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
        step="0.01"
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
        setAircraftCurrency('EUR');
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
      setAircraftCurrency(
        currenciesResp.aircraft_currency || evtBudget.aircraft_currency || currenciesResp.base_currency || 'EUR'
      );
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
        const [seasonResp, eventResp] = await Promise.all([listSeasons(), listEvents()]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
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
      setAircraftCurrency('EUR');
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

  const createBudget = async () => {
    if (!hasValidEventID) return;
    setCreating(true);
    setMessage(null);
    try {
      await createEventBudget(activeEventID, {
        name: 'Event budget',
        base_currency: 'EUR',
        aircraft_currency: 'EUR'
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
      const resolvedAircraftCurrency = aircraftCurrency || resolvedBaseCurrency;
      const payload = Array.from(
        new Set([resolvedBaseCurrency, resolvedAircraftCurrency, ...selectedCurrencies])
      );
      const updatedBudget = await updateBudget(budget.id, {
        base_currency: resolvedBaseCurrency,
        aircraft_currency: resolvedAircraftCurrency
      });
      const currenciesResp = await updateBudgetCurrencies(budget.id, payload);
      await updateBudgetAssumptions(budget.id, parameters);
      const nextCurrencies = currenciesResp.currencies?.length
        ? dedupeCurrencies(currenciesResp.currencies)
        : [resolvedBaseCurrency];
      setBudget(updatedBudget);
      setSelectedCurrencies(nextCurrencies);
      setLiveRates(currenciesResp.live_rates || {});
      setPendingBaseCurrency(currenciesResp.base_currency || updatedBudget.base_currency || resolvedBaseCurrency);
      setAircraftCurrency(
        currenciesResp.aircraft_currency || updatedBudget.aircraft_currency || resolvedAircraftCurrency
      );
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
    if (normalized === pendingBaseCurrency || normalized === aircraftCurrency) return;
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
      setMessage('Section and item name are required');
      return;
    }
    setSavingLineItem(true);
    setMessage(null);
    try {
      await createBudgetLineItem(budget.id, {
        section_id: Number(newLineItem.section_id),
        name: newLineItem.name.trim(),
        service_date: newLineItem.service_date || undefined,
        location_label: newLineItem.location_label || undefined,
        quantity: Number(newLineItem.quantity || '1'),
        unit_cost: Number(newLineItem.unit_cost || '0'),
        cost_currency: newLineItem.cost_currency || baseCurrency,
        notes: newLineItem.notes || undefined
      });
      setNewLineItem((prev) => ({
        ...prev,
        name: '',
        service_date: '',
        location_label: '',
        quantity: '1',
        unit_cost: '',
        cost_currency: baseCurrency,
        notes: ''
      }));
      await loadBudgetData(activeEventID);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to add line item');
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
  const costSplit = useMemo(() => buildCostSplit(summary, costSplitMode), [summary, costSplitMode]);
  const marginCurve = useMemo(() => buildMarginCurveModel(summary), [summary]);
  const worstCaseGreen = useMemo(() => isWorstCaseGreen(summary), [summary]);
  const innhoppsByID = useMemo(
    () => new Map((activeEventData?.innhopps || []).map((innhopp) => [innhopp.id, innhopp])),
    [activeEventData?.innhopps]
  );
  const aircraftPerInnhoppRows = useMemo(() => {
    return lineItems
      .filter(
        (item): item is BudgetLineItem & { innhopp_id: number } =>
          (item.section_code || '').trim().toLowerCase() === 'aircraft' &&
          typeof item.innhopp_id === 'number' &&
          item.innhopp_id > 0
      )
      .map((item) => {
        const innhopp = innhoppsByID.get(item.innhopp_id);
        const fallbackName = item.location_label || item.name || `Innhopp ${item.innhopp_id}`;
        const normalizedName = fallbackName.trim().replace(/^#\d+\s+/, '');
        const cleanName = normalizedName || `Innhopp ${item.innhopp_id}`;
        const label =
          innhopp?.sequence && innhopp.sequence > 0 ? `#${innhopp.sequence} ${cleanName}` : cleanName;
        return {
          key: item.id,
          label,
          sequence: innhopp?.sequence || Number.MAX_SAFE_INTEGER,
          sortOrder: item.sort_order || 0,
          minutes: Number(item.quantity || 0),
          unitCost: Number(item.unit_cost || 0),
          totalCost: Number(item.line_total || 0),
          displayTotalCost: convertAmountToDisplayCurrency(
            Number(item.line_total || 0),
            (item.cost_currency || aircraftCurrency).trim().toUpperCase() || aircraftCurrency
          ),
          costCurrency: (item.cost_currency || aircraftCurrency).trim().toUpperCase() || aircraftCurrency
        };
      })
      .sort((a, b) => a.sequence - b.sequence || a.sortOrder - b.sortOrder || a.key - b.key);
  }, [lineItems, innhoppsByID, aircraftCurrency, baseCurrency, effectiveDisplayCurrency, liveRates]);
  const aircraftPerInnhoppSplit = useMemo(() => {
    const total = aircraftPerInnhoppRows.reduce((acc, row) => acc + row.displayTotalCost, 0);
    const max = aircraftPerInnhoppRows.reduce((acc, row) => Math.max(acc, row.displayTotalCost), 0);
    return aircraftPerInnhoppRows.map((row) => {
      const percentage = total > 0 ? (row.displayTotalCost / total) * 100 : 0;
      return {
        ...row,
        percentage,
        barPct: max > 0 ? (row.displayTotalCost / max) * 100 : 0,
        displayValue: aircraftSplitMode === 'percentage' ? percentage : row.displayTotalCost
      };
    });
  }, [aircraftPerInnhoppRows, aircraftSplitMode]);
  const worstCaseParticipants = summary?.scenarios?.worst_case_gate?.participants || 0;
  const costPerParticipant =
    worstCaseParticipants > 0 ? (summary?.cost_with_drift || 0) / worstCaseParticipants : 0;
  const tipPercent =
    parameters.optional_tip_percent ??
    summary?.parameters?.optional_tip_percent ??
    summary?.assumptions?.optional_tip_percent ??
    0;
  const tipPerParticipant = (summary?.revenue_per_participant || 0) * (tipPercent / 100);
  const targetRegistrationPerParticipant =
    worstCaseParticipants > 0 ? (summary?.target_revenue || 0) / worstCaseParticipants : 0;
  const toggleSection = (key: BudgetSectionKey) =>
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const handleCurveMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (!marginCurve) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const localX = ((event.clientX - rect.left) / rect.width) * marginCurve.chartWidth;
    const localY = ((event.clientY - rect.top) / rect.height) * marginCurve.chartHeight;
    const x = clamp(localX, marginCurve.plotLeft, marginCurve.plotRight);
    const y = clamp(localY, marginCurve.plotTop, marginCurve.plotBottom);
    const xRatio = (x - marginCurve.plotLeft) / (marginCurve.plotRight - marginCurve.plotLeft || 1);
    const yRatio = (y - marginCurve.plotTop) / (marginCurve.plotBottom - marginCurve.plotTop || 1);
    const participants = marginCurve.xMin + xRatio * (marginCurve.xMax - marginCurve.xMin);
    const margin = marginCurve.axisMax - yRatio * (marginCurve.axisMax - marginCurve.axisMin);
    setCurveHover({ x, y, participants, margin });
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
                <span className="field-label budget-kpi-section-title">Expected Cost</span>
                <strong>{formatMoney(summary.expected_cost || 0)}</strong>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">Cost with Drift</span>
                <strong>{formatMoney(summary.cost_with_drift || 0)}</strong>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">Target Revenue</span>
                <strong>{formatMoney(summary.target_revenue || 0)}</strong>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">Per Participant</span>
                <div className="budget-kpi-split">
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Cost</span>
                    <strong>{formatMoney(costPerParticipant)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Revenue</span>
                    <strong>{formatMoney(summary.revenue_per_participant || 0)}</strong>
                  </div>
                  <div className="budget-kpi-split-item">
                    <span className="field-label">Tip</span>
                    <strong>{formatMoney(tipPerParticipant)}</strong>
                  </div>
                </div>
                <span className="field-label budget-kpi-section-subtitle budget-kpi-inline-label">
                  Target Registration
                </span>
                <div className="budget-kpi-single-row">
                  <strong>{formatMoney(targetRegistrationPerParticipant)}</strong>
                </div>
              </div>
              <div className="budget-kpi-card budget-kpi-card-scenario">
                <span className="field-label budget-kpi-section-title">Revenue</span>
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
                        <div
                          className="budget-bar budget-bar-green"
                          style={{ width: `${entry.revenuePct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="budget-bar-values muted">
                    <span>Cost: {formatMoney(entry.costWithDrift || 0)}</span>
                    <span>Revenue: {formatMoney(entry.revenue || 0)}</span>
                  </div>
                  <div className="budget-bar-values">
                    <span className="muted">
                      Margin: {formatMoney(entry.marginWithoutTip || 0)}
                    </span>
                    <span className={`badge ${entry.status === 'green' ? 'success' : 'danger'}`}>
                      {entry.status === 'green' ? 'Green' : 'Red'}
                    </span>
                  </div>
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
                <svg
                  className="budget-curve-chart"
                  viewBox={`0 0 ${marginCurve.chartWidth} ${marginCurve.chartHeight}`}
                  role="img"
                  aria-label="Margin across participants"
                  onMouseMove={handleCurveMouseMove}
                  onMouseLeave={clearCurveHover}
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
                  {marginCurve.markers.map((marker) => (
                    <g key={marker.key}>
                      <circle
                        cx={marker.x}
                        cy={marker.y}
                        r="5"
                        className={
                          marker.status === 'green'
                            ? 'budget-curve-marker budget-curve-marker-green'
                            : 'budget-curve-marker budget-curve-marker-red'
                        }
                      />
                      <text
                        x={marker.x}
                        y={marker.y - 21}
                        className="budget-curve-label"
                        textAnchor="middle"
                      >
                        <tspan x={marker.x} dy="0">
                          {marker.label}
                        </tspan>
                        <tspan x={marker.x} dy="1.2em">
                          ({formatMoney(marker.margin)})
                        </tspan>
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            ) : (
              <p className="muted">No curve data available yet.</p>
            )}
            </>
            )}
          </article>

          <article className="card budget-aircraft-per-innhopp-card">
            <header
              className="card-header event-detail-section-header budget-cost-split-header"
              onClick={() => toggleSection('aircraftPerInnhopp')}
            >
              <div className="event-detail-section-header-main">
                <button
                  className="ghost"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('aircraftPerInnhopp');
                  }}
                >
                  {openSections.aircraftPerInnhopp ? '▾' : '▸'}
                </button>
                <h3 className="event-detail-section-title">Aircraft cost per Innhopp</h3>
              </div>
              <div className="budget-toggle-group">
                <button
                  type="button"
                  className={aircraftSplitMode === 'amount' ? 'primary' : 'ghost'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAircraftSplitMode('amount');
                  }}
                >
                  Amount
                </button>
                <button
                  type="button"
                  className={aircraftSplitMode === 'percentage' ? 'primary' : 'ghost'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAircraftSplitMode('percentage');
                  }}
                >
                  Percentage
                </button>
              </div>
            </header>
            {openSections.aircraftPerInnhopp && aircraftPerInnhoppSplit.length > 0 ? (
              <div className="budget-cost-split-list">
                {aircraftPerInnhoppSplit.map((row) => (
                  <div className="budget-cost-split-item" key={row.key}>
                    <div className="budget-cost-split-top">
                      <span className="field-label">{row.label}</span>
                      <span className="muted">
                        {aircraftSplitMode === 'amount'
                          ? formatBaseMoney(row.displayValue, effectiveDisplayCurrency)
                          : `${row.displayValue.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="budget-bar-track">
                      <div className="budget-bar budget-bar-blue" style={{ width: `${row.barPct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : openSections.aircraftPerInnhopp ? (
              <p className="muted">No innhopps available for aircraft calculation yet.</p>
            ) : null}
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
              <div className="budget-toggle-group">
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
              </div>
            </header>
            {openSections.costSplit && (
            <div className="budget-cost-split-list">
              {costSplit.map((section) => (
                <div className="budget-cost-split-item" key={section.key}>
                  <div className="budget-cost-split-top">
                    <span className="field-label">{section.label}</span>
                    <span className="muted">
                      {costSplitMode === 'amount'
                        ? formatMoney(section.displayValue)
                        : `${section.displayValue.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="budget-bar-track">
                    <div className="budget-bar budget-bar-blue" style={{ width: `${section.barPct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            )}
          </article>

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
              <div className="budget-assumptions-row">
                {['full_load_size', 'crew_on_load_count', 'confirm_load_count', 'full_load_count'].map(
                  renderNumericParameterField
                )}
              </div>
              <div className="budget-assumptions-row">
                {renderNumericParameterField('aircraft_price_per_minute')}
                <label className="form-field">
                  <span>Aircraft currency</span>
                  <select
                    value={aircraftCurrency}
                    onChange={(e) => setAircraftCurrency(e.target.value)}
                  >
                    {orderedSelectedCurrencies.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                {renderNumericParameterField('aircraft_cruising_speed_kmh')}
              </div>
              <div className="budget-assumptions-row">
                {['target_markup_percent', 'optional_tip_percent', 'cost_drift_percent'].map(
                  renderNumericParameterField
                )}
              </div>
              <div className="budget-currencies-grid">
                <label className="form-field">
                  <span>Event Registration</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={eventRegistrationTotal}
                    onChange={(e) => setEventRegistrationTotal(e.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Event Currency</span>
                  <input
                    value={eventCurrencyInput}
                    maxLength={3}
                    onChange={(e) => setEventCurrencyInput(e.target.value.toUpperCase())}
                  />
                </label>
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
                      {code !== pendingBaseCurrency && code !== aircraftCurrency ? (
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
              className="card-header event-detail-section-header"
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
            </header>
            {openSections.lineItems && (
            <>
            <form onSubmit={onAddLineItem} className="form-grid budget-lineitem-form">
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
                <span>Location</span>
                <input
                  value={newLineItem.location_label}
                  onChange={(e) =>
                    setNewLineItem((prev) => ({ ...prev, location_label: e.target.value }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Qty</span>
                <input
                  type="number"
                  step="0.01"
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
                  step="0.01"
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
              <div className="form-actions">
                <button type="submit" className="primary" disabled={savingLineItem}>
                  {savingLineItem ? 'Adding…' : 'Add line item'}
                </button>
              </div>
            </form>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Item</th>
                    <th>Date</th>
                    <th>Location</th>
                    <th>Qty</th>
                    <th>Unit Cost</th>
                    <th>Currency</th>
                    <th>Line Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.section_name || item.section_code || '-'}</td>
                      <td>{item.name}</td>
                      <td>{item.service_date ? item.service_date.slice(0, 10) : '-'}</td>
                      <td>{item.location_label || '-'}</td>
                      <td>{item.quantity}</td>
                      <td>{formatBaseMoney(item.unit_cost || 0, item.cost_currency || baseCurrency)}</td>
                      <td>{item.cost_currency || baseCurrency}</td>
                      <td>{formatBaseMoney(item.line_total || 0, item.cost_currency || baseCurrency)}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void onDeleteLineItem(item.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
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

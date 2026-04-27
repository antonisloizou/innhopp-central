import { apiRequest } from './client';

export type Budget = {
  id: number;
  event_id: number;
  name: string;
  base_currency: string;
  aircraft_currency: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type BudgetSection = {
  id: number;
  budget_id: number;
  code: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type BudgetLineItem = {
  id: number;
  budget_id: number;
  section_id: number;
  innhopp_id?: number | null;
  section_code?: string;
  section_name?: string;
  name: string;
  service_date?: string | null;
  location_label?: string;
  quantity: number;
  unit_cost: number;
  cost_currency: string;
  line_total: number;
  sort_order: number;
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type ScenarioSummary = {
  name: string;
  participants: number;
  expected_cost: number;
  cost_with_drift: number;
  revenue: number;
  revenue_with_tip: number;
  margin_without_tip: number;
  margin_with_tip: number;
  status: 'green' | 'red';
};

export type MarginPoint = {
  participants: number;
  revenue: number;
  cost: number;
  margin: number;
};

export type BudgetSummary = {
  budget: Budget;
  parameters?: Record<string, number>;
  assumptions: Record<string, number>;
  deposit_amount: number;
  main_invoice_amount: number;
  revenue_per_participant: number;
  section_totals: Array<{
    section_id: number;
    code: string;
    name: string;
    total: number;
    manual_total?: number;
    derived_total?: number;
    air_minutes?: number;
    air_distance_km?: number;
  }>;
  expected_cost: number;
  drift_amount: number;
  cost_with_drift: number;
  markup_amount: number;
  target_revenue: number;
  optional_tip_amount: number;
  revenue_with_tip: number;
  live_fx_rates?: Record<string, number>;
  scenarios: Record<string, ScenarioSummary>;
  margin_curve: MarginPoint[];
};

export type BudgetCurrenciesResponse = {
  base_currency: string;
  aircraft_currency?: string;
  currencies: string[];
  live_rates?: Record<string, number>;
};

export const getEventBudget = (eventId: number) => apiRequest<Budget>(`/budgets/events/${eventId}`);

export const createEventBudget = (
  eventId: number,
  payload: { name?: string; base_currency?: string; aircraft_currency?: string; notes?: string }
) =>
  apiRequest<Budget>(`/budgets/events/${eventId}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getBudget = (budgetId: number) => apiRequest<Budget>(`/budgets/${budgetId}`);
export const updateBudget = (
  budgetId: number,
  payload: {
    name?: string;
    base_currency?: string;
    aircraft_currency?: string;
    status?: string;
    notes?: string;
  }
) =>
  apiRequest<Budget>(`/budgets/${budgetId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const listBudgetSections = (budgetId: number) =>
  apiRequest<BudgetSection[]>(`/budgets/${budgetId}/sections`);

export const listBudgetLineItems = (budgetId: number) =>
  apiRequest<BudgetLineItem[]>(`/budgets/${budgetId}/line-items`);

export const createBudgetLineItem = (
  budgetId: number,
  payload: {
    section_id: number;
    innhopp_id?: number;
    name: string;
    service_date?: string;
    location_label?: string;
    quantity?: number;
    unit_cost?: number;
    cost_currency?: string;
    sort_order?: number;
    notes?: string;
  }
) =>
  apiRequest<BudgetLineItem>(`/budgets/${budgetId}/line-items`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateBudgetLineItem = (
  budgetId: number,
  lineItemId: number,
  payload: {
    section_id: number;
    innhopp_id?: number;
    name: string;
    service_date?: string;
    location_label?: string;
    quantity?: number;
    unit_cost?: number;
    cost_currency?: string;
    sort_order?: number;
    notes?: string;
  }
) =>
  apiRequest<BudgetLineItem>(`/budgets/${budgetId}/line-items/${lineItemId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteBudgetLineItem = (budgetId: number, lineItemId: number) =>
  apiRequest<{ ok: boolean }>(`/budgets/${budgetId}/line-items/${lineItemId}`, { method: 'DELETE' });

export const getBudgetAssumptions = (budgetId: number) =>
  apiRequest<{ values: Record<string, number>; parameters?: Record<string, number> }>(
    `/budgets/${budgetId}/assumptions`
  );

export const updateBudgetAssumptions = (budgetId: number, values: Record<string, number>) =>
  apiRequest<{ values: Record<string, number>; parameters?: Record<string, number> }>(
    `/budgets/${budgetId}/assumptions`,
    {
    method: 'PUT',
    body: JSON.stringify({ values })
    }
  );

export const getBudgetCurrencies = (budgetId: number) =>
  apiRequest<BudgetCurrenciesResponse>(`/budgets/${budgetId}/currencies`);

export const updateBudgetCurrencies = (budgetId: number, currencies: string[]) =>
  apiRequest<BudgetCurrenciesResponse>(`/budgets/${budgetId}/currencies`, {
    method: 'PUT',
    body: JSON.stringify({ currencies })
  });

export const previewBudgetCurrencyRates = (
  budgetId: number,
  payload: { base_currency: string; currencies: string[] }
) =>
  apiRequest<BudgetCurrenciesResponse>(`/budgets/${budgetId}/currencies/preview-rates`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getBudgetSummary = (budgetId: number) =>
  apiRequest<BudgetSummary>(`/budgets/${budgetId}/summary`);

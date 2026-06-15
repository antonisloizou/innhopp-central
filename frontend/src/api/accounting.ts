import { apiRequest } from './client';

export type ScheduleItemCostStatus =
  | 'expected'
  | 'committed'
  | 'invoiced'
  | 'partially_paid'
  | 'paid'
  | 'cancelled'
  | 'disputed';

export type AccountingDocumentType = 'invoice' | 'credit_note' | 'adjustment';
export type AccountingDocumentStatus = 'draft' | 'posted' | 'voided';
export type AccountingEntryType = 'cost' | 'credit' | 'adjustment';
export type PaymentMethod = 'bank_transfer' | 'card' | 'cash' | 'other';

export type ScheduleItemCost = {
  id: number;
  event_id: number;
  schedule_item_type?: string | null;
  schedule_item_id: number;
  budget_line_item_id?: number | null;
  vendor_id?: number | null;
  name: string;
  category?: string | null;
  owner?: string | null;
  estimated_amount: number;
  currency: string;
  status: ScheduleItemCostStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleItemCostSuggestion = {
  name: string;
  estimated_amount: number;
  currency: string;
  description?: string | null;
};

export type ScheduleItemCostsResponse = {
  costs: ScheduleItemCost[];
  suggested_expected?: ScheduleItemCostSuggestion | null;
};

export type AccountingDocument = {
  id: number;
  event_id: number;
  vendor_id?: number | null;
  doc_type: AccountingDocumentType;
  status: AccountingDocumentStatus;
  document_number?: string | null;
  document_date?: string | null;
  due_date?: string | null;
  currency: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountingEntry = {
  id: number;
  document_id: number;
  event_id: number;
  schedule_item_cost_id?: number | null;
  budget_line_item_id?: number | null;
  entry_type: AccountingEntryType;
  amount: number;
  currency: string;
  posted_at?: string | null;
  description?: string | null;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: number;
  event_id: number;
  vendor_id?: number | null;
  method: PaymentMethod;
  amount: number;
  currency: string;
  paid_at?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentAllocation = {
  id: number;
  payment_id: number;
  accounting_entry_id?: number | null;
  schedule_item_cost_id?: number | null;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type BudgetActualsLine = {
  schedule_item_cost_id: number;
  schedule_item_type?: string | null;
  schedule_item_id?: number | null;
  budget_line_item_id?: number | null;
  section_id?: number | null;
  section_code?: string | null;
  section_name?: string | null;
  name: string;
  status: ScheduleItemCostStatus;
  currency: string;
  planned_amount: number;
  invoiced_amount: number;
  paid_amount: number;
  open_invoice_amount: number;
  estimate_to_invoice_variance_amount: number;
  invoice_to_paid_variance_amount: number;
  variance_vs_budget: number;
  variance_percent: number;
  invoiced_variance_vs_budget: number;
  paid_variance_vs_budget: number;
};

export type BudgetActualsTotals = {
  planned_amount: number;
  invoiced_amount: number;
  paid_amount: number;
  open_invoice_amount: number;
  estimate_to_invoice_variance_amount: number;
  invoice_to_paid_variance_amount: number;
  variance_vs_budget: number;
  invoiced_variance_vs_budget: number;
  paid_variance_vs_budget: number;
};

export type BudgetActualsSectionTotal = {
  section_id?: number | null;
  section_code?: string | null;
  section_name?: string | null;
  planned_amount: number;
  invoiced_amount: number;
  paid_amount: number;
  open_invoice_amount: number;
  variance_vs_budget: number;
};

export type BudgetActualsReport = {
  event_id: number;
  currency: string;
  totals: BudgetActualsTotals;
  sections: BudgetActualsSectionTotal[];
  lines: BudgetActualsLine[];
};

export const listAccountingDocuments = (eventId: number) =>
  apiRequest<AccountingDocument[]>(`/accounting/events/${eventId}/documents`);

export const listScheduleItemCosts = (eventId: number, scheduleType: string, scheduleId: number) =>
  apiRequest<ScheduleItemCostsResponse>(`/accounting/events/${eventId}/schedule-costs/${scheduleType}/${scheduleId}`);

export const createScheduleItemCost = (
  eventId: number,
  scheduleType: string,
  scheduleId: number,
  payload: {
    name?: string;
    category?: string;
    owner?: string;
    estimated_amount: number;
    currency?: string;
    status?: ScheduleItemCostStatus;
    notes?: string;
  }
) =>
  apiRequest<ScheduleItemCost>(`/accounting/events/${eventId}/schedule-costs/${scheduleType}/${scheduleId}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateScheduleItemCost = (
  eventId: number,
  costId: number,
  payload: {
    name?: string;
    category?: string;
    owner?: string;
    estimated_amount: number;
    currency?: string;
    status?: ScheduleItemCostStatus;
    notes?: string;
  }
) =>
  apiRequest<ScheduleItemCost>(`/accounting/events/${eventId}/schedule-costs/${costId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteScheduleItemCost = (eventId: number, costId: number) =>
  apiRequest<{ ok: boolean }>(`/accounting/events/${eventId}/schedule-costs/${costId}`, {
    method: 'DELETE'
  });

export const createAccountingDocument = (
  eventId: number,
  payload: {
    vendor_id?: number;
    doc_type: AccountingDocumentType;
    status?: AccountingDocumentStatus;
    document_number?: string;
    document_date?: string;
    due_date?: string;
    currency: string;
    notes?: string;
  }
) =>
  apiRequest<AccountingDocument>(`/accounting/events/${eventId}/documents`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateAccountingDocument = (
  docId: number,
  payload: {
    vendor_id?: number;
    doc_type: AccountingDocumentType;
    status: AccountingDocumentStatus;
    document_number?: string;
    document_date?: string;
    due_date?: string;
    currency: string;
    notes?: string;
  }
) =>
  apiRequest<AccountingDocument>(`/accounting/documents/${docId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const createAccountingDocumentEntry = (
  docId: number,
  payload: {
    schedule_item_cost_id?: number;
    budget_line_item_id?: number;
    entry_type: AccountingEntryType;
    amount: number;
    currency: string;
    posted_at?: string;
    description?: string;
  }
) =>
  apiRequest<AccountingEntry>(`/accounting/documents/${docId}/entries`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateAccountingEntry = (
  entryId: number,
  payload: {
    document_id?: number;
    schedule_item_cost_id?: number;
    budget_line_item_id?: number;
    entry_type: AccountingEntryType;
    amount: number;
    currency: string;
    posted_at?: string;
    description?: string;
  }
) =>
  apiRequest<AccountingEntry>(`/accounting/entries/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deleteAccountingEntry = (entryId: number) =>
  apiRequest<{ ok: boolean }>(`/accounting/entries/${entryId}`, {
    method: 'DELETE'
  });

export const listAccountingEntries = (eventId: number) =>
  apiRequest<AccountingEntry[]>(`/accounting/events/${eventId}/entries`);

export const createPayment = (
  eventId: number,
  payload: {
    vendor_id?: number;
    method: PaymentMethod;
    amount: number;
    currency: string;
    paid_at?: string;
    reference?: string;
    notes?: string;
  }
) =>
  apiRequest<Payment>(`/accounting/events/${eventId}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updatePayment = (
  paymentId: number,
  payload: {
    vendor_id?: number;
    method: PaymentMethod;
    amount: number;
    currency: string;
    paid_at?: string;
    reference?: string;
    notes?: string;
  }
) =>
  apiRequest<Payment>(`/accounting/payments/${paymentId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const deletePayment = (paymentId: number) =>
  apiRequest<{ ok: boolean }>(`/accounting/payments/${paymentId}`, {
    method: 'DELETE'
  });

export const listPayments = (eventId: number) =>
  apiRequest<Payment[]>(`/accounting/events/${eventId}/payments`);

export const listPaymentAllocations = (eventId: number) =>
  apiRequest<PaymentAllocation[]>(`/accounting/events/${eventId}/allocations`);

export const createPaymentAllocation = (
  paymentId: number,
  payload: {
    accounting_entry_id?: number;
    schedule_item_cost_id?: number;
    amount: number;
    currency: string;
  }
) =>
  apiRequest<PaymentAllocation>(`/accounting/payments/${paymentId}/allocations`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const deletePaymentAllocation = (allocationId: number) =>
  apiRequest<{ ok: boolean }>(`/accounting/allocations/${allocationId}`, {
    method: 'DELETE'
  });

export const getBudgetActuals = (eventId: number) =>
  apiRequest<BudgetActualsReport>(`/accounting/events/${eventId}/budget-actuals`);

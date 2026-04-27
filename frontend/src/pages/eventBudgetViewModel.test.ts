import { describe, expect, it } from 'vitest';

import { BudgetSummary } from '../api/budgets';
import {
  buildCostSplit,
  buildScenarioBars,
  hasFalseSafetyWarning,
  isSubmitForReviewDisabled,
  isWorstCaseGreen
} from './eventBudgetViewModel';

const makeSummary = (overrides?: Partial<BudgetSummary>): BudgetSummary => ({
  budget: {
    id: 1,
    event_id: 1,
    name: 'Event budget',
    base_currency: 'EUR',
    aircraft_currency: 'EUR',
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  assumptions: {},
  parameters: {},
  deposit_amount: 100,
  main_invoice_amount: 200,
  revenue_per_participant: 300,
  section_totals: [
    { section_id: 1, code: 'aircraft', name: 'Aircraft', total: 500 },
    { section_id: 2, code: 'food', name: 'Food', total: 300 }
  ],
  expected_cost: 800,
  drift_amount: 24,
  cost_with_drift: 824,
  markup_amount: 164.8,
  target_revenue: 988.8,
  optional_tip_amount: 79.1,
  revenue_with_tip: 1067.9,
  live_fx_rates: { EUR: 1, USD: 1.08 },
  scenarios: {
    confirm_case: {
      name: 'Confirm',
      participants: 12,
      expected_cost: 800,
      cost_with_drift: 824,
      revenue: 3600,
      revenue_with_tip: 3888,
      margin_without_tip: 2776,
      margin_with_tip: 3064,
      status: 'green'
    },
    worst_case_gate: {
      name: 'Worst Case',
      participants: 13,
      expected_cost: 800,
      cost_with_drift: 824,
      revenue: 3900,
      revenue_with_tip: 4212,
      margin_without_tip: 3076,
      margin_with_tip: 3388,
      status: 'green'
    },
    planned_capacity_case: {
      name: 'Planned',
      participants: 24,
      expected_cost: 800,
      cost_with_drift: 824,
      revenue: 7200,
      revenue_with_tip: 7776,
      margin_without_tip: 6376,
      margin_with_tip: 6952,
      status: 'green'
    }
  },
  margin_curve: [
    { participants: 12, revenue: 3600, cost: 824, margin: 2776 },
    { participants: 13, revenue: 3900, cost: 824, margin: 3076 },
    { participants: 24, revenue: 7200, cost: 824, margin: 6376 }
  ],
  ...overrides
});

describe('eventBudgetViewModel', () => {
  it('rebuilds chart data when costs change', () => {
    const first = makeSummary({ section_totals: [{ section_id: 1, code: 'aircraft', name: 'Aircraft', total: 1000 }] });
    const second = makeSummary({ section_totals: [{ section_id: 1, code: 'aircraft', name: 'Aircraft', total: 400 }] });

    const firstSplit = buildCostSplit(first, 'amount');
    const secondSplit = buildCostSplit(second, 'amount');

    expect(firstSplit[0].displayValue).toBe(1000);
    expect(secondSplit[0].displayValue).toBe(400);
  });

  it('switches red/green gate and disables submit when worst case turns negative', () => {
    const redWorst = makeSummary({
      scenarios: {
        ...makeSummary().scenarios,
        worst_case_gate: {
          ...makeSummary().scenarios.worst_case_gate,
          margin_without_tip: -50,
          status: 'red'
        }
      }
    });

    expect(isWorstCaseGreen(redWorst)).toBe(false);
    expect(hasFalseSafetyWarning(redWorst)).toBe(true);
    expect(isSubmitForReviewDisabled('draft', redWorst, false)).toBe(true);
  });

  it('keeps optional tip separate from base scenario revenue', () => {
    const summary = makeSummary({
      scenarios: {
        ...makeSummary().scenarios,
        confirm_case: {
          ...makeSummary().scenarios.confirm_case,
          revenue: 3000,
          revenue_with_tip: 3240
        }
      }
    });

    const bars = buildScenarioBars(summary);
    const confirm = bars.find((entry) => entry.key === 'confirm_case');
    expect(confirm?.revenue).toBe(3000);
    expect(summary.scenarios.confirm_case.revenue_with_tip).toBe(3240);
  });
});

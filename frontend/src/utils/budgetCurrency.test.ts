import { describe, expect, it } from 'vitest';

import type { BudgetLineItem } from '../api/budgets';
import {
  collectBudgetCurrencyCodes,
  convertAmountViaBaseCurrency,
  mergeCurrencyRates,
  normalizeBudgetCurrency
} from './budgetCurrency';

describe('budgetCurrency', () => {
  it('normalizes ISO currency codes', () => {
    expect(normalizeBudgetCurrency(' nok ')).toBe('NOK');
    expect(normalizeBudgetCurrency('', 'EUR')).toBe('EUR');
  });

  it('converts amounts through the base currency', () => {
    const rates = { EUR: 1, NOK: 10, USD: 1.2 };

    expect(
      convertAmountViaBaseCurrency({
        amount: 1000,
        sourceCurrency: 'NOK',
        baseCurrency: 'EUR',
        targetCurrency: 'EUR',
        rates
      })
    ).toBe(100);

    expect(
      convertAmountViaBaseCurrency({
        amount: 1000,
        sourceCurrency: 'NOK',
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rates
      })
    ).toBe(120);
  });

  it('merges and normalizes rate maps', () => {
    expect(mergeCurrencyRates({ nok: 10 }, { USD: 1.2 })).toEqual({ NOK: 10, USD: 1.2 });
  });

  it('collects selected and source currencies needed for budget conversion', () => {
    const lineItems = [
      { cost_currency: 'NOK' },
      { cost_currency: 'usd' }
    ] as BudgetLineItem[];

    expect(
      collectBudgetCurrencyCodes({
        baseCurrency: 'EUR',
        selectedCurrencies: ['EUR', 'CHF'],
        lineItems,
        estimateCurrencies: { estimate_transport_per_day: 'SEK' },
        eventCurrency: 'GBP'
      })
    ).toEqual(['EUR', 'CHF', 'NOK', 'USD', 'SEK', 'GBP']);
  });
});

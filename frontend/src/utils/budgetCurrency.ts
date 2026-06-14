import { BudgetLineItem } from '../api/budgets';

export const normalizeBudgetCurrency = (currency: string | null | undefined, fallback = 'EUR') => {
  const normalized = String(currency || '')
    .trim()
    .toUpperCase();
  if (normalized.length === 3) return normalized;
  return fallback.trim().toUpperCase() || 'EUR';
};

export const mergeCurrencyRates = (...rateSets: Array<Record<string, number> | null | undefined>) => {
  const merged: Record<string, number> = {};
  rateSets.forEach((rateSet) => {
    if (!rateSet) return;
    Object.entries(rateSet).forEach(([currency, rate]) => {
      const normalized = normalizeBudgetCurrency(currency, '');
      if (!normalized || !Number.isFinite(rate) || rate <= 0) return;
      merged[normalized] = rate;
    });
  });
  return merged;
};

export const convertAmountViaBaseCurrency = ({
  amount,
  sourceCurrency,
  baseCurrency,
  targetCurrency,
  rates
}: {
  amount: number;
  sourceCurrency: string;
  baseCurrency: string;
  targetCurrency: string;
  rates: Record<string, number>;
}) => {
  const base = normalizeBudgetCurrency(baseCurrency);
  const source = normalizeBudgetCurrency(sourceCurrency, base);
  const target = normalizeBudgetCurrency(targetCurrency, base);
  const safeAmount = Number(amount || 0);

  if (source === target) return safeAmount;

  const sourceRate = source === base ? 1 : rates[source] || 0;
  const targetRate = target === base ? 1 : rates[target] || 0;
  if (sourceRate <= 0 || targetRate <= 0) return safeAmount;

  const baseAmount = source === base ? safeAmount : safeAmount / sourceRate;
  return target === base ? baseAmount : baseAmount * targetRate;
};

export const collectBudgetCurrencyCodes = ({
  baseCurrency,
  selectedCurrencies,
  lineItems,
  estimateCurrencies,
  eventCurrency
}: {
  baseCurrency: string;
  selectedCurrencies: string[];
  lineItems?: BudgetLineItem[];
  estimateCurrencies?: Record<string, string>;
  eventCurrency?: string;
}) => {
  const seen = new Set<string>();
  const currencies: string[] = [];
  const push = (currency: string | null | undefined) => {
    const normalized = normalizeBudgetCurrency(currency, '');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    currencies.push(normalized);
  };

  push(baseCurrency);
  selectedCurrencies.forEach(push);
  lineItems?.forEach((item) => push(item.cost_currency));
  Object.values(estimateCurrencies || {}).forEach(push);
  push(eventCurrency);

  return currencies;
};

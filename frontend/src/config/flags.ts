const envValue = String(import.meta.env.VITE_BUDGETS_V1 ?? '').trim().toLowerCase();

export const budgetsV1Enabled = envValue !== 'false' && envValue !== '0' && envValue !== 'off';


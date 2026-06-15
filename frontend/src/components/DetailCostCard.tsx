import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ScheduleItemCost,
  ScheduleItemCostSuggestion,
  createScheduleItemCost,
  deleteScheduleItemCost,
  listScheduleItemCosts,
  updateScheduleItemCost
} from '../api/accounting';

type Props = {
  eventId: number;
  scheduleType: string;
  scheduleId: number;
  defaultName: string;
};

const formatMoney = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount || 0);

const visibleStatuses: Array<Extract<ScheduleItemCost['status'], 'expected' | 'invoiced' | 'paid'>> = [
  'expected',
  'invoiced',
  'paid'
];

const normalizeEditableStatus = (status?: ScheduleItemCost['status'] | null): ScheduleItemCost['status'] => {
  if (status === 'invoiced' || status === 'paid') return status;
  return 'expected';
};

const formatStatusLabel = (status: ScheduleItemCost['status']) =>
  status === 'expected' ? 'Expected' : status === 'invoiced' ? 'Invoiced' : status === 'paid' ? 'Paid' : status;

const shouldShowSuggestedExpectedInList = (scheduleType: string) => scheduleType.trim().toLowerCase() === 'innhopp';

const DetailCostCard = ({ eventId, scheduleType, scheduleId, defaultName }: Props) => {
  const [costs, setCosts] = useState<ScheduleItemCost[]>([]);
  const [suggestedExpectedCost, setSuggestedExpectedCost] = useState<ScheduleItemCostSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingCostId, setDeletingCostId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingCostId, setEditingCostId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [status, setStatus] = useState<ScheduleItemCost['status']>('expected');
  const [notes, setNotes] = useState('');

  const resetForm = useCallback((cost?: ScheduleItemCost | null) => {
    if (!cost) {
      setEditingCostId(null);
      setName(suggestedExpectedCost?.name || '');
      setAmount(
        suggestedExpectedCost && Number.isFinite(suggestedExpectedCost.estimated_amount)
          ? String(suggestedExpectedCost.estimated_amount)
          : ''
      );
      setCurrency(suggestedExpectedCost?.currency || 'EUR');
      setStatus('expected');
      setNotes('');
      return;
    }
    setEditingCostId(cost?.id ?? null);
    setName(cost?.name ?? '');
    setAmount(cost ? String(cost.estimated_amount ?? '') : '');
    setCurrency(cost?.currency || 'EUR');
    setStatus(normalizeEditableStatus(cost?.status));
    setNotes(cost?.notes || '');
  }, [suggestedExpectedCost]);

  const loadCosts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listScheduleItemCosts(eventId, scheduleType, scheduleId);
      const nextCosts = Array.isArray(response?.costs) ? response.costs : [];
      const nextSuggestion = response?.suggested_expected || null;
      setCosts(nextCosts);
      setSuggestedExpectedCost(nextSuggestion);
      if (nextCosts.length === 0) {
        setEditingCostId(null);
        setName(nextSuggestion?.name || '');
        setAmount(
          nextSuggestion && Number.isFinite(nextSuggestion.estimated_amount)
            ? String(nextSuggestion.estimated_amount)
            : ''
        );
        setCurrency(nextSuggestion?.currency || 'EUR');
        setStatus('expected');
        setNotes('');
      } else if (!editingCostId || !nextCosts.some((cost) => cost.id === editingCostId)) {
        resetForm(nextCosts[0]);
      }
    } catch (err) {
      const statusCode = (err as Error & { status?: number }).status;
      if (statusCode === 404) {
        setCosts([]);
        resetForm(null);
      } else {
        setMessage(err instanceof Error ? err.message : 'Failed to load costs');
      }
    } finally {
      setLoading(false);
    }
  }, [editingCostId, eventId, resetForm, scheduleId, scheduleType]);

  useEffect(() => {
    void loadCosts();
  }, [loadCosts]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setMessage('Estimated amount must be zero or positive.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editingCostId) {
        await updateScheduleItemCost(eventId, editingCostId, {
          name: name.trim() || defaultName,
          estimated_amount: numericAmount,
          currency: currency.trim() || 'EUR',
          status: normalizeEditableStatus(status),
          notes: notes.trim() || undefined
        });
      } else {
        await createScheduleItemCost(eventId, scheduleType, scheduleId, {
          name: name.trim() || defaultName,
          estimated_amount: numericAmount,
          currency: currency.trim() || 'EUR',
          status: normalizeEditableStatus(status),
          notes: notes.trim() || undefined
        });
      }
      setMessage('Cost saved.');
      await loadCosts();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save cost');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (costId: number) => {
    setDeletingCostId(costId);
    setMessage(null);
    try {
      await deleteScheduleItemCost(eventId, costId);
      setMessage('Cost deleted.');
      await loadCosts();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete cost');
    } finally {
      setDeletingCostId(null);
    }
  };

  const visibleCosts =
    shouldShowSuggestedExpectedInList(scheduleType) &&
    !costs.some((cost) => normalizeEditableStatus(cost.status) === 'expected') &&
    suggestedExpectedCost
      ? [
          {
            id: -1,
            event_id: eventId,
            schedule_item_type: scheduleType,
            schedule_item_id: scheduleId,
            name: suggestedExpectedCost.name,
            estimated_amount: suggestedExpectedCost.estimated_amount,
            currency: suggestedExpectedCost.currency,
            status: 'expected' as const,
            notes: null,
            created_at: '',
            updated_at: ''
          },
          ...costs
        ]
      : costs;

  return (
    <article className="card">
      <header className="card-header">
        <h3>Cost</h3>
      </header>
      {message ? <p className="muted">{message}</p> : null}
      {loading ? <p className="muted">Loading costs…</p> : null}
      {!loading && visibleCosts.length > 0 ? (
        <ul className="status-list">
          {visibleCosts.map((cost) => (
            <li key={cost.id} className="finance-cost-list-item">
              <div className="finance-cost-list-row">
                <div>
                  <strong>{cost.name}</strong>
                  <div className="muted finance-summary-note">
                    {formatMoney(cost.estimated_amount, cost.currency)} ·{' '}
                    {formatStatusLabel(normalizeEditableStatus(cost.status))}
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="ghost" onClick={() => resetForm(cost.id < 0 ? null : cost)}>
                    Edit
                  </button>
                  {cost.id > 0 ? (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => void handleDelete(cost.id)}
                      disabled={deletingCostId === cost.id}
                    >
                      {deletingCostId === cost.id ? 'Deleting…' : 'Delete'}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="form-grid finance-schedule-cost-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={defaultName} />
        </label>
        <label className="form-field">
          <span>Estimated Amount</span>
          <input type="number" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Currency</span>
          <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
        </label>
        <label className="form-field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as ScheduleItemCost['status'])}>
            {visibleStatuses.map((visibleStatus) => (
              <option key={visibleStatus} value={visibleStatus}>
                {formatStatusLabel(visibleStatus)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field form-field-full-span">
          <span>Notes</span>
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="form-actions form-field-full-span">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingCostId ? 'Update cost' : 'Add cost'}
          </button>
          {editingCostId ? (
            <button type="button" className="ghost" onClick={() => resetForm(null)}>
              New cost
            </button>
          ) : null}
        </div>
      </form>
    </article>
  );
};

export default DetailCostCard;

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ScheduleItemCost,
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

const ScheduleCostPanel = ({ eventId, scheduleType, scheduleId, defaultName }: Props) => {
  const [costs, setCosts] = useState<ScheduleItemCost[]>([]);
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
    setEditingCostId(cost?.id ?? null);
    setName(cost?.name ?? '');
    setAmount(cost ? String(cost.estimated_amount ?? '') : '');
    setCurrency(cost?.currency || 'EUR');
    setStatus(cost?.status || 'expected');
    setNotes(cost?.notes || '');
  }, []);

  const loadCosts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listScheduleItemCosts(eventId, scheduleType, scheduleId);
      const nextCosts = Array.isArray(response) ? response : [];
      setCosts(nextCosts);
      if (nextCosts.length === 0) {
        resetForm(null);
      } else if (!editingCostId || !nextCosts.some((cost) => cost.id === editingCostId)) {
        resetForm(nextCosts[0]);
      }
    } catch (err) {
      const statusCode = (err as Error & { status?: number }).status;
      if (statusCode === 404) {
        setCosts([]);
        resetForm(null);
      } else {
        setMessage(err instanceof Error ? err.message : 'Failed to load planned costs');
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
          status,
          notes: notes.trim() || undefined
        });
      } else {
        await createScheduleItemCost(eventId, scheduleType, scheduleId, {
          name: name.trim() || defaultName,
          estimated_amount: numericAmount,
          currency: currency.trim() || 'EUR',
          notes: notes.trim() || undefined
        });
      }
      setMessage('Planned cost saved.');
      await loadCosts();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save planned cost');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (costId: number) => {
    setDeletingCostId(costId);
    setMessage(null);
    try {
      await deleteScheduleItemCost(eventId, costId);
      setMessage('Planned cost deleted.');
      await loadCosts();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete planned cost');
    } finally {
      setDeletingCostId(null);
    }
  };

  return (
    <article className="card">
      <header className="card-header">
        <h3>Planned Cost</h3>
      </header>
      {message ? <p className="muted">{message}</p> : null}
      {loading ? <p className="muted">Loading planned costs…</p> : null}
      {!loading && costs.length > 0 ? (
        <ul className="status-list">
          {costs.map((cost) => (
            <li key={cost.id} className="finance-cost-list-item">
              <div className="finance-cost-list-row">
                <div>
                  <strong>{cost.name}</strong>
                  <div className="muted finance-summary-note">
                    {formatMoney(cost.estimated_amount, cost.currency)} · {cost.status}
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="ghost" onClick={() => resetForm(cost)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => void handleDelete(cost.id)}
                    disabled={deletingCostId === cost.id}
                  >
                    {deletingCostId === cost.id ? 'Deleting…' : 'Delete'}
                  </button>
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
            <option value="expected">Expected</option>
            <option value="committed">Committed</option>
            <option value="invoiced">Invoiced</option>
            <option value="partially_paid">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
            <option value="disputed">Disputed</option>
          </select>
        </label>
        <label className="form-field form-field-full-span">
          <span>Notes</span>
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="form-actions form-field-full-span">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingCostId ? 'Update planned cost' : 'Add planned cost'}
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

export default ScheduleCostPanel;

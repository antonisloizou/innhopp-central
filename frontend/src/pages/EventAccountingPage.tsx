import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EventGearMenu from '../components/EventGearMenu';
import EventPageTitle from '../components/EventPageTitle';
import {
  AccountingDocument,
  AccountingEntry,
  BudgetActualsReport,
  Payment,
  PaymentAllocation,
  createAccountingDocument,
  createAccountingDocumentEntry,
  createPayment,
  createPaymentAllocation,
  deleteAccountingEntry,
  deletePayment,
  deletePaymentAllocation,
  getBudgetActuals,
  listAccountingDocuments,
  listAccountingEntries,
  listPaymentAllocations,
  listPayments,
  updateAccountingDocument,
  updateAccountingEntry,
  updatePayment
} from '../api/accounting';
import { Event, Season, copyEvent, deleteEvent, listEvents, listSeasons } from '../api/events';

const formatMoney = (amount: number, currency = 'EUR') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount || 0);

const toDateInputValue = (value?: string | null) => {
  if (!value) return '';
  return value.slice(0, 10);
};

const buildLineRef = (line: BudgetActualsReport['lines'][number]) => {
  if (line.schedule_item_type && line.schedule_item_id && line.schedule_item_cost_id) {
    return `cost:${line.schedule_item_cost_id}`;
  }
  if (line.budget_line_item_id) {
    return `budget:${line.budget_line_item_id}`;
  }
  return '';
};

const parseLineRef = (lineRef: string) => {
  const [kind, rawId] = lineRef.split(':');
  const id = Number(rawId);
  if (!kind || !Number.isFinite(id) || id <= 0) {
    return { scheduleItemCostID: undefined, budgetLineItemID: undefined };
  }
  if (kind === 'cost') {
    return { scheduleItemCostID: id, budgetLineItemID: undefined };
  }
  if (kind === 'budget') {
    return { scheduleItemCostID: undefined, budgetLineItemID: id };
  }
  return { scheduleItemCostID: undefined, budgetLineItemID: undefined };
};

const getScheduleSourcePath = (eventId: number, line: BudgetActualsReport['lines'][number]) => {
  if (!line.schedule_item_id || !line.schedule_item_type) return null;
  switch (line.schedule_item_type) {
    case 'innhopp':
      return `/events/${eventId}/innhopps/${line.schedule_item_id}`;
    case 'transport':
      return `/logistics/${line.schedule_item_id}`;
    case 'ground_crew':
      return `/logistics/ground-crew/${line.schedule_item_id}`;
    case 'other':
      return `/logistics/others/${line.schedule_item_id}`;
    case 'meal':
      return `/logistics/meals/${line.schedule_item_id}`;
    case 'accommodation':
      return `/events/${eventId}/accommodations/${line.schedule_item_id}`;
    default:
      return null;
  }
};

const EventAccountingPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(eventId || '');
  const [documents, setDocuments] = useState<AccountingDocument[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [actuals, setActuals] = useState<BudgetActualsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDocument, setSavingDocument] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingAllocation, setSavingAllocation] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingDocumentID, setEditingDocumentID] = useState<number | null>(null);
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentType, setDocumentType] = useState<'invoice' | 'credit_note' | 'adjustment'>('invoice');
  const [documentStatus, setDocumentStatus] = useState<'draft' | 'posted' | 'voided'>('draft');
  const [documentDate, setDocumentDate] = useState('');
  const [documentDueDate, setDocumentDueDate] = useState('');
  const [documentCurrency, setDocumentCurrency] = useState('EUR');
  const [documentNotes, setDocumentNotes] = useState('');
  const [editingEntryID, setEditingEntryID] = useState<number | null>(null);
  const [selectedDocumentID, setSelectedDocumentID] = useState('');
  const [selectedLineRef, setSelectedLineRef] = useState('');
  const [entryType, setEntryType] = useState<'cost' | 'credit' | 'adjustment'>('cost');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryPostedAt, setEntryPostedAt] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [editingPaymentID, setEditingPaymentID] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'card' | 'cash' | 'other'>('bank_transfer');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [selectedPaymentID, setSelectedPaymentID] = useState('');
  const [selectedEntryID, setSelectedEntryID] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');

  useEffect(() => {
    if (eventId) {
      setSelectedEvent(eventId);
    }
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;

    const loadFilters = async () => {
      try {
        const [seasonResp, eventResp] = await Promise.all([listSeasons(), listEvents()]);
        if (cancelled) return;
        setSeasons(Array.isArray(seasonResp) ? seasonResp : []);
        setEvents(Array.isArray(eventResp) ? eventResp : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load accounting');
        }
      }
    };

    void loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const activeEventId = Number(selectedEvent);
    if (!activeEventId) {
      setLoading(false);
      setDocuments([]);
      setEntries([]);
      setPayments([]);
      setAllocations([]);
      setActuals(null);
      resetDocumentForm();
      resetEntryForm();
      resetPaymentForm();
      return;
    }

    const loadAccounting = async () => {
      setLoading(true);
      setError(null);
      try {
        const allocationPromise = listPaymentAllocations(activeEventId).catch((err) => {
          const status = (err as Error & { status?: number }).status;
          if (status === 404) return [];
          throw err;
        });
        const [documentResp, entryResp, paymentResp, allocationResp, actualsResp] = await Promise.all([
          listAccountingDocuments(activeEventId),
          listAccountingEntries(activeEventId),
          listPayments(activeEventId),
          allocationPromise,
          getBudgetActuals(activeEventId)
        ]);
        if (cancelled) return;
        setDocuments(Array.isArray(documentResp) ? documentResp : []);
        setEntries(Array.isArray(entryResp) ? entryResp : []);
        setPayments(Array.isArray(paymentResp) ? paymentResp : []);
        setAllocations(Array.isArray(allocationResp) ? allocationResp : []);
        setActuals(actualsResp);
      } catch (err) {
        if (cancelled) return;
        setDocuments([]);
        setEntries([]);
        setPayments([]);
        setAllocations([]);
        setActuals(null);
        setError(err instanceof Error ? err.message : 'Failed to load accounting');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadAccounting();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent]);

  const filteredEvents = useMemo(() => {
    if (!selectedSeason) return events;
    return events.filter((event) => event.season_id === Number(selectedSeason));
  }, [events, selectedSeason]);

  const activeEvent = useMemo(
    () => events.find((event) => event.id === Number(selectedEvent)) ?? null,
    [events, selectedEvent]
  );
  const budgetLineOptions = actuals?.lines ?? [];

  const currency = actuals?.currency || 'EUR';

  const resetDocumentForm = () => {
    setEditingDocumentID(null);
    setDocumentNumber('');
    setDocumentType('invoice');
    setDocumentStatus('draft');
    setDocumentDate('');
    setDocumentDueDate('');
    setDocumentCurrency(currency);
    setDocumentNotes('');
  };

  const resetEntryForm = () => {
    setEditingEntryID(null);
    setSelectedDocumentID('');
    setSelectedLineRef('');
    setEntryType('cost');
    setEntryAmount('');
    setEntryPostedAt('');
    setEntryDescription('');
  };

  const resetPaymentForm = () => {
    setEditingPaymentID(null);
    setPaymentMethod('bank_transfer');
    setPaymentAmount('');
    setPaymentReference('');
    setPaymentDate('');
    setPaymentNotes('');
  };

  const reloadAccounting = async (activeEventID: number) => {
    setLoading(true);
    setError(null);
    try {
      const allocationPromise = listPaymentAllocations(activeEventID).catch((err) => {
        const status = (err as Error & { status?: number }).status;
        if (status === 404) return [];
        throw err;
      });
      const [documentResp, entryResp, paymentResp, allocationResp, actualsResp] = await Promise.all([
        listAccountingDocuments(activeEventID),
        listAccountingEntries(activeEventID),
        listPayments(activeEventID),
        allocationPromise,
        getBudgetActuals(activeEventID)
      ]);
      setDocuments(Array.isArray(documentResp) ? documentResp : []);
      setEntries(Array.isArray(entryResp) ? entryResp : []);
      setPayments(Array.isArray(paymentResp) ? paymentResp : []);
      setAllocations(Array.isArray(allocationResp) ? allocationResp : []);
      setActuals(actualsResp);
    } catch (err) {
      setDocuments([]);
      setEntries([]);
      setPayments([]);
      setAllocations([]);
      setActuals(null);
      setError(err instanceof Error ? err.message : 'Failed to load accounting');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!activeEvent) return;
    setCopying(true);
    setError(null);
    setMessage(null);
    try {
      const cloned = await copyEvent(activeEvent.id);
      navigate(`/events/${cloned.id}/accounting`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy event');
    } finally {
      setCopying(false);
    }
  };

  const handleDelete = async () => {
    if (!activeEvent) return;
    const confirmed = window.confirm('Delete this event and its finance data? This cannot be undone.');
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await deleteEvent(activeEvent.id);
      navigate('/finance');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeEvent) return;
    setSavingDocument(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        doc_type: documentType,
        document_number: documentNumber.trim() || undefined,
        document_date: documentDate || undefined,
        due_date: documentDueDate || undefined,
        currency: documentCurrency.trim() || currency,
        notes: documentNotes.trim() || undefined,
        status: documentStatus
      };
      const created = editingDocumentID
        ? await updateAccountingDocument(editingDocumentID, payload)
        : await createAccountingDocument(activeEvent.id, payload);
      setMessage(editingDocumentID ? 'Accounting document updated.' : 'Accounting document created.');
      resetDocumentForm();
      setSelectedDocumentID(String(created.id));
      await reloadAccounting(activeEvent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save accounting document');
    } finally {
      setSavingDocument(false);
    }
  };

  const handleCreateEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeEvent) return;
    const docID = Number(selectedDocumentID);
    const amount = Number(entryAmount);
    const { scheduleItemCostID, budgetLineItemID } = parseLineRef(selectedLineRef);
    if (!docID || (!scheduleItemCostID && !budgetLineItemID) || !Number.isFinite(amount) || amount === 0) {
      setError('Document, source line, and non-zero amount are required.');
      return;
    }
    setSavingEntry(true);
    setError(null);
    setMessage(null);
    try {
      if (editingEntryID) {
        await updateAccountingEntry(editingEntryID, {
          document_id: docID,
          schedule_item_cost_id: scheduleItemCostID,
          budget_line_item_id: budgetLineItemID,
          entry_type: entryType,
          amount,
          currency,
          posted_at: entryPostedAt || undefined,
          description: entryDescription.trim() || undefined
        });
      } else {
        await createAccountingDocumentEntry(docID, {
          schedule_item_cost_id: scheduleItemCostID,
          budget_line_item_id: budgetLineItemID,
          entry_type: entryType,
          amount,
          currency,
          posted_at: entryPostedAt || undefined,
          description: entryDescription.trim() || undefined
        });
      }
      setMessage(editingEntryID ? 'Accounting entry updated.' : 'Accounting entry posted.');
      resetEntryForm();
      await reloadAccounting(activeEvent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save accounting entry');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleCreatePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeEvent) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Payment amount must be positive.');
      return;
    }
    setSavingPayment(true);
    setError(null);
    setMessage(null);
    try {
      if (editingPaymentID) {
        await updatePayment(editingPaymentID, {
          method: paymentMethod,
          amount,
          currency,
          paid_at: paymentDate || undefined,
          reference: paymentReference.trim() || undefined,
          notes: paymentNotes.trim() || undefined
        });
      } else {
        await createPayment(activeEvent.id, {
          method: paymentMethod,
          amount,
          currency,
          paid_at: paymentDate || undefined,
          reference: paymentReference.trim() || undefined,
          notes: paymentNotes.trim() || undefined
        });
      }
      setMessage(editingPaymentID ? 'Payment updated.' : 'Payment recorded.');
      resetPaymentForm();
      await reloadAccounting(activeEvent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleCreateAllocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeEvent) return;
    const paymentID = Number(selectedPaymentID);
    const entryID = Number(selectedEntryID);
    const amount = Number(allocationAmount);
    if (!paymentID || !entryID || !Number.isFinite(amount) || amount <= 0) {
      setError('Payment, entry, and positive allocation amount are required.');
      return;
    }
    setSavingAllocation(true);
    setError(null);
    setMessage(null);
    try {
      await createPaymentAllocation(paymentID, {
        accounting_entry_id: entryID,
        amount,
        currency
      });
      setMessage('Payment allocated.');
      setAllocationAmount('');
      await reloadAccounting(activeEvent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to allocate payment');
    } finally {
      setSavingAllocation(false);
    }
  };

  const handleEditDocument = (document: AccountingDocument) => {
    setEditingDocumentID(document.id);
    setDocumentNumber(document.document_number || '');
    setDocumentType(document.doc_type);
    setDocumentStatus(document.status);
    setDocumentDate(toDateInputValue(document.document_date));
    setDocumentDueDate(toDateInputValue(document.due_date));
    setDocumentCurrency(document.currency || currency);
    setDocumentNotes(document.notes || '');
  };

  const handleDocumentStatusChange = async (document: AccountingDocument, status: AccountingDocument['status']) => {
    setSavingDocument(true);
    setError(null);
    setMessage(null);
    try {
      await updateAccountingDocument(document.id, {
        doc_type: document.doc_type,
        status,
        document_number: document.document_number || undefined,
        document_date: toDateInputValue(document.document_date),
        due_date: toDateInputValue(document.due_date),
        currency: document.currency,
        notes: document.notes || undefined
      });
      setMessage(`Document marked ${status}.`);
      await reloadAccounting(document.event_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update document status');
    } finally {
      setSavingDocument(false);
    }
  };

  const handleEditEntry = (entry: AccountingEntry) => {
    setEditingEntryID(entry.id);
    setSelectedDocumentID(String(entry.document_id));
    setSelectedLineRef(entry.schedule_item_cost_id ? `cost:${entry.schedule_item_cost_id}` : `budget:${entry.budget_line_item_id || ''}`);
    setEntryType(entry.entry_type);
    setEntryAmount(String(Math.abs(entry.amount)));
    setEntryPostedAt(toDateInputValue(entry.posted_at));
    setEntryDescription(entry.description || '');
  };

  const handleDeleteEntry = async (entry: AccountingEntry) => {
    if (!window.confirm('Delete this accounting entry?')) return;
    setSavingEntry(true);
    setError(null);
    setMessage(null);
    try {
      await deleteAccountingEntry(entry.id);
      setMessage('Accounting entry deleted.');
      if (editingEntryID === entry.id) resetEntryForm();
      await reloadAccounting(entry.event_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete accounting entry');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPaymentID(payment.id);
    setPaymentMethod(payment.method);
    setPaymentAmount(String(payment.amount));
    setPaymentReference(payment.reference || '');
    setPaymentDate(toDateInputValue(payment.paid_at));
    setPaymentNotes(payment.notes || '');
  };

  const handleDeletePayment = async (payment: Payment) => {
    if (!window.confirm('Delete this payment?')) return;
    setSavingPayment(true);
    setError(null);
    setMessage(null);
    try {
      await deletePayment(payment.id);
      setMessage('Payment deleted.');
      if (editingPaymentID === payment.id) resetPaymentForm();
      await reloadAccounting(payment.event_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeleteAllocation = async (allocation: PaymentAllocation) => {
    if (!window.confirm('Delete this payment allocation?')) return;
    setSavingAllocation(true);
    setError(null);
    setMessage(null);
    try {
      await deletePaymentAllocation(allocation.id);
      setMessage('Payment allocation deleted.');
      await reloadAccounting(Number(selectedEvent));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment allocation');
    } finally {
      setSavingAllocation(false);
    }
  };

  return (
    <section className="stack">
      <header className="page-header">
        {activeEvent ? (
          <EventPageTitle event={activeEvent} section="Accounting" showSlotsBadge />
        ) : (
          <div>
            <h2>Accounting</h2>
          </div>
        )}
        {activeEvent ? (
          <EventGearMenu
            eventId={activeEvent.id}
            currentPage="accounting"
            copying={copying}
            deleting={deleting}
            onCopy={handleCopy}
            onDelete={handleDelete}
          />
        ) : null}
      </header>

      {!eventId ? (
        <article className="card">
          <div className="form-grid logistics-list-filters">
            <label className="form-field">
              <span>Season</span>
              <select
                value={selectedSeason}
                onChange={(event) => {
                  setSelectedSeason(event.target.value);
                  if (!eventId) setSelectedEvent('');
                }}
                className="logistics-list-season-select"
              >
                <option value="">All seasons</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Event</span>
              <select
                value={selectedEvent}
                onChange={(event) => setSelectedEvent(event.target.value)}
                className="logistics-list-event-select"
                disabled={!!eventId}
              >
                <option value="">Select an event</option>
                {filteredEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </article>
      ) : null}

      {loading ? <p>Loading accounting…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}

      {!loading && !error && !activeEvent ? (
        <article className="card">
          <h3>No event selected</h3>
          <p className="muted">Choose an event to open the accounting workspace.</p>
        </article>
      ) : null}

      {!loading && !error && activeEvent ? (
        <>
          <div className="logistics-summary-grid">
            <article className="card finance-summary-card">
              <header className="card-header">
                <h3>Expected Cost</h3>
                <span className="badge neutral">{actuals?.lines.length ?? 0} lines</span>
              </header>
              <strong>{formatMoney(actuals?.totals.planned_amount ?? 0, currency)}</strong>
              <p className="muted finance-summary-meta">Expected cost baseline synced from schedule item costs and budget lines.</p>
            </article>

            <article className="card finance-summary-card">
              <header className="card-header">
                <h3>Invoiced</h3>
                <span className="badge neutral">{documents.length} docs</span>
              </header>
              <strong>{formatMoney(actuals?.totals.invoiced_amount ?? 0, currency)}</strong>
              <p className="muted finance-summary-meta">
                Delta vs expected cost: {formatMoney(actuals?.totals.estimate_to_invoice_variance_amount ?? 0, currency)}
              </p>
            </article>

            <article className="card finance-summary-card">
              <header className="card-header">
                <h3>Paid</h3>
                <span className="badge neutral">{payments.length} payments</span>
              </header>
              <strong>{formatMoney(actuals?.totals.paid_amount ?? 0, currency)}</strong>
              <p className="muted finance-summary-meta">
                Delta vs invoiced: {formatMoney(actuals?.totals.invoice_to_paid_variance_amount ?? 0, currency)}
              </p>
            </article>

            <article className="card finance-summary-card">
              <header className="card-header">
                <h3>Open</h3>
                <span className="badge neutral">{entries.length} entries</span>
              </header>
              <strong>{formatMoney(actuals?.totals.open_invoice_amount ?? 0, currency)}</strong>
              <p className="muted finance-summary-meta">Outstanding invoice amount still not paid.</p>
            </article>
          </div>

          <article className="card">
            <header className="card-header">
              <h3>Workspace</h3>
            </header>
            <div className="finance-workspace-grid">
              <form onSubmit={handleCreateDocument} className="form-grid finance-workspace-form">
                <h4>{editingDocumentID ? 'Edit Document' : 'New Document'}</h4>
                <label className="form-field">
                  <span>Type</span>
                  <select value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)}>
                    <option value="invoice">Invoice</option>
                    <option value="credit_note">Credit Note</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Document Number</span>
                  <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Document Date</span>
                  <input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Due Date</span>
                  <input type="date" value={documentDueDate} onChange={(event) => setDocumentDueDate(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Currency</span>
                  <input value={documentCurrency} onChange={(event) => setDocumentCurrency(event.target.value.toUpperCase())} maxLength={3} />
                </label>
                <label className="form-field">
                  <span>Status</span>
                  <select value={documentStatus} onChange={(event) => setDocumentStatus(event.target.value as typeof documentStatus)}>
                    <option value="draft">Draft</option>
                    <option value="posted">Posted</option>
                    <option value="voided">Voided</option>
                  </select>
                </label>
                <label className="form-field form-field-full-span">
                  <span>Notes</span>
                  <textarea value={documentNotes} onChange={(event) => setDocumentNotes(event.target.value)} rows={3} />
                </label>
                <div className="form-actions">
                  <button type="submit" disabled={savingDocument}>{savingDocument ? 'Saving…' : editingDocumentID ? 'Save document' : 'Create document'}</button>
                  {editingDocumentID ? <button type="button" className="ghost" onClick={resetDocumentForm}>Cancel</button> : null}
                </div>
              </form>

              <form onSubmit={handleCreateEntry} className="form-grid finance-workspace-form">
                <h4>{editingEntryID ? 'Edit Entry' : 'Post Entry'}</h4>
                <label className="form-field">
                  <span>Document</span>
                  <select value={selectedDocumentID} onChange={(event) => setSelectedDocumentID(event.target.value)}>
                    <option value="">Select document</option>
                    {documents.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.document_number || `${document.doc_type} #${document.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Source Line</span>
                  <select value={selectedLineRef} onChange={(event) => setSelectedLineRef(event.target.value)}>
                    <option value="">Select line</option>
                    {budgetLineOptions.map((line) => (
                      <option key={`${line.schedule_item_type || 'budget'}-${line.schedule_item_cost_id}-${line.budget_line_item_id || 'none'}`} value={buildLineRef(line)}>
                        {line.name} {line.schedule_item_type ? `· ${line.schedule_item_type}` : '· budget only'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Entry Type</span>
                  <select value={entryType} onChange={(event) => setEntryType(event.target.value as typeof entryType)}>
                    <option value="cost">Cost</option>
                    <option value="credit">Credit</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Amount</span>
                  <input type="number" step="0.01" value={entryAmount} onChange={(event) => setEntryAmount(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Posted At</span>
                  <input type="date" value={entryPostedAt} onChange={(event) => setEntryPostedAt(event.target.value)} />
                </label>
                <label className="form-field form-field-full-span">
                  <span>Description</span>
                  <input value={entryDescription} onChange={(event) => setEntryDescription(event.target.value)} />
                </label>
                <div className="form-actions">
                  <button type="submit" disabled={savingEntry}>{savingEntry ? 'Saving…' : editingEntryID ? 'Save entry' : 'Post entry'}</button>
                  {editingEntryID ? <button type="button" className="ghost" onClick={resetEntryForm}>Cancel</button> : null}
                </div>
              </form>

              <form onSubmit={handleCreatePayment} className="form-grid finance-workspace-form">
                <h4>{editingPaymentID ? 'Edit Payment' : 'Record Payment'}</h4>
                <label className="form-field">
                  <span>Method</span>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Amount</span>
                  <input type="number" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Paid At</span>
                  <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Reference</span>
                  <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                </label>
                <label className="form-field form-field-full-span">
                  <span>Notes</span>
                  <textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} rows={3} />
                </label>
                <div className="form-actions">
                  <button type="submit" disabled={savingPayment}>{savingPayment ? 'Saving…' : editingPaymentID ? 'Save payment' : 'Record payment'}</button>
                  {editingPaymentID ? <button type="button" className="ghost" onClick={resetPaymentForm}>Cancel</button> : null}
                </div>
              </form>

              <form onSubmit={handleCreateAllocation} className="form-grid finance-workspace-form">
                <h4>Allocate Payment</h4>
                <label className="form-field">
                  <span>Payment</span>
                  <select value={selectedPaymentID} onChange={(event) => setSelectedPaymentID(event.target.value)}>
                    <option value="">Select payment</option>
                    {payments.map((payment) => (
                      <option key={payment.id} value={payment.id}>
                        {formatMoney(payment.amount, payment.currency)} {payment.reference ? `· ${payment.reference}` : `· payment #${payment.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Entry</span>
                  <select value={selectedEntryID} onChange={(event) => setSelectedEntryID(event.target.value)}>
                    <option value="">Select entry</option>
                    {entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {formatMoney(entry.amount, entry.currency)} · {entry.description || `entry #${entry.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Amount</span>
                  <input type="number" step="0.01" value={allocationAmount} onChange={(event) => setAllocationAmount(event.target.value)} />
                </label>
                <div className="form-actions">
                  <button type="submit" disabled={savingAllocation}>{savingAllocation ? 'Allocating…' : 'Allocate payment'}</button>
                </div>
              </form>
            </div>
            <div className="finance-workspace-links">
              <Link className="button-link primary" to={`/events/${activeEvent.id}/budget`}>
                Open budget
              </Link>
              <Link className="button-link ghost" to="/finance">
                Back to finance
              </Link>
            </div>
          </article>

          <div className="logistics-summary-grid">
            <article className="card finance-summary-card">
              <header className="card-header">
                <h3>Documents</h3>
                <span className="badge neutral">{documents.length}</span>
              </header>
              {documents.length > 0 ? (
                <ul className="status-list">
                  {documents.slice(0, 5).map((document) => (
                    <li key={document.id}>
                      <strong>{document.document_number || `${document.doc_type} #${document.id}`}</strong>
                      <div className="muted finance-summary-note">
                        {document.status} · {document.document_date ? new Date(document.document_date).toLocaleDateString() : 'No date'}
                      </div>
                      <div className="form-actions">
                        <button type="button" className="ghost" onClick={() => handleEditDocument(document)}>Edit</button>
                        {document.status !== 'posted' ? (
                          <button type="button" className="ghost" onClick={() => void handleDocumentStatusChange(document, 'posted')}>Post</button>
                        ) : null}
                        {document.status !== 'draft' && document.status !== 'voided' ? (
                          <button type="button" className="ghost" onClick={() => void handleDocumentStatusChange(document, 'draft')}>Draft</button>
                        ) : null}
                        {document.status !== 'voided' ? (
                          <button type="button" className="ghost danger" onClick={() => void handleDocumentStatusChange(document, 'voided')}>Void</button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No documents yet.</p>
              )}
            </article>

            <article className="card finance-summary-card">
              <header className="card-header">
                <h3>Entries</h3>
                <span className="badge neutral">{entries.length}</span>
              </header>
              {entries.length > 0 ? (
                <ul className="status-list">
                  {entries.slice(0, 5).map((entry) => (
                    <li key={entry.id}>
                      <strong>{formatMoney(entry.amount, entry.currency)}</strong>
                      <div className="muted finance-summary-note">
                        {entry.entry_type} · document #{entry.document_id}
                      </div>
                      <div className="form-actions">
                        <button type="button" className="ghost" onClick={() => handleEditEntry(entry)}>Edit</button>
                        <button type="button" className="ghost danger" onClick={() => void handleDeleteEntry(entry)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No entries yet.</p>
              )}
            </article>

            <article className="card finance-summary-card">
              <header className="card-header">
                <h3>Payments</h3>
                <span className="badge neutral">{payments.length}</span>
              </header>
              {payments.length > 0 ? (
                <ul className="status-list">
                  {payments.slice(0, 5).map((payment) => (
                    <li key={payment.id}>
                      <strong>{formatMoney(payment.amount, payment.currency)}</strong>
                      <div className="muted finance-summary-note">
                        {payment.method} {payment.reference ? `· ${payment.reference}` : ''}
                      </div>
                      <div className="form-actions">
                        <button type="button" className="ghost" onClick={() => handleEditPayment(payment)}>Edit</button>
                        <button type="button" className="ghost danger" onClick={() => void handleDeletePayment(payment)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No payments yet.</p>
              )}
            </article>

            <article className="card finance-summary-card">
              <header className="card-header">
                <h3>Allocations</h3>
                <span className="badge neutral">{allocations.length}</span>
              </header>
              {allocations.length > 0 ? (
                <ul className="status-list">
                  {allocations.slice(0, 5).map((allocation) => (
                    <li key={allocation.id}>
                      <strong>{formatMoney(allocation.amount, allocation.currency)}</strong>
                      <div className="muted finance-summary-note">
                        payment #{allocation.payment_id} · entry #{allocation.accounting_entry_id ?? 'n/a'}
                      </div>
                      <div className="form-actions">
                        <button type="button" className="ghost danger" onClick={() => void handleDeleteAllocation(allocation)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No allocations yet.</p>
              )}
            </article>
          </div>

          <article className="card">
            <header className="card-header">
              <h3>Line Status</h3>
            </header>
            {actuals && actuals.lines.length > 0 ? (
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Status</th>
                      <th>Expected Cost</th>
                      <th>Invoiced</th>
                      <th>Paid</th>
                      <th>Expected to Inv.</th>
                      <th>Inv. to Paid</th>
                      <th>Vs Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actuals.lines.map((line) => (
                      <tr key={`${line.schedule_item_type || 'budget'}-${line.schedule_item_cost_id}-${line.budget_line_item_id || 'none'}`}>
                        <td>
                          {(() => {
                            const sourcePath = getScheduleSourcePath(actuals.event_id, line);
                            if (!sourcePath) {
                              return <div className="finance-table-line-name">{line.name}</div>;
                            }
                            return (
                              <Link to={sourcePath} className="finance-table-line-link">
                                {line.name}
                              </Link>
                            );
                          })()}
                          <div className="muted finance-table-line-meta">
                            {[line.section_code, line.section_name, line.schedule_item_type].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td>
                          <span className={`badge status-${line.status}`}>{line.status}</span>
                        </td>
                        <td>{formatMoney(line.planned_amount, line.currency)}</td>
                        <td>{formatMoney(line.invoiced_amount, line.currency)}</td>
                        <td>{formatMoney(line.paid_amount, line.currency)}</td>
                        <td>{formatMoney(line.estimate_to_invoice_variance_amount, line.currency)}</td>
                        <td>{formatMoney(line.invoice_to_paid_variance_amount, line.currency)}</td>
                        <td>{formatMoney(line.variance_vs_budget, line.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No accounting lines yet.</p>
            )}
          </article>
        </>
      ) : null}
    </section>
  );
};

export default EventAccountingPage;

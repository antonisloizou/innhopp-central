import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Event, getEvent } from '../api/events';
import {
  AudienceFilter,
  AudiencePreviewResponse,
  Campaign,
  createCampaign,
  createEmailTemplate,
  getAudiencePreview,
  listEmailTemplates,
  listEventCampaigns,
  EmailTemplate
} from '../api/comms';
import { formatEventLocal } from '../utils/eventDate';

type TemplateForm = {
  key: string;
  name: string;
  subject_template: string;
  body_template: string;
};

const initialTemplateForm: TemplateForm = {
  key: '',
  name: '',
  subject_template: '',
  body_template: ''
};

const templateTokens = [
  'participant_name',
  'participant_email',
  'registration_status',
  'deposit_due_at',
  'deposit_paid_at',
  'balance_due_at',
  'balance_paid_at',
  'deposit_state',
  'balance_state',
  'event_name',
  'event_location',
  'event_starts_at',
  'deposit_amount',
  'balance_amount',
  'total_amount',
  'currency',
  'public_registration_link'
];

const renderTemplatePreview = (value: string, replacements: Record<string, string>) => {
  let rendered = value;
  Object.entries(replacements).forEach(([key, replacement]) => {
    rendered = rendered.split(`{{${key}}}`).join(replacement);
  });
  return rendered;
};

const formatMoney = (amount?: number | null, currency?: string | null) => {
  if (!Number.isFinite(amount ?? null)) return '';
  const cur = (currency || 'EUR').trim().toUpperCase() || 'EUR';
  return `${Number(amount).toFixed(2)} ${cur}`;
};

const EventCommsPage = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [filter, setFilter] = useState<AudienceFilter>({});
  const [templateForm, setTemplateForm] = useState<TemplateForm>(initialTemplateForm);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      try {
        const [nextEvent, nextTemplates, nextCampaigns] = await Promise.all([
          getEvent(Number(eventId)),
          listEmailTemplates(),
          listEventCampaigns(Number(eventId))
        ]);
        if (cancelled) return;
        setEventData(nextEvent);
        setTemplates(nextTemplates);
        setCampaigns(nextCampaigns);
        if (nextTemplates.length > 0) {
          setSelectedTemplateId(String(nextTemplates[0].id));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load comms');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!actionMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!actionMenuRef.current || !target) return;
      if (!actionMenuRef.current.contains(target)) {
        setActionMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [actionMenuOpen]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === Number(selectedTemplateId)) || null,
    [selectedTemplateId, templates]
  );

  const previewRecipient = audiencePreview?.recipients?.[0] || null;

  const templatePreviewValues = useMemo(() => {
    const totalAmount =
      Number(eventData?.deposit_amount || 0) + Number(eventData?.balance_amount || 0);
    return {
      participant_name: previewRecipient?.participant_name || 'Sample participant',
      participant_email: previewRecipient?.participant_email || 'participant@example.com',
      registration_status: previewRecipient?.status?.replace(/_/g, ' ') || 'deposit pending',
      deposit_due_at: previewRecipient?.deposit_due_at
        ? formatEventLocal(previewRecipient.deposit_due_at, { dateStyle: 'medium', timeStyle: 'short' })
        : 'Apr 6, 2026, 12:00 PM',
      deposit_paid_at: previewRecipient?.deposit_paid_at
        ? formatEventLocal(previewRecipient.deposit_paid_at, { dateStyle: 'medium', timeStyle: 'short' })
        : '',
      balance_due_at: previewRecipient?.balance_due_at
        ? formatEventLocal(previewRecipient.balance_due_at, { dateStyle: 'medium', timeStyle: 'short' })
        : eventData?.balance_deadline
          ? formatEventLocal(eventData.balance_deadline, { dateStyle: 'medium', timeStyle: 'short' })
          : 'TBD',
      balance_paid_at: previewRecipient?.balance_paid_at
        ? formatEventLocal(previewRecipient.balance_paid_at, { dateStyle: 'medium', timeStyle: 'short' })
        : '',
      deposit_state: previewRecipient?.deposit_state || 'pending',
      balance_state: previewRecipient?.balance_state || 'pending',
      event_name: eventData?.name || 'Innhopp event',
      event_location: eventData?.location || 'Location TBD',
      event_starts_at: eventData?.starts_at
        ? formatEventLocal(eventData.starts_at, { dateStyle: 'full', timeStyle: 'short' })
        : 'TBD',
      deposit_amount: formatMoney(eventData?.deposit_amount, eventData?.currency) || 'TBD',
      balance_amount: formatMoney(eventData?.balance_amount, eventData?.currency) || 'TBD',
      total_amount: totalAmount > 0 ? formatMoney(totalAmount, eventData?.currency) : 'TBD',
      currency: (eventData?.currency || 'EUR').trim().toUpperCase() || 'EUR',
      public_registration_link: eventData?.public_registration_slug
        ? `/register/${eventData.public_registration_slug}`
        : 'No public link'
    };
  }, [eventData, previewRecipient]);

  const renderedSubjectPreview = useMemo(() => {
    if (!selectedTemplate) return '';
    return renderTemplatePreview(selectedTemplate.subject_template, templatePreviewValues);
  }, [selectedTemplate, templatePreviewValues]);

  const renderedBodyPreview = useMemo(() => {
    if (!selectedTemplate) return '';
    return renderTemplatePreview(selectedTemplate.body_template, templatePreviewValues);
  }, [selectedTemplate, templatePreviewValues]);

  const loadPreview = async () => {
    if (!eventId) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const preview = await getAudiencePreview(Number(eventId), filter);
      setAudiencePreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audience preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingTemplate(true);
    setError(null);
    setMessage(null);
    try {
      const template = await createEmailTemplate({
        key: templateForm.key,
        name: templateForm.name,
        subject_template: templateForm.subject_template,
        body_template: templateForm.body_template,
        audience_type: 'event_registrations',
        enabled: true
      });
      setTemplates((prev) => [template, ...prev]);
      setSelectedTemplateId(String(template.id));
      setTemplateForm(initialTemplateForm);
      setMessage('Template created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleSendCampaign = async () => {
    if (!eventId || !selectedTemplateId) return;
    setSendingCampaign(true);
    setError(null);
    setMessage(null);
    try {
      const campaign = await createCampaign({
        event_id: Number(eventId),
        template_id: Number(selectedTemplateId),
        mode: 'manual',
        filter
      });
      setCampaigns((prev) => [campaign, ...prev]);
      await loadPreview();
      setMessage(`Campaign sent to ${campaign.delivery_count} recipients`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send campaign');
    } finally {
      setSendingCampaign(false);
    }
  };

  if (loading) return <p className="muted">Loading comms…</p>;
  if (error && !eventData) return <p className="error-text">{error}</p>;
  if (!eventData) return <p className="error-text">Event not found.</p>;

  return (
    <section className="stack">
      <header className="page-header">
        <div>
          <h2>{eventData.name} comms</h2>
          <p className="muted">
            {eventData.location ? `${eventData.location} · ` : ''}
            {formatEventLocal(eventData.starts_at, { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div className="event-schedule-actions" ref={actionMenuRef}>
          <button
            className="ghost event-schedule-gear"
            type="button"
            aria-label={actionMenuOpen ? 'Close actions menu' : 'Open actions menu'}
            aria-expanded={actionMenuOpen}
            aria-controls="event-comms-actions-menu"
            onClick={() => setActionMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.57.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.06.73 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.57-.22 1.12-.52 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
            </svg>
          </button>
          {actionMenuOpen && (
            <div className="event-schedule-menu" id="event-comms-actions-menu" role="menu">
              <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate(`/events/${eventData.id}/details`); }}>Details</button>
              <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate(`/events/${eventData.id}`); }}>Schedule</button>
              <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate(`/events/${eventData.id}/registrations`); }}>Registrations</button>
              <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate(`/manifests?eventId=${eventData.id}`); }}>Manifest</button>
              <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate('/events'); }}>Back</button>
            </div>
          )}
        </div>
      </header>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="registration-stats-grid">
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Templates</span>
          <strong>{templates.length}</strong>
        </article>
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Campaigns</span>
          <strong>{campaigns.length}</strong>
        </article>
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Preview audience</span>
          <strong>{audiencePreview?.count ?? 0}</strong>
        </article>
      </section>

      <article className="card stack">
        <div className="page-header">
          <div>
            <h3>Template studio</h3>
            <p className="muted">Create reusable templates and preview them with real event and recipient data.</p>
          </div>
        </div>
        <div className="comms-composer-grid">
          <form className="stack" onSubmit={handleCreateTemplate}>
            <div className="form-grid comms-template-grid">
              <label className="form-field">
                <span>Key</span>
                <input value={templateForm.key} onChange={(e) => setTemplateForm((prev) => ({ ...prev, key: e.target.value }))} placeholder="deposit-reminder" />
              </label>
              <label className="form-field">
                <span>Name</span>
                <input value={templateForm.name} onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Deposit reminder" />
              </label>
              <label className="form-field comms-field-span">
                <span>Subject template</span>
                <input value={templateForm.subject_template} onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject_template: e.target.value }))} placeholder="Deposit reminder for {{event_name}}" />
              </label>
              <label className="form-field comms-field-span">
                <span>Body template</span>
                <textarea value={templateForm.body_template} onChange={(e) => setTemplateForm((prev) => ({ ...prev, body_template: e.target.value }))} placeholder={'Hi {{participant_name}},\nYour deposit for {{event_name}} is due on {{deposit_due_at}}.'} />
              </label>
            </div>
            <div className="detail-actions">
              <button className="primary" type="submit" disabled={creatingTemplate}>{creatingTemplate ? 'Saving…' : 'Create template'}</button>
            </div>
          </form>

          <aside className="comms-preview-panel">
            <div className="comms-preview-panel-header">
              <h4>Placeholder reference</h4>
              <p className="muted">
                {previewRecipient ? `Previewing with ${previewRecipient.participant_name}` : 'Previewing with sample recipient data'}
              </p>
            </div>
            <div className="comms-token-list">
              {templateTokens.map((token) => (
                <code key={token} className="comms-token-chip">{`{{${token}}}`}</code>
              ))}
            </div>
          </aside>
        </div>
      </article>

      <article className="card stack">
        <div className="page-header">
          <div>
            <h3>Manual campaign</h3>
            <p className="muted">Pick a template, filter the event audience, preview recipients, then send.</p>
          </div>
          <div className="card-actions">
            <button className="ghost" type="button" onClick={() => void loadPreview()} disabled={previewLoading}>
              {previewLoading ? 'Loading…' : 'Preview audience'}
            </button>
            <button className="primary" type="button" disabled={!selectedTemplate || sendingCampaign} onClick={() => void handleSendCampaign()}>
              {sendingCampaign ? 'Sending…' : 'Send campaign'}
            </button>
          </div>
        </div>

        <div className="form-grid comms-filter-grid">
          <label className="form-field">
            <span>Template</span>
            <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
              <option value="">Select template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Status</span>
            <select value={filter.status || ''} onChange={(e) => setFilter((prev) => ({ ...prev, status: e.target.value || undefined }))}>
              <option value="">All</option>
              <option value="deposit_pending">Deposit pending</option>
              <option value="deposit_paid">Deposit paid</option>
              <option value="confirmed">Confirmed</option>
              <option value="balance_pending">Balance pending</option>
              <option value="fully_paid">Fully paid</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="form-field">
            <span>Deposit state</span>
            <select value={filter.deposit_state || ''} onChange={(e) => setFilter((prev) => ({ ...prev, deposit_state: e.target.value || undefined }))}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="form-field">
            <span>Balance state</span>
            <select value={filter.balance_state || ''} onChange={(e) => setFilter((prev) => ({ ...prev, balance_state: e.target.value || undefined }))}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>

        {selectedTemplate ? (
          <div className="comms-template-preview-grid">
            <div className="comms-template-preview">
              <strong>{selectedTemplate.name}</strong>
              <div className="muted">{selectedTemplate.subject_template}</div>
            </div>
            <div className="comms-rendered-preview">
              <div className="comms-rendered-preview-header">
                <span className="registration-stat-label">Rendered preview</span>
                <span className="muted">
                  {audiencePreview?.count ? `${audiencePreview.count} recipients match` : 'Run preview to confirm the audience'}
                </span>
              </div>
              <div className="comms-rendered-preview-block">
                <span className="registration-stat-label">Subject</span>
                <strong>{renderedSubjectPreview || 'Select a template'}</strong>
              </div>
              <div className="comms-rendered-preview-block">
                <span className="registration-stat-label">Body</span>
                <pre className="comms-rendered-preview-body">{renderedBodyPreview || 'Select a template'}</pre>
              </div>
            </div>
          </div>
        ) : null}

        <div className="registration-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Status</th>
                <th>Deposit</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {(audiencePreview?.recipients || []).slice(0, 12).map((recipient) => (
                <tr key={recipient.registration_id}>
                  <td>
                    <div className="registration-table-primary">
                      <strong>{recipient.participant_name}</strong>
                      <span className="muted">{recipient.participant_email}</span>
                    </div>
                  </td>
                  <td><span className="badge neutral">{recipient.status.replace(/_/g, ' ')}</span></td>
                  <td><span className={`badge ${recipient.deposit_state === 'overdue' ? 'danger' : recipient.deposit_state === 'paid' ? 'success' : 'neutral'}`}>{recipient.deposit_state}</span></td>
                  <td><span className={`badge ${recipient.balance_state === 'overdue' ? 'danger' : recipient.balance_state === 'paid' ? 'success' : 'neutral'}`}>{recipient.balance_state}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!audiencePreview ? <p className="muted">Run audience preview to see recipients.</p> : null}
      </article>

      <article className="card stack">
        <h3>Campaign history</h3>
        {campaigns.length === 0 ? (
          <p className="muted">No campaigns sent yet.</p>
        ) : (
          <div className="registration-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Recipients</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>{formatEventLocal(campaign.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>{campaign.template_name || 'Template removed'}</td>
                    <td><span className="badge success">{campaign.status}</span></td>
                    <td>{campaign.delivery_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
};

export default EventCommsPage;

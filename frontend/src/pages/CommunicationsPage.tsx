import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { copyEvent, deleteEvent, Event, getEvent, listEvents } from '../api/events';
import {
  AudienceFilter,
  AudiencePreviewResponse,
  Campaign,
  createCampaign,
  createEmailTemplate,
  getAudiencePreview,
  listEmailTemplates,
  listEventCampaigns,
  EmailTemplate,
  updateEmailTemplate
} from '../api/comms';
import CheckboxMultiSelect from '../components/CheckboxMultiSelect';
import { formatEventLocal, formatEventLocalDate, getEventLocalDateKey, getEventLocalDateKeyFromDate } from '../utils/eventDate';
import { roleOptions } from '../utils/roles';

type TemplateForm = {
  name: string;
  subject_template: string;
  body_template: string;
};

type CommunicationsPageProps = {
  fixedEventId?: number;
};

type AudienceRecipientWithEvent = NonNullable<AudiencePreviewResponse['recipients']>[number] & {
  event_id?: number;
};

const initialTemplateForm: TemplateForm = {
  name: '',
  subject_template: '',
  body_template: ''
};

const createTemplateEditorOption = '__new__';
const defaultAudienceRoles = ['Participant'];

const templateTokenGroups = [
  {
    label: 'Participant',
    tokens: ['participant_name', 'participant_email', 'registration_status']
  },
  {
    label: 'Event',
    tokens: ['event_name', 'event_location', 'event_starts_at', 'public_registration_link']
  },
  {
    label: 'Payments',
    tokens: [
      'total_amount',
      'currency',
      'deposit_amount',
      'deposit_state',
      'deposit_due_at',
      'deposit_paid_at',
      'main_invoice_amount',
      'main_invoice_state',
      'main_invoice_due_at',
      'main_invoice_paid_at'
    ]
  }
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

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const computePaymentState = (
  state?: string | null,
  paidAt?: string | null,
  dueAt?: string | null,
  status?: string
) : 'pending' | 'paid' | 'waived' | 'overdue' | 'none' => {
  if (state === 'waived') return 'waived';
  if (paidAt) return 'paid';
  if (!dueAt) return 'none';
  if (status === 'cancelled') return 'none';
  return getEventLocalDateKey(dueAt) < getEventLocalDateKeyFromDate(new Date()) ? 'overdue' : 'pending';
};

const badgeClassForCommsPaymentState = (state: 'pending' | 'paid' | 'waived' | 'overdue' | 'none') => {
  if (state === 'paid') return 'badge success';
  if (state === 'waived') return 'badge payment-status-badge-waived';
  if (state === 'overdue') return 'badge registration-status-badge registration-status-badge-pending';
  return 'badge neutral';
};

const badgeClassForCommsRegistrationStatus = (status: string) => {
  if (status === 'completed') return 'badge success';
  if (status === 'expired' || status === 'cancelled') return 'badge danger';
  return 'badge neutral';
};

const getRecipientKey = (recipient: AudienceRecipientWithEvent) =>
  `${recipient.event_id || 'event'}-${recipient.registration_id}`;

const sortAudienceRecipients = (recipients: AudienceRecipientWithEvent[]) =>
  [...recipients].sort((a, b) => {
    const nameCompare = (a.participant_name || '').localeCompare(b.participant_name || '', undefined, {
      sensitivity: 'base'
    });
    if (nameCompare !== 0) return nameCompare;
    return (a.participant_email || '').localeCompare(b.participant_email || '', undefined, {
      sensitivity: 'base'
    });
  });

const sortAddableRecipients = (recipients: AudienceRecipientWithEvent[]) =>
  [...recipients].sort((a, b) => {
    const nameCompare = (a.participant_name || '').localeCompare(b.participant_name || '', undefined, {
      sensitivity: 'base'
    });
    if (nameCompare !== 0) return nameCompare;
    return (a.participant_email || '').localeCompare(b.participant_email || '', undefined, {
      sensitivity: 'base'
    });
  });

const addableRecipientOptionLabel = (recipient: AudienceRecipientWithEvent, eventName?: string) => {
  const parts = [
    recipient.participant_name || 'Unnamed participant',
    recipient.participant_email || 'No email',
    recipient.status.replace(/_/g, ' ')
  ];
  if (eventName) parts.push(eventName);
  return parts.join(' • ');
};

const CommunicationsPage = ({ fixedEventId }: CommunicationsPageProps) => {
  const navigate = useNavigate();
  const eventScoped = Number.isFinite(fixedEventId);
  const [eventData, setEventData] = useState<Event | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreviewResponse | null>(null);
  const [manualAddOptions, setManualAddOptions] = useState<AudienceRecipientWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplateEditorId, setSelectedTemplateEditorId] = useState(createTemplateEditorOption);
  const [selectedPreviewRecipientKey, setSelectedPreviewRecipientKey] = useState<string | null>(null);
  const [manualAddRegistrationId, setManualAddRegistrationId] = useState('');
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>(() =>
    fixedEventId ? [fixedEventId] : []
  );
  const [filter, setFilter] = useState<AudienceFilter>({ roles: defaultAudienceRoles });
  const [templateForm, setTemplateForm] = useState<TemplateForm>(initialTemplateForm);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [openSections, setOpenSections] = useState({
    campaign: true,
    templates: true,
    history: true
  });
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const subjectTemplateRef = useRef<HTMLInputElement | null>(null);
  const bodyTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const activeTemplateFieldRef = useRef<'subject_template' | 'body_template' | null>(null);

  const availableEvents = useMemo(() => {
    if (eventScoped) {
      return eventData ? [eventData] : [];
    }
    return events;
  }, [eventData, eventScoped, events]);

  const effectiveEventIds = useMemo(() => {
    if (eventScoped && fixedEventId) return [fixedEventId];
    if (selectedEventIds.length > 0) return selectedEventIds;
    return availableEvents.map((event) => event.id);
  }, [availableEvents, eventScoped, fixedEventId, selectedEventIds]);

  const eventMap = useMemo(
    () => new Map(availableEvents.map((event) => [event.id, event])),
    [availableEvents]
  );
  const visibleCampaigns = useMemo(() => {
    if (eventScoped) return campaigns;
    const eventIdSet = new Set(effectiveEventIds);
    return campaigns.filter((campaign) => campaign.event_id && eventIdSet.has(campaign.event_id));
  }, [campaigns, effectiveEventIds, eventScoped]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const insertPlaceholderToken = (token: string) => {
    const placeholder = `{{${token}}}`;
    const activeField = activeTemplateFieldRef.current;
    if (!activeField) return;

    const target =
      activeField === 'subject_template' ? subjectTemplateRef.current : bodyTemplateRef.current;
    if (!target) return;

    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;

    setTemplateForm((prev) => {
      const currentValue = prev[activeField];
      return {
        ...prev,
        [activeField]: `${currentValue.slice(0, start)}${placeholder}${currentValue.slice(end)}`
      };
    });

    requestAnimationFrame(() => {
      const nextTarget =
        activeField === 'subject_template' ? subjectTemplateRef.current : bodyTemplateRef.current;
      if (!nextTarget) return;
      const nextPosition = start + placeholder.length;
      nextTarget.focus();
      nextTarget.setSelectionRange(nextPosition, nextPosition);
    });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextEvents, nextTemplates, nextEvent] = await Promise.all([
          eventScoped ? Promise.resolve<Event[]>([]) : listEvents(),
          listEmailTemplates(),
          fixedEventId ? getEvent(fixedEventId) : Promise.resolve<Event | null>(null)
        ]);
        if (cancelled) return;

        const resolvedEvents = eventScoped && nextEvent ? [nextEvent] : nextEvents;
        const campaignResponses = await Promise.all(
          resolvedEvents.map((event) => listEventCampaigns(event.id))
        );
        if (cancelled) return;

        setEventData(nextEvent);
        setEvents(nextEvents);
        setTemplates(nextTemplates);
        setCampaigns(
          campaignResponses
            .flat()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        );
        if (nextTemplates.length > 0) {
          setSelectedTemplateId(String(nextTemplates[0].id));
          setSelectedTemplateEditorId(String(nextTemplates[0].id));
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
  }, [eventScoped, fixedEventId]);

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

  useEffect(() => {
    let cancelled = false;
    const loadManualAddOptions = async () => {
      if (effectiveEventIds.length === 0) {
        setManualAddOptions([]);
        return;
      }
      try {
        const previewGroups = await Promise.all(
          effectiveEventIds.map(async (eventId) => {
            const preview = await getAudiencePreview(eventId, {});
            return preview.recipients.map((recipient) => ({
              ...recipient,
              event_id: eventId
            }));
          })
        );
        if (cancelled) return;
        setManualAddOptions(sortAddableRecipients(previewGroups.flat()));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load add-recipient options');
        }
      }
    };
    void loadManualAddOptions();
    return () => {
      cancelled = true;
    };
  }, [effectiveEventIds]);

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      if (effectiveEventIds.length === 0) {
        setAudiencePreview({ count: 0, recipients: [] });
        return;
      }
      setPreviewLoading(true);
      setError(null);
      try {
        const previews = await Promise.all(
          effectiveEventIds.map(async (eventId) => {
            const preview = await getAudiencePreview(eventId, filter);
            return {
              count: preview.count,
              recipients: preview.recipients.map((recipient) => ({
                ...recipient,
                event_id: eventId
              }))
            };
          })
        );
        if (cancelled) return;
        const seenRecipientKeys = new Set<string>();
        const recipients = previews.flatMap((preview) =>
          preview.recipients.filter((recipient) => {
            const recipientKey = getRecipientKey(recipient);
            if (seenRecipientKeys.has(recipientKey)) {
              return false;
            }
            seenRecipientKeys.add(recipientKey);
            return true;
          })
        ) as AudienceRecipientWithEvent[];
        const sortedRecipients = sortAudienceRecipients(recipients);
        setAudiencePreview({
          count: sortedRecipients.length,
          recipients: sortedRecipients
        });
        setSelectedPreviewRecipientKey((prev) => {
          if (sortedRecipients.length === 0) return null;
          if (prev && sortedRecipients.some((recipient) => getRecipientKey(recipient) === prev)) return prev;
          return getRecipientKey(sortedRecipients[0]);
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load audience preview');
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [effectiveEventIds, filter]);

  const handleDelete = async () => {
    if (!fixedEventId) return;
    if (!window.confirm('Delete this event?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteEvent(fixedEventId);
      navigate('/events');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async () => {
    if (!fixedEventId || copying) return;
    setCopying(true);
    setMessage(null);
    try {
      const cloned = await copyEvent(fixedEventId);
      navigate(`/events/${cloned.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to copy event');
    } finally {
      setCopying(false);
    }
  };

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === Number(selectedTemplateId)) || null,
    [selectedTemplateId, templates]
  );

  const selectedTemplateForEditor = useMemo(
    () => templates.find((template) => template.id === Number(selectedTemplateEditorId)) || null,
    [selectedTemplateEditorId, templates]
  );

  useEffect(() => {
    if (selectedTemplateEditorId === createTemplateEditorOption) {
      setTemplateForm(initialTemplateForm);
      return;
    }
    if (selectedTemplateForEditor) {
      setTemplateForm({
        name: selectedTemplateForEditor.name,
        subject_template: selectedTemplateForEditor.subject_template,
        body_template: selectedTemplateForEditor.body_template
      });
    }
  }, [selectedTemplateEditorId, selectedTemplateForEditor]);

  const derivedTemplateKey = useMemo(() => slugify(templateForm.name), [templateForm.name]);

  const templateKeyDuplicate = useMemo(
    () =>
      !!derivedTemplateKey &&
      templates.some(
        (template) =>
          template.key === derivedTemplateKey &&
          String(template.id) !== selectedTemplateEditorId
      ),
    [derivedTemplateKey, selectedTemplateEditorId, templates]
  );

  const previewRecipient = useMemo(() => {
    const recipients = audiencePreview?.recipients as AudienceRecipientWithEvent[] | undefined;
    if (!recipients || recipients.length === 0) return null;
    if (selectedPreviewRecipientKey) {
      return recipients.find((recipient) => getRecipientKey(recipient) === selectedPreviewRecipientKey) || recipients[0];
    }
    return recipients[0];
  }, [audiencePreview?.recipients, selectedPreviewRecipientKey]);
  const previewEvent = previewRecipient?.event_id
    ? eventMap.get(previewRecipient.event_id) || null
    : eventScoped
      ? eventData
      : effectiveEventIds.length === 1
        ? eventMap.get(effectiveEventIds[0]) || null
        : null;

  const templatePreviewValues = useMemo(() => {
    const previewEventData = previewEvent || eventData;
    const totalAmount =
      Number(previewEventData?.deposit_amount || 0) + Number(previewEventData?.main_invoice_amount || 0);
    return {
      participant_name: previewRecipient?.participant_name || 'Sample participant',
      participant_email: previewRecipient?.participant_email || 'participant@example.com',
      registration_status: previewRecipient?.status?.replace(/_/g, ' ') || 'deposit pending',
      deposit_due_at: previewRecipient?.deposit_due_at
        ? formatEventLocalDate(previewRecipient.deposit_due_at)
        : 'Apr 6, 2026',
      deposit_paid_at: previewRecipient?.deposit_paid_at
        ? formatEventLocalDate(previewRecipient.deposit_paid_at)
        : '',
      main_invoice_due_at: previewRecipient?.main_invoice_due_at
        ? formatEventLocalDate(previewRecipient.main_invoice_due_at)
        : previewEventData?.main_invoice_deadline
          ? formatEventLocalDate(previewEventData.main_invoice_deadline)
          : 'TBD',
      main_invoice_paid_at: previewRecipient?.main_invoice_paid_at
        ? formatEventLocalDate(previewRecipient.main_invoice_paid_at)
        : '',
      deposit_state: previewRecipient?.deposit_state || 'pending',
      main_invoice_state: previewRecipient?.main_invoice_state || 'pending',
      event_name: previewEventData?.name || 'Innhopp event',
      event_location: previewEventData?.location || 'Location TBD',
      event_starts_at: previewEventData?.starts_at
        ? formatEventLocal(previewEventData.starts_at, { dateStyle: 'full', timeStyle: 'short' })
        : 'TBD',
      deposit_amount: formatMoney(previewEventData?.deposit_amount, previewEventData?.currency) || 'TBD',
      main_invoice_amount: formatMoney(previewEventData?.main_invoice_amount, previewEventData?.currency) || 'TBD',
      total_amount: totalAmount > 0 ? formatMoney(totalAmount, previewEventData?.currency) : 'TBD',
      currency: (previewEventData?.currency || 'EUR').trim().toUpperCase() || 'EUR',
      public_registration_link: previewEventData?.public_registration_slug
        ? `/register/${previewEventData.public_registration_slug}`
        : 'No public link'
    };
  }, [eventData, previewEvent, previewRecipient]);

  const renderedCampaignSubjectPreview = useMemo(() => {
    if (!selectedTemplate) return '';
    return renderTemplatePreview(selectedTemplate.subject_template, templatePreviewValues);
  }, [selectedTemplate, templatePreviewValues]);

  const renderedCampaignBodyPreview = useMemo(() => {
    if (!selectedTemplate) return '';
    return renderTemplatePreview(selectedTemplate.body_template, templatePreviewValues);
  }, [selectedTemplate, templatePreviewValues]);

  const renderedEditorSubjectPreview = useMemo(
    () => renderTemplatePreview(templateForm.subject_template, templatePreviewValues),
    [templateForm.subject_template, templatePreviewValues]
  );

  const renderedEditorBodyPreview = useMemo(
    () => renderTemplatePreview(templateForm.body_template, templatePreviewValues),
    [templateForm.body_template, templatePreviewValues]
  );

  const handleSaveTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingTemplate(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        key: derivedTemplateKey,
        name: templateForm.name,
        subject_template: templateForm.subject_template,
        body_template: templateForm.body_template,
        audience_type: 'event_registrations',
        enabled: true
      };
      if (selectedTemplateEditorId === createTemplateEditorOption) {
        const template = await createEmailTemplate(payload);
        setTemplates((prev) => [template, ...prev]);
        setSelectedTemplateId(String(template.id));
        setSelectedTemplateEditorId(String(template.id));
      } else {
        const template = await updateEmailTemplate(Number(selectedTemplateEditorId), payload);
        setTemplates((prev) => prev.map((current) => (current.id === template.id ? template : current)));
        if (selectedTemplateId === String(template.id)) {
          setSelectedTemplateId(String(template.id));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleSendCampaign = async () => {
    if (!selectedTemplateId || effectiveEventIds.length === 0) return;
    setSendingCampaign(true);
    setError(null);
    setMessage(null);
    try {
      const nextCampaigns = await Promise.all(
        effectiveEventIds.map((eventId) =>
          createCampaign({
            event_id: eventId,
            template_id: Number(selectedTemplateId),
            mode: 'manual',
            filter
          })
        )
      );
      setCampaigns((prev) =>
        [...nextCampaigns, ...prev].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send campaign');
    } finally {
      setSendingCampaign(false);
    }
  };

  const handleRecipientRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    recipientKey: string
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelectedPreviewRecipientKey(recipientKey);
  };

  const handleRemoveRecipient = (registrationId: number) => {
    setFilter((prev) => ({
      ...prev,
      included_registration_ids: (prev.included_registration_ids || []).filter((id) => id !== registrationId),
      excluded_registration_ids: [...new Set([...(prev.excluded_registration_ids || []), registrationId])]
    }));
    setSelectedPreviewRecipientKey((prev) => {
      if (!prev) return prev;
      return prev.endsWith(`-${registrationId}`) ? null : prev;
    });
  };

  const handleAddRecipient = () => {
    const registrationId = Number(manualAddRegistrationId);
    if (!Number.isFinite(registrationId) || registrationId <= 0) return;
    setFilter((prev) => ({
      ...prev,
      excluded_registration_ids: (prev.excluded_registration_ids || []).filter((id) => id !== registrationId),
      included_registration_ids: [...new Set([...(prev.included_registration_ids || []), registrationId])]
    }));
    setManualAddRegistrationId('');
  };

  const clearAudienceOverrides = () => {
    setFilter((prev) => ({
      ...prev,
      included_registration_ids: undefined,
      excluded_registration_ids: undefined
    }));
    setManualAddRegistrationId('');
  };

  const excludedRegistrationIdSet = useMemo(
    () => new Set(filter.excluded_registration_ids || []),
    [filter.excluded_registration_ids]
  );

  const audienceRecipientIdSet = useMemo(
    () => new Set((audiencePreview?.recipients || []).map((recipient) => recipient.registration_id)),
    [audiencePreview?.recipients]
  );

  const addableRegistrations = useMemo(
    () =>
      manualAddOptions.filter(
        (recipient) =>
          !audienceRecipientIdSet.has(recipient.registration_id) || excludedRegistrationIdSet.has(recipient.registration_id)
      ),
    [audienceRecipientIdSet, excludedRegistrationIdSet, manualAddOptions]
  );

  if (loading) return <p className="muted">Loading comms…</p>;
  if (error && eventScoped && !eventData) return <p className="error-text">{error}</p>;
  if (eventScoped && !eventData) return <p className="error-text">Event not found.</p>;

  return (
    <section className="stack">
      <header className="page-header">
        <div className="event-schedule-headline-text">
          <div className="event-header-top">
            <h2 className="event-detail-title">
              {eventScoped && eventData ? `${eventData.name}: Communications` : 'Communications'}
            </h2>
          </div>
          <p className="event-location">
            {eventScoped
              ? eventData?.location || 'Location TBD'
              : selectedEventIds.length > 0
                ? `${selectedEventIds.length} events selected`
                : `${availableEvents.length} events available`}
          </p>
          {eventScoped && eventData ? (
            <div className="event-detail-header-badges">
              <span className={`badge status-${eventData.status}`}>{eventData.status}</span>
            </div>
          ) : null}
        </div>
        {eventScoped && eventData ? (
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
                <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); handleCopy(); }} disabled={copying}>{copying ? 'Copying…' : 'Copy'}</button>
                <button className="event-schedule-menu-item danger" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); handleDelete(); }} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
                <button className="event-schedule-menu-item" type="button" role="menuitem" onClick={() => { setActionMenuOpen(false); navigate('/events'); }}>Back</button>
              </div>
            )}
          </div>
        ) : null}
      </header>

      {message && <p className="error-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="registration-stats-grid comms-stats-grid">
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Templates</span>
          <strong>{templates.length}</strong>
        </article>
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Campaigns</span>
          <strong>{visibleCampaigns.length}</strong>
        </article>
        <article className="card registration-stat-card">
          <span className="registration-stat-label">Preview audience</span>
          <strong>{audiencePreview?.count ?? 0}</strong>
        </article>
      </section>

      <article className="card stack">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('campaign')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('campaign');
              }}
            >
              {openSections.campaign ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Email Campaign</h3>
          </div>
        </header>

        {openSections.campaign && (
          <>
            <div className="form-grid comms-filter-grid">
              {!eventScoped ? (
                <label className="form-field">
                  <span>Events</span>
                  <CheckboxMultiSelect
                    summary={
                      selectedEventIds.length === 0
                        ? 'All events'
                        : selectedEventIds.length === 1
                          ? (availableEvents.find((event) => event.id === selectedEventIds[0])?.name || '1 event selected')
                          : `${selectedEventIds.length} events selected`
                    }
                    options={availableEvents.map((event) => ({
                      value: String(event.id),
                      label: event.name
                    }))}
                    selectedValues={selectedEventIds.map(String)}
                    onChange={(values) => setSelectedEventIds(values.map(Number))}
                    clearLabel="Clear event filters"
                    emptyLabel="No events"
                  />
                </label>
              ) : null}
              <label className="form-field">
                <span>Template</span>
                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                  <option value="">Select template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {selectedTemplate ? (
              <div className="comms-preview-column">
                <span className="comms-preview-label">Rendered preview</span>
                <div className="comms-rendered-preview">
                  <div className="comms-rendered-preview-block">
                    <span className="registration-stat-label">Subject</span>
                    <strong>{renderedCampaignSubjectPreview || 'Select a template'}</strong>
                  </div>
                  <div className="comms-rendered-preview-block">
                    <span className="registration-stat-label">Body</span>
                    <pre className="comms-rendered-preview-body">{renderedCampaignBodyPreview || 'Select a template'}</pre>
                  </div>
                </div>
                <div className="detail-actions">
                  <button
                    className="primary"
                    type="button"
                    disabled={!selectedTemplate || sendingCampaign || effectiveEventIds.length === 0}
                    onClick={() => void handleSendCampaign()}
                  >
                    {sendingCampaign ? 'Sending…' : 'Send campaign'}
                  </button>
                  <span className="badge neutral">
                    {previewLoading
                      ? 'Updating audience…'
                      : audiencePreview?.count
                        ? `${audiencePreview.count} recipients`
                        : '0 recipients'}
                  </span>
                  {(filter.included_registration_ids?.length || filter.excluded_registration_ids?.length) ? (
                    <span className="badge neutral">
                      {`Overrides: ${filter.included_registration_ids?.length || 0} added, ${filter.excluded_registration_ids?.length || 0} removed`}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="form-grid comms-filter-grid">
              <label className="form-field">
                <span>Status</span>
                <select value={filter.status || ''} onChange={(e) => setFilter((prev) => ({ ...prev, status: e.target.value || undefined }))}>
                  <option value="">All</option>
                  <option value="deposit_pending">Deposit pending</option>
                  <option value="deposit_paid">Deposit paid</option>
                  <option value="main_invoice_pending">Main Invoice pending</option>
                  <option value="completed">Completed</option>
                  <option value="waitlisted">Waitlisted</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
              <label className="form-field">
                <span>Role</span>
                <CheckboxMultiSelect
                  summary={
                    !filter.roles || filter.roles.length === 0
                      ? 'All roles'
                      : filter.roles.length === 1
                        ? filter.roles[0]
                        : `${filter.roles.length} roles selected`
                  }
                  options={roleOptions.map((role) => ({
                    value: role,
                    label: role
                  }))}
                  selectedValues={filter.roles || []}
                  onChange={(values) =>
                    setFilter((prev) => ({
                      ...prev,
                      roles: values.length > 0 ? values : undefined
                    }))
                  }
                  clearLabel="Clear role filters"
                  emptyLabel="No roles"
                />
              </label>
              <label className="form-field">
                <span>Deposit state</span>
                <select value={filter.deposit_state || ''} onChange={(e) => setFilter((prev) => ({ ...prev, deposit_state: e.target.value || undefined }))}>
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="waived">Waived</option>
                  <option value="overdue">Overdue</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="form-field">
                <span>Main Invoice state</span>
                <select
                  value={filter.main_invoice_state || ''}
                  onChange={(e) => setFilter((prev) => ({ ...prev, main_invoice_state: e.target.value || undefined }))}
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="waived">Waived</option>
                  <option value="overdue">Overdue</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>

            <div className="registration-table-wrap comms-audience-table-wrap">
              <table className="table comms-audience-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Participant</th>
                    <th aria-label="Actions" />
                    <th>Status</th>
                    <th>Deposit</th>
                    <th>Main Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {(audiencePreview?.recipients || []).map((recipient, index) => {
                    const recipientKey = getRecipientKey(recipient);
                    const depositState = computePaymentState(
                      recipient.deposit_state,
                      recipient.deposit_paid_at,
                      recipient.deposit_due_at,
                      recipient.status
                    );
                    const mainInvoiceState = computePaymentState(
                      recipient.main_invoice_state,
                      recipient.main_invoice_paid_at,
                      recipient.main_invoice_due_at,
                      recipient.status
                    );

                    return (
                      <tr
                        key={recipientKey}
                        className={`registration-table-row comms-audience-row${previewRecipient && getRecipientKey(previewRecipient) === recipientKey ? ' is-selected' : ''}`}
                        tabIndex={0}
                        onClick={() => setSelectedPreviewRecipientKey(recipientKey)}
                        onKeyDown={(event) => handleRecipientRowKeyDown(event, recipientKey)}
                      >
                        <td>{index + 1}</td>
                        <td>
                          <div className="registration-table-primary">
                            <strong>{recipient.participant_name}</strong>
                            <span className="muted">{recipient.participant_email}</span>
                          </div>
                        </td>
                        <td>
                          <div
                            className="comms-audience-actions"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <Link
                              to={`/participants/${recipient.participant_id}`}
                              className="comms-audience-action-link"
                              aria-label={`Open profile for ${recipient.participant_name}`}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 1.79-8 4v1h16v-1c0-2.21-3.58-4-8-4Z" />
                              </svg>
                              <span>Profile</span>
                            </Link>
                            <Link
                              to={`/registrations/${recipient.registration_id}`}
                              className="comms-audience-action-link"
                              aria-label={`Open registration for ${recipient.participant_name}`}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm6 1.5V9h4.5M9 13h6M9 17h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <span>Registration</span>
                            </Link>
                            <button
                              className="comms-audience-action-link"
                              type="button"
                              aria-label={`Remove ${recipient.participant_name} from this audience`}
                              onClick={() => handleRemoveRecipient(recipient.registration_id)}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path
                                  d="M6 7h12M9.5 7V5.8c0-.44.36-.8.8-.8h3.4c.44 0 .8.36.8.8V7M8.5 10v7M12 10v7M15.5 10v7M7.5 7l.7 11.1c.03.48.42.85.9.85h5.8c.48 0 .87-.37.9-.85L16.5 7"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span>Remove</span>
                            </button>
                          </div>
                        </td>
                        <td>
                          <span className={badgeClassForCommsRegistrationStatus(recipient.status)}>
                            {recipient.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <span className={badgeClassForCommsPaymentState(depositState)}>
                            {depositState}
                          </span>
                        </td>
                        <td>
                          <span className={badgeClassForCommsPaymentState(mainInvoiceState)}>
                            {mainInvoiceState}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="form-grid comms-filter-grid">
              <label className="form-field comms-field-span">
                <span>Add recipient</span>
                <div className="comms-add-recipient-row">
                  <select
                    value={manualAddRegistrationId}
                    onChange={(e) => setManualAddRegistrationId(e.target.value)}
                  >
                    <option value="">Select registration</option>
                    {addableRegistrations.map((recipient) => (
                      <option key={getRecipientKey(recipient)} value={recipient.registration_id}>
                        {addableRecipientOptionLabel(
                          recipient,
                          !eventScoped && recipient.event_id ? eventMap.get(recipient.event_id)?.name : undefined
                        )}
                      </option>
                    ))}
                  </select>
                  <div className="detail-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={handleAddRecipient}
                      disabled={!manualAddRegistrationId}
                    >
                      Add recipient
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      onClick={clearAudienceOverrides}
                      disabled={!filter.included_registration_ids?.length && !filter.excluded_registration_ids?.length}
                    >
                      Clear overrides
                    </button>
                  </div>
                </div>
              </label>
            </div>
            {!audiencePreview && previewLoading ? <p className="muted">Loading audience…</p> : null}
          </>
        )}
      </article>

      <article className="card stack">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('templates')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('templates');
              }}
            >
              {openSections.templates ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Email Templates</h3>
          </div>
        </header>
        {openSections.templates && (
          <div className="stack">
            <div className="comms-template-top-grid">
              <form className="stack" onSubmit={handleSaveTemplate}>
                <div className="form-grid comms-template-grid">
                  <label className="form-field comms-field-span">
                    <span>Template to edit</span>
                    <select
                      value={selectedTemplateEditorId}
                      onChange={(e) => setSelectedTemplateEditorId(e.target.value)}
                    >
                      <option value={createTemplateEditorOption}>Create new template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Name</span>
                    <input value={templateForm.name} onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Deposit reminder" />
                  </label>
                  <label className="form-field comms-field-span">
                    <span>Subject template</span>
                    <input
                      ref={subjectTemplateRef}
                      value={templateForm.subject_template}
                      onFocus={() => {
                        activeTemplateFieldRef.current = 'subject_template';
                      }}
                      onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject_template: e.target.value }))}
                      placeholder="Deposit reminder for {{event_name}}"
                    />
                  </label>
                  <label className="form-field comms-field-span">
                    <span>Body template</span>
                    <textarea
                      ref={bodyTemplateRef}
                      className="comms-body-template-textarea"
                      value={templateForm.body_template}
                      onFocus={() => {
                        activeTemplateFieldRef.current = 'body_template';
                      }}
                      onChange={(e) => setTemplateForm((prev) => ({ ...prev, body_template: e.target.value }))}
                      placeholder={'Hi {{participant_name}},\nYour deposit for {{event_name}} is due on {{deposit_due_at}}.'}
                    />
                  </label>
                </div>
                {templateKeyDuplicate ? (
                  <p className="error-text comms-inline-note">A template with this generated name/key already exists.</p>
                ) : null}
                <div className="detail-actions">
                  <button
                    className="primary"
                    type="submit"
                    disabled={creatingTemplate || !derivedTemplateKey || templateKeyDuplicate}
                  >
                    {creatingTemplate
                      ? 'Saving…'
                      : selectedTemplateEditorId === createTemplateEditorOption
                        ? 'Create template'
                        : 'Save template'}
                  </button>
                </div>
              </form>

              <div className="comms-preview-column">
                <span className="comms-preview-label">Placeholder reference</span>
                <section className="comms-preview-panel">
                  <p className="muted comms-inline-note">Click a placeholder to insert it to the template.</p>
                  <div className="comms-token-groups">
                    {templateTokenGroups.map((group) => (
                      <section key={group.label} className="comms-token-group">
                        <h4 className="comms-token-group-title">{group.label}</h4>
                        <div className="comms-token-list">
                          {group.tokens.map((token) => (
                            <button
                              key={token}
                              type="button"
                              className="comms-token-chip"
                              onMouseDown={(e) => {
                                e.preventDefault();
                              }}
                              onClick={() => insertPlaceholderToken(token)}
                            >
                              {`{{${token}}}`}
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            <div className="comms-preview-column">
              <span className="comms-preview-label">
                Rendered preview: {templateForm.name.trim() || 'No template selected'}
              </span>
              <aside className="comms-rendered-preview">
                <div className="comms-rendered-preview-block">
                  <span className="field-label">Subject</span>
                  <strong>{renderedEditorSubjectPreview || 'No subject preview yet'}</strong>
                </div>
                <div className="comms-rendered-preview-block">
                  <span className="field-label">Body</span>
                  <pre className="comms-rendered-preview-body">
                    {renderedEditorBodyPreview || 'No body preview yet'}
                  </pre>
                </div>
              </aside>
            </div>
          </div>
        )}
      </article>

      <article className="card stack">
        <header
          className="card-header event-detail-section-header"
          onClick={() => toggleSection('history')}
        >
          <div className="event-detail-section-header-main">
            <button
              className="ghost"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSection('history');
              }}
            >
              {openSections.history ? '▾' : '▸'}
            </button>
            <h3 className="event-detail-section-title">Campaign history</h3>
          </div>
        </header>
        {openSections.history && (
          <>
            {visibleCampaigns.length === 0 ? (
              <p className="muted">No campaigns sent yet.</p>
            ) : (
              <div className="registration-table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Created</th>
                      {!eventScoped ? <th>Event</th> : null}
                      <th>Template</th>
                      <th>Status</th>
                      <th>Recipients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCampaigns.map((campaign) => (
                      <tr key={campaign.id}>
                        <td>{formatEventLocal(campaign.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        {!eventScoped ? <td>{eventMap.get(campaign.event_id || 0)?.name || 'Unknown event'}</td> : null}
                        <td>{campaign.template_name || 'Template removed'}</td>
                        <td><span className="badge success">{campaign.status}</span></td>
                        <td>{campaign.delivery_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  );
};

export default CommunicationsPage;

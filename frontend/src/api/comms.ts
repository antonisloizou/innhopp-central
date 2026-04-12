import { apiRequest } from './client';

export interface EmailTemplate {
  id: number;
  key: string;
  name: string;
  subject_template: string;
  body_template: string;
  audience_type: string;
  enabled: boolean;
  created_at: string;
}

export interface AudienceFilter {
  status?: string;
  deposit_state?: string;
  main_invoice_state?: string;
  roles?: string[];
  included_registration_ids?: number[];
  excluded_registration_ids?: number[];
}

export interface AudienceRecipient {
  registration_id: number;
  participant_id: number;
  participant_name: string;
  participant_email: string;
  status: string;
  deposit_due_at?: string | null;
  deposit_paid_at?: string | null;
  main_invoice_due_at?: string | null;
  main_invoice_paid_at?: string | null;
  deposit_state: string;
  main_invoice_state: string;
}

export interface AudiencePreviewResponse {
  count: number;
  recipients: AudienceRecipient[];
}

export interface EmailDelivery {
  id: number;
  campaign_id: number;
  registration_id?: number | null;
  email: string;
  subject: string;
  body: string;
  provider_message_id?: string | null;
  status: string;
  sent_at?: string | null;
  failed_at?: string | null;
  error_message?: string | null;
}

export interface Campaign {
  id: number;
  event_id?: number | null;
  template_id?: number | null;
  template_name?: string;
  mode: string;
  filter: AudienceFilter;
  scheduled_for?: string | null;
  status: string;
  created_by_account_id?: number | null;
  created_at: string;
  delivery_count: number;
  deliveries?: EmailDelivery[];
}

export interface CreateTemplatePayload {
  key: string;
  name: string;
  subject_template: string;
  body_template: string;
  audience_type?: string;
  enabled?: boolean;
}

export interface UpdateTemplatePayload extends CreateTemplatePayload {}

export interface CreateCampaignPayload {
  event_id: number;
  template_id: number;
  mode?: string;
  filter?: AudienceFilter;
}

export const listEmailTemplates = () => apiRequest<EmailTemplate[]>('/comms/templates');

export const createEmailTemplate = (payload: CreateTemplatePayload) =>
  apiRequest<EmailTemplate>('/comms/templates', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateEmailTemplate = (templateId: number, payload: UpdateTemplatePayload) =>
  apiRequest<EmailTemplate>(`/comms/templates/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const getAudiencePreview = (eventId: number, filter: AudienceFilter) => {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.deposit_state) params.set('deposit_state', filter.deposit_state);
  if (filter.main_invoice_state) params.set('main_invoice_state', filter.main_invoice_state);
  (filter.roles || []).forEach((role) => params.append('role', role));
  (filter.included_registration_ids || []).forEach((id) =>
    params.append('included_registration_id', String(id))
  );
  (filter.excluded_registration_ids || []).forEach((id) =>
    params.append('excluded_registration_id', String(id))
  );
  const query = params.toString();
  return apiRequest<AudiencePreviewResponse>(`/comms/events/${eventId}/audience-preview${query ? `?${query}` : ''}`);
};

export const listEventCampaigns = (eventId: number) =>
  apiRequest<Campaign[]>(`/comms/events/${eventId}/campaigns`);

export const createCampaign = (payload: CreateCampaignPayload) =>
  apiRequest<Campaign>('/comms/campaigns', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getCampaign = (campaignId: number) => apiRequest<Campaign>(`/comms/campaigns/${campaignId}`);

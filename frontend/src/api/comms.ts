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
  balance_state?: string;
}

export interface AudienceRecipient {
  registration_id: number;
  participant_id: number;
  participant_name: string;
  participant_email: string;
  status: string;
  deposit_due_at?: string | null;
  deposit_paid_at?: string | null;
  balance_due_at?: string | null;
  balance_paid_at?: string | null;
  deposit_state: string;
  balance_state: string;
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

export const getAudiencePreview = (eventId: number, filter: AudienceFilter) => {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.deposit_state) params.set('deposit_state', filter.deposit_state);
  if (filter.balance_state) params.set('balance_state', filter.balance_state);
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

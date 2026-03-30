import { apiRequest } from './client';

export type RegistrationStatus =
  | 'applied'
  | 'deposit_pending'
  | 'deposit_paid'
  | 'confirmed'
  | 'balance_pending'
  | 'fully_paid'
  | 'waitlisted'
  | 'cancelled'
  | 'expired';

export type RegistrationPaymentKind = 'deposit' | 'balance' | 'refund' | 'manual_adjustment';
export type RegistrationPaymentStatus = 'pending' | 'paid' | 'failed' | 'waived' | 'refunded';
export type RegistrationActivityType = 'note' | 'status_change' | 'payment_created' | 'payment_updated';

export interface RegistrationPayment {
  id: number;
  registration_id: number;
  kind: RegistrationPaymentKind;
  amount: string;
  currency: string;
  status: RegistrationPaymentStatus;
  due_at?: string | null;
  paid_at?: string | null;
  provider?: string | null;
  provider_ref?: string | null;
  recorded_by_account_id?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface RegistrationActivity {
  id: number;
  registration_id: number;
  type: RegistrationActivityType;
  summary: string;
  payload?: Record<string, unknown>;
  created_by_account_id?: number | null;
  created_at: string;
}

export interface Registration {
  id: number;
  event_id: number;
  event_name?: string;
  participant_id: number;
  participant_name?: string;
  participant_email?: string;
  status: RegistrationStatus;
  source?: string;
  registered_at: string;
  deposit_due_at?: string | null;
  deposit_paid_at?: string | null;
  balance_due_at?: string | null;
  balance_paid_at?: string | null;
  cancelled_at?: string | null;
  expired_at?: string | null;
  waitlist_position?: number | null;
  staff_owner_account_id?: number | null;
  tags: string[];
  internal_notes?: string;
  created_at: string;
  updated_at: string;
  payments?: RegistrationPayment[];
  activities?: RegistrationActivity[];
}

export interface CreateRegistrationPayload {
  participant_id: number;
  status?: RegistrationStatus;
  source?: string;
  registered_at?: string;
  deposit_due_at?: string;
  balance_due_at?: string;
  waitlist_position?: number;
  staff_owner_account_id?: number;
  tags?: string[];
  internal_notes?: string;
}

export interface UpdateRegistrationPayload {
  source?: string;
  deposit_due_at?: string;
  balance_due_at?: string;
  waitlist_position?: number;
  staff_owner_account_id?: number;
  tags?: string[];
  internal_notes?: string;
}

export interface UpdateRegistrationStatusPayload {
  status: RegistrationStatus;
}

export interface RegistrationPaymentPayload {
  kind?: RegistrationPaymentKind;
  amount: string;
  currency?: string;
  status?: RegistrationPaymentStatus;
  due_at?: string;
  paid_at?: string;
  provider?: string;
  provider_ref?: string;
  notes?: string;
}

export interface RegistrationActivityPayload {
  type?: RegistrationActivityType;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface PublicRegistrationEvent {
  id: number;
  name: string;
  location?: string | null;
  slots: number;
  starts_at: string;
  ends_at?: string | null;
  public_registration_slug: string;
  registration_open_at?: string | null;
  balance_deadline?: string | null;
  deposit_amount?: string | null;
  balance_amount?: string | null;
  currency: string;
  minimum_registrations: number;
  commercial_status: string;
  registration_available: boolean;
  registration_unavailable_reason?: string | null;
}

export interface PublicRegistrationPayload {
  full_name: string;
  email: string;
  phone?: string;
  experience_level?: string;
  emergency_contact?: string;
  whatsapp?: string;
  instagram?: string;
  citizenship?: string;
  date_of_birth?: string;
  jumper?: boolean;
  years_in_sport?: number;
  jump_count?: number;
  recent_jump_count?: number;
  license?: string;
}

export const listEventRegistrations = (eventId: number) =>
  apiRequest<Registration[]>(`/registrations/events/${eventId}`);

export const createEventRegistration = (eventId: number, payload: CreateRegistrationPayload) =>
  apiRequest<Registration>(`/registrations/events/${eventId}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getRegistration = (registrationId: number) =>
  apiRequest<Registration>(`/registrations/${registrationId}`);

export const updateRegistration = (registrationId: number, payload: UpdateRegistrationPayload) =>
  apiRequest<Registration>(`/registrations/${registrationId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const updateRegistrationStatus = (registrationId: number, payload: UpdateRegistrationStatusPayload) =>
  apiRequest<Registration>(`/registrations/${registrationId}/status`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createRegistrationPayment = (registrationId: number, payload: RegistrationPaymentPayload) =>
  apiRequest<Registration>(`/registrations/${registrationId}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateRegistrationPayment = (paymentId: number, payload: RegistrationPaymentPayload) =>
  apiRequest<Registration>(`/registrations/payments/${paymentId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const createRegistrationActivity = (registrationId: number, payload: RegistrationActivityPayload) =>
  apiRequest<Registration>(`/registrations/${registrationId}/activity`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getPublicRegistrationEvent = (slug: string) =>
  apiRequest<PublicRegistrationEvent>(`/registrations/public/events/${encodeURIComponent(slug)}`);

export const createPublicRegistration = (slug: string, payload: PublicRegistrationPayload) =>
  apiRequest<Registration>(`/registrations/public/events/${encodeURIComponent(slug)}/register`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

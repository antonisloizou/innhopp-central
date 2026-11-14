export type WhatsAppMode = 'same' | 'none' | 'different';

const trimmed = (value?: string | null) => String(value ?? '').trim();
const phoneIdentity = (value?: string | null) => trimmed(value).replace(/\D/g, '');

export const isWhatsAppOptOut = (value?: string | null) => trimmed(value).toUpperCase() === 'NO';

export const getWhatsAppMode = (phone?: string | null, whatsapp?: string | null): WhatsAppMode => {
  const whatsappValue = trimmed(whatsapp);
  if (isWhatsAppOptOut(whatsappValue)) return 'none';
  if (!whatsappValue) return 'same';
  const phoneValue = phoneIdentity(phone);
  return phoneValue && phoneValue === phoneIdentity(whatsappValue) ? 'same' : 'different';
};

export const effectiveWhatsApp = (phone?: string | null, whatsapp?: string | null) => {
  const mode = getWhatsAppMode(phone, whatsapp);
  if (mode === 'none') return '';
  return mode === 'same' ? trimmed(phone) : trimmed(whatsapp);
};

export const formatWhatsApp = (phone?: string | null, whatsapp?: string | null) =>
  isWhatsAppOptOut(whatsapp) ? "Don't use WhatsApp" : effectiveWhatsApp(phone, whatsapp);

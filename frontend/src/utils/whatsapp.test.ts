import { describe, expect, it } from 'vitest';
import { effectiveWhatsApp, formatWhatsApp, getWhatsAppMode } from './whatsapp';

describe('WhatsApp storage helpers', () => {
  it('treats blank and equivalent numbers as same as phone', () => {
    expect(getWhatsAppMode('+357 99 123456', '')).toBe('same');
    expect(getWhatsAppMode('+357 99 123456', '+35799123456')).toBe('same');
    expect(effectiveWhatsApp('+357 99 123456', '')).toBe('+357 99 123456');
  });

  it('recognizes opt-out and different-number values', () => {
    expect(getWhatsAppMode('+357 99 123456', ' no ')).toBe('none');
    expect(formatWhatsApp('+357 99 123456', 'NO')).toBe("Don't use WhatsApp");
    expect(getWhatsAppMode('+357 99 123456', '+47 12345678')).toBe('different');
  });
});

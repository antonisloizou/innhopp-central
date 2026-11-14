import { describe, expect, it } from 'vitest';
import { createParticipantExportXlsx } from './participantExport';
import { Event } from '../api/events';
import { ParticipantProfile } from '../api/participants';
import { Registration } from '../api/registrations';

const unzipStoredFiles = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    files.set(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)), decoder.decode(bytes.slice(contentStart, contentStart + size)));
    offset = contentStart + size;
  }
  return files;
};

const registration = (id: number, participantId: number, status: Registration['status'] = 'completed'): Registration => ({
  id,
  event_id: 7,
  participant_id: participantId,
  status,
  registered_at: '2026-01-01T10:00:00Z',
  tags: [],
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z'
});

const profile = (id: number, name: string, roles: string[], accountRoles: string[] = []): ParticipantProfile => ({
  id,
  full_name: name,
  email: `${name.toLowerCase()}@example.com`,
  roles,
  ratings: [],
  disciplines: [],
  other_air_sports: [],
  dietary_restrictions: [],
  accommodation: '',
  medical_expertise: [],
  hss_qualities: [],
  account_roles: accountRoles,
  created_at: '2026-01-01T10:00:00Z'
});

describe('createParticipantExportXlsx', () => {
  it('creates separate participant and staff sheets with the same columns', async () => {
    const blob = createParticipantExportXlsx({
      event: { id: 7, name: 'Test Event' } as Event,
      registrations: [
        { ...registration(1, 11), checklist: { waiver: true }, checklist_text: { waiver: 'Signed online' }, deposit_paid_at: '2026-01-02T12:30:00Z' },
        registration(2, 22),
        { ...registration(3, 33, 'cancelled'), cancelled_at: '2026-01-03T15:45:00Z' }
      ],
      profiles: [profile(11, 'Alex Participant', ['Participant', 'Skydiver']), profile(22, 'Sam Staff', ['Staff']), profile(33, 'Zed Cancelled', ['Participant'])]
    });
    const files = await unzipStoredFiles(blob);

    expect(files.get('xl/workbook.xml')).toContain('sheet name="Participants"');
    expect(files.get('xl/workbook.xml')).toContain('sheet name="Staff"');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('Alex Participant');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('Sam Staff');
    expect(files.get('xl/worksheets/sheet2.xml')).toContain('Sam Staff');
    expect(files.get('xl/worksheets/sheet2.xml')).not.toContain('Alex Participant');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('Profile complete');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('Account roles');
    expect(files.get('xl/worksheets/sheet2.xml')).not.toContain('Account roles');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('>Waiver</t>');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('Checklist:');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('Checklist note:');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('Signed online');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('2026-01-02');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('2026-01-02T12:30:00Z');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('Profile created');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('Registration source');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('Internal notes');
    expect(files.get('xl/worksheets/sheet1.xml')).not.toContain('Emergency contact</t>');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('>Phone</t>');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('>WhatsApp</t>');
    const participantSheet = files.get('xl/worksheets/sheet1.xml') || '';
    expect(participantSheet.indexOf('Zed Cancelled')).toBeGreaterThan(participantSheet.indexOf('Alex Participant'));
    expect(participantSheet).toContain('s="3"');
    expect(participantSheet.match(/<row r="3">(?:(?!<\/row>).)*s="4"/)).toBeTruthy();
    expect(participantSheet).not.toContain('>Participant</t>');
    const staffSheet = files.get('xl/worksheets/sheet2.xml') || '';
    expect(staffSheet).not.toContain('Registration status');
    expect(staffSheet).not.toContain('Registered date');
    expect(staffSheet).not.toContain('Internal notes');
    expect(staffSheet).not.toContain('>Waiver</t>');
  });
});

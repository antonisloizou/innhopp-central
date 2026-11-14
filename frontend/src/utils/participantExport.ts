import { Event } from '../api/events';
import { ParticipantProfile } from '../api/participants';
import { Registration } from '../api/registrations';
import { isProfileCompleteForRegistration } from './profileCompleteness';
import { formatWhatsApp } from './whatsapp';

type ParticipantExportData = {
  event: Event;
  registrations: Registration[];
  profiles: ParticipantProfile[];
};

type Column<T> = { label: string; value: (item: T) => unknown; width?: number };
type ParticipantRow = { registration: Registration; profile?: ParticipantProfile };

const display = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${key}: ${display(item)}`)
    .join('; ');
  return String(value);
};

const profileValue = (row: ParticipantRow, key: keyof ParticipantProfile) => row.profile?.[key];
const dateOnly = (value?: string | null) => value ? value.slice(0, 10) : '';
const meaningfulRoles = (values?: string[]) => (values || []).filter((value) => value.trim().toLowerCase() !== 'participant');
const hasText = (value: unknown) => String(value ?? '').trim().length > 0;
const titleCase = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (character) => character.toUpperCase());

const baseParticipantColumns: Array<Column<ParticipantRow>> = [
  { label: 'Name', value: (row) => row.profile?.full_name || row.registration.participant_name || '', width: 26 },
  { label: 'Profile complete', value: (row) => row.profile && isProfileCompleteForRegistration(row.profile) ? 'Yes' : 'No', width: 17 },
  { label: 'Email', value: (row) => row.profile?.email || row.registration.participant_email || '', width: 30 },
  { label: 'Phone', value: (row) => profileValue(row, 'phone'), width: 18 },
  { label: 'WhatsApp', value: (row) => formatWhatsApp(row.profile?.phone, row.profile?.whatsapp), width: 22 },
  { label: 'Instagram', value: (row) => profileValue(row, 'instagram'), width: 18 },
  { label: 'Citizenship', value: (row) => profileValue(row, 'citizenship'), width: 16 },
  { label: 'Date of birth', value: (row) => profileValue(row, 'date_of_birth'), width: 16 },
  { label: 'Emergency contact name', value: (row) => profileValue(row, 'emergency_contact_name'), width: 24 },
  { label: 'Emergency contact phone', value: (row) => profileValue(row, 'emergency_contact_phone'), width: 22 },
  { label: 'Years in sport', value: (row) => profileValue(row, 'years_in_sport'), width: 14 },
  { label: 'Jump count', value: (row) => profileValue(row, 'jump_count'), width: 13 },
  { label: 'Recent jump count', value: (row) => profileValue(row, 'recent_jump_count'), width: 18 },
  { label: 'Main canopy', value: (row) => profileValue(row, 'main_canopy'), width: 18 },
  { label: 'Wingload', value: (row) => profileValue(row, 'wingload'), width: 12 },
  { label: 'License', value: (row) => profileValue(row, 'license'), width: 14 },
  { label: 'Uses packer', value: (row) => profileValue(row, 'uses_packer'), width: 15 },
  { label: 'Roles', value: (row) => meaningfulRoles(row.profile?.roles), width: 24 },
  { label: 'Ratings', value: (row) => profileValue(row, 'ratings'), width: 24 },
  { label: 'Disciplines', value: (row) => profileValue(row, 'disciplines'), width: 28 },
  { label: 'Other air sports', value: (row) => profileValue(row, 'other_air_sports'), width: 24 },
  { label: 'Canopy course', value: (row) => profileValue(row, 'canopy_course'), width: 24 },
  { label: 'Landing area preference', value: (row) => profileValue(row, 'landing_area_preference'), width: 25 },
  { label: 'T-shirt size', value: (row) => profileValue(row, 'tshirt_size'), width: 14 },
  { label: 'T-shirt gender', value: (row) => profileValue(row, 'tshirt_gender'), width: 16 },
  { label: 'Dietary restrictions', value: (row) => profileValue(row, 'dietary_restrictions'), width: 30 },
  { label: 'Medical conditions', value: (row) => profileValue(row, 'medical_conditions'), width: 30 },
  { label: 'Medical expertise', value: (row) => profileValue(row, 'medical_expertise'), width: 28 },
  { label: 'HSS qualities', value: (row) => profileValue(row, 'hss_qualities'), width: 28 },
  { label: 'Profile notes', value: (row) => profileValue(row, 'notes'), width: 38 },
  { label: 'Coming solo or in group', value: (row) => titleCase(row.registration.event_details?.attendance_type || ''), width: 24 },
  { label: 'Group size', value: (row) => row.registration.event_details?.group_size, width: 13 },
  { label: 'Group names', value: (row) => row.registration.event_details?.group_names, width: 36 },
  { label: 'Accommodation preference', value: (row) => row.registration.event_details?.accommodation, width: 30 },
  { label: 'Preferred roommate', value: (row) => row.registration.event_details?.accommodation_roommate, width: 28 },
  { label: 'Main payment method', value: (row) => row.registration.event_details?.payment_method === 'bank_transfer' ? 'Bank transfer' : row.registration.event_details?.payment_method === 'stripe' ? 'Secure Online Payment via Stripe' : '', width: 34 },
  { label: 'Discount eligibility and previous events', value: (row) => row.registration.event_details?.discount_eligibility, width: 42 },
  { label: 'How they heard about The Innhopp Project', value: (row) => row.registration.event_details?.heard_about_project, width: 42 },
  { label: 'How they heard about this event', value: (row) => row.registration.event_details?.heard_about_event, width: 42 },
  { label: 'Additional registration information', value: (row) => row.registration.event_details?.additional_information, width: 42 },
  { label: 'Non-jumper opt-in activities', value: (row) => (row.registration.event_details?.non_jumper_opt_ins || []).map((item) => `${item.title}${item.cost ? ` (COST: ${item.cost} ${item.cost_currency || ''})` : ''}`).join(', '), width: 42 },
  { label: 'Non-jumper opt-out activities', value: (row) => (row.registration.event_details?.non_jumper_opt_outs || []).map((item) => item.title).join(', '), width: 42 },
  { label: 'Registration status', value: (row) => row.registration.status, width: 22 },
  { label: 'Registered date', value: (row) => dateOnly(row.registration.registered_at), width: 17 },
  { label: 'Deposit paid date', value: (row) => dateOnly(row.registration.deposit_paid_at), width: 19 },
  { label: 'Main invoice due date', value: (row) => dateOnly(row.registration.main_invoice_due_at), width: 21 },
  { label: 'Main invoice paid date', value: (row) => dateOnly(row.registration.main_invoice_paid_at), width: 22 },
  { label: 'Cancelled date', value: (row) => dateOnly(row.registration.cancelled_at), width: 17 },
  { label: 'Expired date', value: (row) => dateOnly(row.registration.expired_at), width: 17 },
  { label: 'Waitlist position', value: (row) => row.registration.waitlist_position, width: 18 }
];

const participantColumns = (rows: ParticipantRow[]): Array<Column<ParticipantRow>> => {
  const checklistKeys = [...new Set(rows.flatMap((row) => [
    ...Object.keys(row.registration.checklist || {}),
    ...Object.keys(row.registration.checklist_text || {})
  ]))].sort((left, right) => left.localeCompare(right));
  return [
    ...baseParticipantColumns,
    ...checklistKeys.map((key): Column<ParticipantRow> => ({
      label: titleCase(key),
      value: (row) => row.registration.checklist?.[key],
      width: 20
    })),
    ...checklistKeys.map((key): Column<ParticipantRow> => ({
      label: titleCase(key),
      value: (row) => row.registration.checklist_text?.[key],
      width: 32
    }))
  ];
};

const staffExcludedColumns = new Set([
  'Registration status',
  'Registered date',
  'Deposit paid date',
  'Main invoice due date',
  'Main invoice paid date',
  'Cancelled date',
  'Expired date',
  'Waitlist position'
]);

const staffColumns = baseParticipantColumns.filter((column) => !staffExcludedColumns.has(column.label));

const missingRequiredColumn = (row: ParticipantRow, label: string) => {
  const profile = row.profile;
  if (!profile) return new Set([
    'Name', 'Email', 'Phone', 'Emergency contact name', 'Emergency contact phone', 'Years in sport',
    'Jump count', 'Recent jump count', 'Main canopy', 'Wingload', 'License', 'Uses packer'
  ]).has(label);
  const checks: Record<string, boolean> = {
    Name: !hasText(profile.full_name),
    Email: !hasText(profile.email),
    Phone: !hasText(profile.phone),
    'Emergency contact name': !hasText(profile.emergency_contact_name),
    'Emergency contact phone': !hasText(profile.emergency_contact_phone),
    'Years in sport': typeof profile.years_in_sport !== 'number',
    'Jump count': typeof profile.jump_count !== 'number',
    'Recent jump count': typeof profile.recent_jump_count !== 'number',
    'Main canopy': !hasText(profile.main_canopy),
    Wingload: !hasText(profile.wingload),
    License: !hasText(profile.license),
    'Uses packer': !hasText(profile.uses_packer)
  };
  return checks[label] || false;
};

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const columnName = (index: number) => {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
};
const cell = (column: number, row: number, value: unknown, style = 0) => {
  const text = display(value);
  return `<c r="${columnName(column)}${row}" t="inlineStr" s="${style}"><is><t${/^\s|\s$/.test(text) ? ' xml:space="preserve"' : ''}>${escapeXml(text)}</t></is></c>`;
};

const worksheet = <T,>(columns: Array<Column<T>>, items: T[], cellStyle?: (item: T, column: Column<T>) => number) => {
  const rows = [`<row r="1">${columns.map((column, index) => cell(index, 1, column.label, 1)).join('')}</row>`];
  items.forEach((item, itemIndex) => rows.push(`<row r="${itemIndex + 2}">${columns.map((column, columnIndex) => cell(columnIndex, itemIndex + 2, column.value(item), cellStyle?.(item, column) || 0)).join('')}</row>`));
  const lastColumn = columnName(Math.max(columns.length - 1, 0));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width || 18}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(items.length + 1, 1)}"/></worksheet>`;
};

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const uint16 = (value: number) => [value & 0xff, (value >>> 8) & 0xff];
const uint32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
const encoder = new TextEncoder();
const zip = (files: Array<{ name: string; content: string }>) => {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const content = encoder.encode(file.content);
    const crc = crc32(content);
    local.push(...uint32(0x04034b50), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(crc), ...uint32(content.length), ...uint32(content.length), ...uint16(name.length), ...uint16(0), ...name, ...content);
    central.push(...uint32(0x02014b50), ...uint16(20), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(crc), ...uint32(content.length), ...uint32(content.length), ...uint16(name.length), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(0), ...uint32(offset), ...name);
    offset += 30 + name.length + content.length;
  });
  return new Uint8Array([...local, ...central, ...uint32(0x06054b50), ...uint16(0), ...uint16(0), ...uint16(files.length), ...uint16(files.length), ...uint32(central.length), ...uint32(offset), ...uint16(0)]);
};

export const createParticipantExportXlsx = ({ registrations, profiles }: ParticipantExportData) => {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows = registrations
    .map((registration) => ({ registration, profile: profilesById.get(registration.participant_id) }))
    .sort((a, b) => Number(a.registration.status === 'cancelled') - Number(b.registration.status === 'cancelled')
      || display(a.profile?.full_name || a.registration.participant_name).localeCompare(display(b.profile?.full_name || b.registration.participant_name)));
  const hasRole = (profile: ParticipantProfile | undefined, role: string) =>
    [...(profile?.roles || []), ...(profile?.account_roles || [])]
      .some((value) => value.trim().toLowerCase() === role);
  const staffRows = rows.filter((row) => hasRole(row.profile, 'staff') || hasRole(row.profile, 'admin'));
  const participantRows = rows.filter((row) => !staffRows.includes(row));
  const allColumns = participantColumns(participantRows);
  const exportCellStyle = (row: ParticipantRow, column: Column<ParticipantRow>) => {
    const cancelled = row.registration.status === 'cancelled';
    const missing = !row.profile || !isProfileCompleteForRegistration(row.profile)
      ? missingRequiredColumn(row, column.label)
      : false;
    if (cancelled && missing) return 4;
    if (missing) return 3;
    return cancelled ? 2 : 0;
  };
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FFFF0000"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf xfId="0" fontId="2" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf xfId="0" fillId="3" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf xfId="0" fontId="2" fillId="3" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>';
  const files = [
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Participants" sheetId="1" r:id="rId1"/><sheet name="Staff" sheetId="2" r:id="rId2"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', content: worksheet(allColumns, participantRows, exportCellStyle) },
    { name: 'xl/worksheets/sheet2.xml', content: worksheet(staffColumns, staffRows, exportCellStyle) },
    { name: 'xl/styles.xml', content: styles }
  ];
  return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

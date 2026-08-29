import { Accommodation, Event, Innhopp } from '../api/events';
import { Airfield } from '../api/airfields';
import { GroundCrew, OtherLogistic, Transport } from '../api/logistics';
import { formatEventLocal, getEventLocalDateKey, getEventLocalTimeParts } from './eventDate';
import logo from '../assets/logo.webp';

type DriverSummaryData = {
  event: Event;
  transports: Transport[];
  groundCrews: GroundCrew[];
  accommodations: Accommodation[];
  others: OtherLogistic[];
  airfields: Airfield[];
};

type Link = { label: string; target: string };
type ExportRow = {
  dayKey: string;
  departure: string;
  vehicle: string;
  driver: string;
  from: Link;
  to: Link;
  route?: Link;
  time: string;
  notes: string;
};

const DRIVER_COLOURS = ['C6E0B4', 'B4C7E7', 'F4CCCC', 'D9EAD3', 'D9D2E9', 'FCE5CD', 'CFE2F3', 'EAD1DC'];
const HEADER_COLOUR = 'FFD966';
const BORDER_COLOUR = '8A8A8A';

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const cleanLocation = (value: string) => value.replace(/^#\s*\d+\s*/, '').trim();

const formatDuration = (minutes?: number | null) => {
  if (!Number.isFinite(minutes) || (minutes as number) <= 0) return '';
  const total = minutes as number;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`;
};

const formatDeparture = (scheduledAt?: string | null) => {
  const parts = getEventLocalTimeParts(scheduledAt);
  return parts ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` : '';
};

const googleSearchUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

const googleRouteUrl = (origin: string, destination: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

const buildLocationCoordinateLookup = ({ event, accommodations, others, airfields }: DriverSummaryData) => {
  const innhoppLabel = (innhopp: Innhopp) =>
    `${innhopp.sequence ? `#${innhopp.sequence} ` : ''}${innhopp.name || 'Untitled innhopp'}`.trim();
  return (name: string) => {
    const innhopp = event.innhopps.find((item) => innhoppLabel(item) === name);
    if (innhopp?.coordinates) return innhopp.coordinates;
    const accommodation = accommodations.find((item) => item.name === name);
    if (accommodation?.coordinates) return accommodation.coordinates;
    const other = others.find((item) => item.name === name);
    if (other?.coordinates) return other.coordinates;
    return airfields.find((item) => item.name === name)?.coordinates || null;
  };
};

const toExportRows = (data: DriverSummaryData): ExportRow[] => {
  const coordinateFor = buildLocationCoordinateLookup(data);
  const routes = [...data.transports.map((item) => ({ item, isGroundCrew: false })), ...data.groundCrews.map((item) => ({ item, isGroundCrew: true }))]
    .filter(({ item }) => item.event_id === data.event.id)
    .flatMap(({ item, isGroundCrew }) => {
      const fromName = cleanLocation(item.pickup_location || '');
      const toName = cleanLocation(item.destination || '');
      const origin = coordinateFor(item.pickup_location) || fromName;
      const destination = coordinateFor(item.destination) || toName;
      const hasDrivingRoute = Boolean(coordinateFor(item.pickup_location) && coordinateFor(item.destination));
      const vehicles = item.vehicles?.length ? item.vehicles : [{ name: 'Unassigned vehicle', driver: '', passenger_capacity: 0 }];
      return vehicles.map((vehicle) => ({
        dayKey: getEventLocalDateKey(item.scheduled_at) || 'Unscheduled',
        departure: formatDeparture(item.scheduled_at),
        vehicle: vehicle.name?.trim() || 'Unnamed vehicle',
        driver: vehicle.driver?.trim() || vehicle.name?.trim() || 'Unassigned',
        from: { label: fromName, target: googleSearchUrl(origin) },
        to: { label: toName, target: googleSearchUrl(destination) },
        route: hasDrivingRoute ? { label: 'Open driving route', target: googleRouteUrl(origin, destination) } : undefined,
        time: formatDuration(item.duration_minutes),
        notes: `${isGroundCrew ? 'Ground crew' : 'Transport'}${item.notes?.trim() ? ` — ${item.notes.trim()}` : ''}`
      }));
    });

  return routes.sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.departure.localeCompare(b.departure) || a.vehicle.localeCompare(b.vehicle));
};

const columnName = (index: number) => String.fromCharCode(65 + index);
const cellRef = (column: number, row: number) => `${columnName(column)}${row}`;

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

const zip = (files: Array<{ name: string; content: string | Uint8Array }>) => {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const content = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(content);
    local.push(...uint32(0x04034b50), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(crc), ...uint32(content.length), ...uint32(content.length), ...uint16(name.length), ...uint16(0), ...name, ...content);
    central.push(...uint32(0x02014b50), ...uint16(20), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(crc), ...uint32(content.length), ...uint32(content.length), ...uint16(name.length), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(0), ...uint32(offset), ...name);
    offset += 30 + name.length + content.length;
  });
  const centralOffset = offset;
  return new Uint8Array([...local, ...central, ...uint32(0x06054b50), ...uint16(0), ...uint16(0), ...uint16(files.length), ...uint16(files.length), ...uint32(central.length), ...uint32(centralOffset), ...uint16(0)]);
};

const loadLogoPng = async () => {
  const response = await fetch(logo);
  if (!response.ok) throw new Error('Unable to load the Innhopp Central logo.');
  const source = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to prepare the Innhopp Central logo.'));
      image.src = source;
    });
    const displayScale = Math.min(155 / image.width, 48 / image.height, 1);
    const displayWidth = Math.max(1, Math.round(image.width * displayScale));
    const displayHeight = Math.max(1, Math.round(image.height * displayScale));
    const canvas = document.createElement('canvas');
    canvas.width = displayWidth * 2;
    canvas.height = displayHeight * 2;
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Unable to prepare the Innhopp Central logo.');
    return { bytes: new Uint8Array(await png.arrayBuffer()), width: displayWidth, height: displayHeight };
  } finally {
    URL.revokeObjectURL(source);
  }
};

export const createDriverSummaryXlsx = async (data: DriverSummaryData) => {
  const logoPng = await loadLogoPng();
  const logoOffsetX = Math.round(((166 - logoPng.width) / 2) * 9525);
  const logoOffsetY = Math.round(((53 - logoPng.height) / 2) * 9525);
  const rows = toExportRows(data);
  const driverStyles = new Map<string, number>();
  const styleForDriver = (driver: string) => {
    if (!driverStyles.has(driver)) driverStyles.set(driver, 3 + (driverStyles.size % DRIVER_COLOURS.length));
    return driverStyles.get(driver)!;
  };
  const hyperlinks: Array<{ ref: string; target: string }> = [];
  const rowXml: string[] = [];
  const mergedRows = ['B1:I1'];
  const inlineCell = (column: number, row: number, value: string, style: number, link?: Link) => {
    if (link?.target) hyperlinks.push({ ref: cellRef(column, row), target: link.target });
    return `<c r="${cellRef(column, row)}" t="inlineStr" s="${link ? 2 : style}"><is><t${/^\s|\s$/.test(value) ? ' xml:space="preserve"' : ''}>${escapeXml(value)}</t></is></c>`;
  };
  rowXml.push(`<row r="1" ht="40" customHeight="1">${inlineCell(1, 1, `${data.event.name} — Driver Summary`, 1)}</row>`);
  rowXml.push(`<row r="2">${['Vehicle name', 'Driver', 'From', 'To', 'Departure', 'Arrive by', 'Time', 'Route', 'Notes'].map((label, index) => inlineCell(index, 2, label, 1)).join('')}</row>`);
  let currentDay = '';
  let excelRow = 3;
  rows.forEach((row) => {
    if (row.dayKey !== currentDay) {
      currentDay = row.dayKey;
      const dayNumber = currentDay === 'Unscheduled' ? '' : `Day ${[...new Set(rows.map((item) => item.dayKey))].filter((key) => key !== 'Unscheduled').indexOf(currentDay) + 1} — `;
      const dayLabel = currentDay === 'Unscheduled' ? 'Unscheduled routes' : `${dayNumber}${formatEventLocal(`${currentDay}T12:00:00Z`, { weekday: 'long', month: 'long', day: 'numeric' })}`;
      rowXml.push(`<row r="${excelRow}">${inlineCell(0, excelRow, dayLabel, 1)}</row>`);
      mergedRows.push(`A${excelRow}:I${excelRow}`);
      excelRow += 1;
    }
    const style = styleForDriver(row.driver);
    rowXml.push(`<row r="${excelRow}">${inlineCell(0, excelRow, row.vehicle, style)}${inlineCell(1, excelRow, row.driver, style)}${inlineCell(2, excelRow, row.from.label, style, row.from)}${inlineCell(3, excelRow, row.to.label, style, row.to)}${inlineCell(4, excelRow, row.departure, style)}${inlineCell(5, excelRow, '', style)}${inlineCell(6, excelRow, row.time, style)}${inlineCell(7, excelRow, row.route?.label || '', style, row.route)}${inlineCell(8, excelRow, row.notes, style)}</row>`);
    excelRow += 1;
  });
  if (!rows.length) rowXml.push(`<row r="3">${inlineCell(0, 3, 'No driver routes have been scheduled for this event.', 0)}</row>`);
  const relationships = [...hyperlinks.map((link, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(link.target)}" TargetMode="External"/>`), `<Relationship Id="rId${hyperlinks.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>`].join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="23" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="4" width="28" customWidth="1"/><col min="5" max="7" width="14" customWidth="1"/><col min="8" max="8" width="22" customWidth="1"/><col min="9" max="9" width="50" customWidth="1"/></cols><sheetData>${rowXml.join('')}</sheetData><mergeCells count="${mergedRows.length}">${mergedRows.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>${hyperlinks.length ? `<hyperlinks>${hyperlinks.map((link, index) => `<hyperlink ref="${link.ref}" r:id="rId${index + 1}"/>`).join('')}</hyperlinks>` : ''}<drawing r:id="rId${hyperlinks.length + 1}"/></worksheet>`;
  const fills = [`<fill><patternFill patternType="none"/></fill>`, `<fill><patternFill patternType="gray125"/></fill>`, `<fill><patternFill patternType="solid"><fgColor rgb="FF${HEADER_COLOUR}"/><bgColor indexed="64"/></patternFill></fill>`, ...DRIVER_COLOURS.map((colour) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${colour}"/><bgColor indexed="64"/></patternFill></fill>`)].join('');
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><u/><color rgb="FF0563C1"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="${DRIVER_COLOURS.length + 2}">${fills}</fills><borders count="2"><border/><border><left style="thin"><color rgb="FF${BORDER_COLOUR}"/></left><right style="thin"><color rgb="FF${BORDER_COLOUR}"/></right><top style="thin"><color rgb="FF${BORDER_COLOUR}"/></top><bottom style="thin"><color rgb="FF${BORDER_COLOUR}"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${DRIVER_COLOURS.length + 3}"><xf xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf xfId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf xfId="0" fontId="2" borderId="1" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>${DRIVER_COLOURS.map((_, index) => `<xf xfId="0" fillId="${index + 3}" borderId="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>`).join('')}</cellXfs></styleSheet>`;
  return new Blob([zip([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Driver Summary" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
    { name: 'xl/worksheets/_rels/sheet1.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>` },
    { name: 'xl/styles.xml', content: styles },
    { name: 'xl/drawings/drawing1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${logoOffsetX}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${logoOffsetY}</xdr:rowOff></xdr:from><xdr:to><xdr:col>0</xdr:col><xdr:colOff>${logoOffsetX + logoPng.width * 9525}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${logoOffsetY + logoPng.height * 9525}</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Innhopp Central logo" descr="Innhopp Central logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1" cstate="print"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="${logoOffsetX}" y="${logoOffsetY}"/><a:ext cx="${logoPng.width * 9525}" cy="${logoPng.height * 9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>` },
    { name: 'xl/drawings/_rels/drawing1.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>' },
    { name: 'xl/media/logo.png', content: logoPng.bytes }
  ])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

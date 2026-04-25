import { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
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
import EventGearMenu from '../components/EventGearMenu';
import { formatEventLocal, formatEventLocalDate, getEventLocalDateKey, getEventLocalDateKeyFromDate } from '../utils/eventDate';
import { roleOptions } from '../utils/roles';

type TemplateForm = {
  name: string;
  subject_template: string;
  body_template: string;
};

type EmbeddedImageEntry = {
  src: string;
  alt: string;
  width?: number;
};

type BodyLinkEntry = {
  start: number;
  end: number;
  href: string;
};

type CommunicationsPageProps = {
  fixedEventId?: number;
};

type BodyLinkEditorState = {
  open: boolean;
  expanded: boolean;
  anchorLeft: number;
  top: number;
  containerWidth: number;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  existingLinkIndex: number | null;
  highlightRects: Array<{ left: number; top: number; width: number; height: number }>;
};

type AudienceRecipientWithEvent = NonNullable<AudiencePreviewResponse['recipients']>[number] & {
  event_id?: number;
};

type TemplateRenderedPreviewProps = {
  label: ReactNode;
  subject: string;
  subjectFallback: string;
  body: string;
  bodyHtml: string;
  bodyFallback: string;
  bodyRef?: Ref<HTMLDivElement>;
  fieldLabelClassName?: string;
  panelElement?: 'div' | 'aside';
  children?: ReactNode;
};

const TemplateRenderedPreview = ({
  label,
  subject,
  subjectFallback,
  body,
  bodyHtml,
  bodyFallback,
  bodyRef,
  fieldLabelClassName = 'field-label',
  panelElement = 'div',
  children
}: TemplateRenderedPreviewProps) => {
  const previewContent = (
    <>
      <div className="comms-rendered-preview-block">
        <span className={fieldLabelClassName}>Subject</span>
        <strong>{subject || subjectFallback}</strong>
      </div>
      <div className="comms-rendered-preview-block">
        <span className={fieldLabelClassName}>Body</span>
        {body ? (
          <div
            ref={bodyRef}
            className="comms-rendered-preview-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : (
          <div className="comms-rendered-preview-body">{bodyFallback}</div>
        )}
      </div>
    </>
  );

  return (
    <div className="comms-preview-column">
      <span className="comms-preview-label">{label}</span>
      {panelElement === 'aside' ? (
        <aside className="comms-rendered-preview">{previewContent}</aside>
      ) : (
        <div className="comms-rendered-preview">{previewContent}</div>
      )}
      {children}
    </div>
  );
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

const buildEventScheduleUrl = (eventId?: number | null) => {
  const path = !eventId || !Number.isFinite(eventId) ? '/events' : `/events/${eventId}`;
  const configuredBase = import.meta.env.VITE_FRONTEND_URL?.trim();
  const runtimeBase = typeof window !== 'undefined' ? window.location.origin : '';
  const base = configuredBase || runtimeBase;
  if (!base) return path;
  try {
    return new URL(path, `${base.replace(/\/+$/, '')}/`).toString();
  } catch {
    return path;
  }
};

const embeddedImageMarker = '🖼️';
const embeddedImageMarkerRegex = /🖼️?/g;
const legacyEmbeddedImageMarkerRegex = /[\ue3f4\ue88f]/g;

const normalizeLegacyImageMarkers = (value: string) =>
  value.replace(legacyEmbeddedImageMarkerRegex, embeddedImageMarker).replace(embeddedImageMarkerRegex, embeddedImageMarker);

const isHtmlLineBreak = (node: ChildNode | null) =>
  node?.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'br';

const removeAdjacentImageSpacingNode = (node: ChildNode | null) => {
  if (isHtmlLineBreak(node)) {
    node?.parentNode?.removeChild(node);
  }
};

const hasTextOnSameLineBefore = (node: ChildNode) => {
  let current = node.previousSibling;
  while (current) {
    if (isHtmlLineBreak(current)) return false;
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current.textContent || '';
      const lineBreakIndex = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'));
      const sameLineText = lineBreakIndex >= 0 ? text.slice(lineBreakIndex + 1) : text;
      if (sameLineText.trim()) return true;
      if (lineBreakIndex >= 0) return false;
    } else if ((current.textContent || '').trim()) {
      return true;
    }
    current = current.previousSibling;
  }
  return false;
};

const hasTextOnSameLineAfter = (node: ChildNode) => {
  let current = node.nextSibling;
  while (current) {
    if (isHtmlLineBreak(current)) return false;
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current.textContent || '';
      const lineBreakIndexes = [text.indexOf('\n'), text.indexOf('\r')].filter((index) => index >= 0);
      const lineBreakIndex = lineBreakIndexes.length > 0 ? Math.min(...lineBreakIndexes) : -1;
      const sameLineText = lineBreakIndex >= 0 ? text.slice(0, lineBreakIndex) : text;
      if (sameLineText.trim()) return true;
      if (lineBreakIndex >= 0) return false;
    } else if ((current.textContent || '').trim()) {
      return true;
    }
    current = current.nextSibling;
  }
  return false;
};

const tokenizeEmbeddedImagesForEditor = (value: string) => {
  if (!value || typeof window === 'undefined') {
    return { value: normalizeLegacyImageMarkers(value), list: [] as EmbeddedImageEntry[] };
  }
  const normalizedValue = normalizeLegacyImageMarkers(value);
  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizedValue, 'text/html');
  const list: EmbeddedImageEntry[] = [];

  Array.from(doc.body.querySelectorAll('img')).forEach((img) => {
    const src = img.getAttribute('src')?.trim() || '';
    if (!src.toLowerCase().startsWith('data:image/')) return;
    const alt = img.getAttribute('alt')?.trim() || 'Image';
    const parsedWidth = Number.parseInt(img.getAttribute('width') || '', 10);
    const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : undefined;
    list.push({ src, alt, width });
    removeAdjacentImageSpacingNode(img.previousSibling);
    removeAdjacentImageSpacingNode(img.nextSibling);
    img.replaceWith(doc.createTextNode(embeddedImageMarker));
  });

  Array.from(doc.body.querySelectorAll('span.material-symbols-outlined[data-embedded-image-id]')).forEach((marker) => {
    marker.replaceWith(doc.createTextNode(embeddedImageMarker));
  });

  return { value: doc.body.innerHTML, list };
};

const expandEmbeddedImagePlaceholders = (
  value: string,
  images: EmbeddedImageEntry[]
) => {
  if (!value || images.length === 0) return value;
  let imageIndex = 0;
  return value.replace(embeddedImageMarkerRegex, () => {
    const image = images[imageIndex];
    imageIndex += 1;
    if (!image?.src) return '';
    const widthAttr = image.width && image.width > 0 ? ` width="${Math.round(image.width)}"` : '';
    return `<img src="${image.src}" alt="${escapeHtml(image.alt || 'Image')}"${widthAttr} />`;
  });
};

const normalizeEmailImageLayout = (value: string) => {
  if (!value || typeof window === 'undefined') return value;
  const parser = new DOMParser();
  const doc = parser.parseFromString(value, 'text/html');
  Array.from(doc.body.querySelectorAll('img')).forEach((image) => {
    image.style.display = 'block';
    image.style.margin = '0.75rem auto';
    image.style.maxWidth = '100%';
    image.style.height = 'auto';
    removeAdjacentImageSpacingNode(image.previousSibling);
    removeAdjacentImageSpacingNode(image.nextSibling);
    if (hasTextOnSameLineBefore(image)) {
      image.parentNode?.insertBefore(doc.createElement('br'), image);
    }
    if (hasTextOnSameLineAfter(image)) {
      image.parentNode?.insertBefore(doc.createElement('br'), image.nextSibling);
    }
  });

  return doc.body?.innerHTML || value;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const looksLikeHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);

const isAllowedUrl = (value: string, options?: { allowRelative?: boolean; allowDataImage?: boolean }) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:') || lower.startsWith('tel:')) {
    return true;
  }
  if (options?.allowDataImage && lower.startsWith('data:image/')) {
    return true;
  }
  if (options?.allowRelative && (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('#'))) {
    return true;
  }
  return false;
};

const normalizeBodyLinkUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('#')) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const parseBodyLinksForEditor = (value: string) => {
  if (!value || typeof window === 'undefined' || !looksLikeHtml(value)) {
    return { value: normalizeLegacyImageMarkers(value), links: [] as BodyLinkEntry[] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizeLegacyImageMarkers(value), 'text/html');
  const links: BodyLinkEntry[] = [];
  let plainText = '';

  const appendNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      plainText += node.textContent || '';
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'br') {
      plainText += '\n';
      return;
    }

    const startsBlock =
      ['div', 'p', 'h1', 'h2', 'h3', 'li', 'blockquote', 'tr'].includes(tagName) &&
      plainText.length > 0 &&
      !plainText.endsWith('\n');
    if (startsBlock) {
      plainText += '\n';
    }

    const linkStart = plainText.length;
    Array.from(element.childNodes).forEach(appendNode);
    const linkEnd = plainText.length;

    if (tagName === 'a') {
      const href = element.getAttribute('href')?.trim() || '';
      if (href && linkEnd > linkStart) {
        links.push({ start: linkStart, end: linkEnd, href });
      }
    }

    if (['div', 'p', 'h1', 'h2', 'h3', 'li', 'blockquote', 'tr'].includes(tagName) && !plainText.endsWith('\n')) {
      plainText += '\n';
    }
  };

  Array.from(doc.body.childNodes).forEach(appendNode);
  return { value: plainText.replace(/\n+$/, ''), links };
};

const serializeBodyLinksForSave = (value: string, links: BodyLinkEntry[]) => {
  const sortedLinks = [...links]
    .filter((link) => link.end > link.start && link.start >= 0 && link.end <= value.length)
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  let output = '';
  sortedLinks.forEach((link) => {
    if (link.start < cursor) return;
    output += value.slice(cursor, link.start);
    output += `<a href="${escapeHtml(link.href)}">${escapeHtml(value.slice(link.start, link.end))}</a>`;
    cursor = link.end;
  });
  output += value.slice(cursor);
  return output;
};

const renderBodyEditorOverlayHtml = (value: string, links: BodyLinkEntry[]) => {
  const sortedLinks = [...links]
    .filter((link) => link.end > link.start && link.start >= 0 && link.end <= value.length)
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  let output = '';
  sortedLinks.forEach((link) => {
    if (link.start < cursor) return;
    output += escapeHtml(value.slice(cursor, link.start));
    output += `<span class="comms-body-editor-link">${escapeHtml(value.slice(link.start, link.end))}</span>`;
    cursor = link.end;
  });
  output += escapeHtml(value.slice(cursor));
  return output || '&nbsp;';
};

const reconcileBodyLinksAfterTextChange = (
  previousValue: string,
  nextValue: string,
  previousLinks: BodyLinkEntry[]
) => {
  let prefixLength = 0;
  while (
    prefixLength < previousValue.length &&
    prefixLength < nextValue.length &&
    previousValue[prefixLength] === nextValue[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previousValue.length - prefixLength &&
    suffixLength < nextValue.length - prefixLength &&
    previousValue[previousValue.length - 1 - suffixLength] === nextValue[nextValue.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const previousChangeEnd = previousValue.length - suffixLength;
  const nextChangeEnd = nextValue.length - suffixLength;
  const delta = nextChangeEnd - previousChangeEnd;

  return previousLinks
    .map((link) => {
      if (link.end <= prefixLength) return link;
      if (link.start >= previousChangeEnd) {
        return { ...link, start: link.start + delta, end: link.end + delta };
      }
      return null;
    })
    .filter((link): link is BodyLinkEntry => !!link && link.end > link.start);
};

const getTextChangeRange = (previousValue: string, nextValue: string) => {
  let prefixLength = 0;
  while (
    prefixLength < previousValue.length &&
    prefixLength < nextValue.length &&
    previousValue[prefixLength] === nextValue[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previousValue.length - prefixLength &&
    suffixLength < nextValue.length - prefixLength &&
    previousValue[previousValue.length - 1 - suffixLength] === nextValue[nextValue.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    previousStart: prefixLength,
    previousEnd: previousValue.length - suffixLength,
    nextStart: prefixLength,
    nextEnd: nextValue.length - suffixLength
  };
};

const applyBodyTemplateEditorTextChange = (
  previousValue: string,
  nextValue: string,
  previousLinks: BodyLinkEntry[]
) => {
  const change = getTextChangeRange(previousValue, nextValue);
  const removedCharacterCount = change.previousEnd - change.previousStart;
  const insertedText = nextValue.slice(change.nextStart, change.nextEnd);

  if (removedCharacterCount > 0) {
    const affectedLinks = previousLinks.filter(
      (link) => link.start < change.previousEnd && link.end > change.previousStart
    );

    if (affectedLinks.length > 0) {
      const removeStart = Math.min(change.previousStart, ...affectedLinks.map((link) => link.start));
      const removeEnd = Math.max(change.previousEnd, ...affectedLinks.map((link) => link.end));
      const value = `${previousValue.slice(0, removeStart)}${insertedText}${previousValue.slice(removeEnd)}`;
      const delta = insertedText.length - (removeEnd - removeStart);
      const affectedLinkSet = new Set(affectedLinks);
      const links = previousLinks
        .filter((link) => !affectedLinkSet.has(link))
        .map((link) => {
          if (link.end <= removeStart) return link;
          if (link.start >= removeEnd) {
            return { ...link, start: link.start + delta, end: link.end + delta };
          }
          return null;
        })
        .filter((link): link is BodyLinkEntry => !!link && link.end > link.start);

      return { value, links, selectionStart: removeStart + insertedText.length };
    }
  }

  return {
    value: nextValue,
    links: reconcileBodyLinksAfterTextChange(previousValue, nextValue, previousLinks),
    selectionStart: null
  };
};

const findBodyLinkIndexAtPosition = (links: BodyLinkEntry[], position: number) =>
  links.findIndex((link) => position >= link.start && position <= link.end);

const findBodyLinkIndexForSelection = (links: BodyLinkEntry[], selectionStart: number, selectionEnd: number) =>
  links.findIndex((link) => selectionStart >= link.start && selectionEnd <= link.end);

const maxEmbeddedImageWidth = 1200;
const embeddedImageTargetBytes = 600 * 1024;
const embeddedImageHardLimitBytes = 1024 * 1024;
const embeddedImageInitialJpegQuality = 0.86;
const embeddedImageMinJpegQuality = 0.7;

const estimateDataUrlBytes = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return 0;
  const base64Length = dataUrl.length - commaIndex - 1;
  return Math.floor((base64Length * 3) / 4);
};

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load selected image.'));
    image.src = src;
  });

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Failed to read selected image.'));
    };
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.readAsDataURL(file);
  });

const buildEmbeddedEmailImageSrc = async (file: File) => {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const fileType = file.type.toLowerCase();
  if (fileType === 'image/gif' || fileType === 'image/svg+xml') {
    return sourceDataUrl;
  }

  const image = await loadImageElement(sourceDataUrl);
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const initialScale = sourceWidth > maxEmbeddedImageWidth ? maxEmbeddedImageWidth / sourceWidth : 1;
  let width = Math.max(1, Math.round(sourceWidth * initialScale));
  let height = Math.max(1, Math.round(sourceHeight * initialScale));

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return sourceDataUrl;
  }

  const draw = () => {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
  };

  draw();
  let quality = embeddedImageInitialJpegQuality;
  let output = canvas.toDataURL('image/jpeg', quality);

  while (estimateDataUrlBytes(output) > embeddedImageTargetBytes && quality > embeddedImageMinJpegQuality) {
    quality = Math.max(embeddedImageMinJpegQuality, quality - 0.04);
    output = canvas.toDataURL('image/jpeg', quality);
  }

  while (estimateDataUrlBytes(output) > embeddedImageHardLimitBytes && width > 640) {
    width = Math.max(640, Math.round(width * 0.88));
    height = Math.max(1, Math.round((width / sourceWidth) * sourceHeight));
    draw();
    output = canvas.toDataURL('image/jpeg', quality);
  }

  return output;
};

const sanitizeEmailHtml = (value: string) => {
  if (typeof window === 'undefined') {
    return escapeHtml(value).replace(/\n/g, '<br />');
  }
  if (!looksLikeHtml(value)) {
    return escapeHtml(value).replace(/\n/g, '<br />');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(value, 'text/html');
  const allowedTags = new Set([
    'a',
    'b',
    'blockquote',
    'br',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'hr',
    'img',
    'li',
    'ol',
    'p',
    'span',
    'strong',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'u',
    'ul'
  ]);

  const sanitizeNode = (node: Node) => {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (!allowedTags.has(tagName)) {
      const parent = element.parentNode;
      if (!parent) return;
      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
      }
      parent.removeChild(element);
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'style') {
        element.removeAttribute(attribute.name);
        return;
      }
      if (tagName === 'a') {
        if (name === 'href') {
          if (!isAllowedUrl(attribute.value, { allowRelative: true })) {
            element.removeAttribute(attribute.name);
          }
          return;
        }
        if (name === 'target') {
          element.setAttribute('target', '_blank');
          return;
        }
        if (name === 'rel') {
          element.setAttribute('rel', 'noopener noreferrer');
          return;
        }
        if (name !== 'title') {
          element.removeAttribute(attribute.name);
        }
        return;
      }
      if (tagName === 'img') {
        if (name === 'src') {
          if (!isAllowedUrl(attribute.value, { allowRelative: true, allowDataImage: true })) {
            element.removeAttribute(attribute.name);
          }
          return;
        }
        if (name === 'alt' || name === 'width' || name === 'height' || name === 'title') {
          return;
        }
        element.removeAttribute(attribute.name);
        return;
      }
      if (name !== 'title' && name !== 'colspan' && name !== 'rowspan') {
        element.removeAttribute(attribute.name);
      }
    });

    if (tagName === 'a') {
      if (element.getAttribute('href')) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
  };

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ALL);
  const nodes: Node[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    nodes.push(currentNode);
    currentNode = walker.nextNode();
  }
  nodes.forEach(sanitizeNode);
  return doc.body.innerHTML;
};

const getTextareaSelectionAnchorPosition = (
  textarea: HTMLTextAreaElement,
  selectionIndex: number
) => {
  const styles = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.boxSizing = 'border-box';
  mirror.style.top = '0';
  mirror.style.left = '0';

  const mirroredProperties = [
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'textAlign',
    'textIndent',
    'textTransform',
    'width'
  ] as const;

  mirroredProperties.forEach((property) => {
    mirror.style[property] = styles[property];
  });

  mirror.textContent = textarea.value.slice(0, selectionIndex);
  if (textarea.value.endsWith('\n')) {
    mirror.textContent += ' ';
  }
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const position = {
    left:
      markerRect.left -
      mirrorRect.left -
      textarea.scrollLeft,
    top:
      markerRect.top -
      mirrorRect.top -
      textarea.scrollTop
  };

  document.body.removeChild(mirror);
  return position;
};

const getTextareaSelectionHighlightRects = (
  textarea: HTMLTextAreaElement,
  selectionStart: number,
  selectionEnd: number
) => {
  if (selectionEnd <= selectionStart) return [];

  const styles = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const textNode = document.createTextNode(textarea.value || ' ');
  mirror.appendChild(textNode);

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.boxSizing = 'border-box';
  mirror.style.top = '0';
  mirror.style.left = '0';

  const mirroredProperties = [
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'textAlign',
    'textIndent',
    'textTransform',
    'width'
  ] as const;

  mirroredProperties.forEach((property) => {
    mirror.style[property] = styles[property];
  });

  document.body.appendChild(mirror);
  const range = document.createRange();
  range.setStart(textNode, Math.min(selectionStart, textNode.length));
  range.setEnd(textNode, Math.min(selectionEnd, textNode.length));

  const mirrorRect = mirror.getBoundingClientRect();
  const rects = Array.from(range.getClientRects())
    .map((rect) => ({
      left: rect.left - mirrorRect.left - textarea.scrollLeft,
      top: rect.top - mirrorRect.top - textarea.scrollTop,
      width: rect.width,
      height: rect.height
    }))
    .filter((rect) => rect.width > 0 && rect.height > 0);

  document.body.removeChild(mirror);
  return rects;
};

const collapsedLinkPopoverHalfWidth = 24;
const expandedLinkPopoverWidth = 360;

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
  const [bodyLinkEditor, setBodyLinkEditor] = useState<BodyLinkEditorState>({
    open: false,
    expanded: false,
    anchorLeft: 0,
    top: 0,
    containerWidth: 0,
    selectionStart: 0,
    selectionEnd: 0,
    selectedText: '',
    existingLinkIndex: null,
    highlightRects: []
  });
  const [bodyLinkDraft, setBodyLinkDraft] = useState('');
  const [bodyLinks, setBodyLinks] = useState<BodyLinkEntry[]>([]);
  const [embeddedImages, setEmbeddedImages] = useState<EmbeddedImageEntry[]>([]);
  const [openSections, setOpenSections] = useState({
    campaign: true,
    templates: true,
    history: true
  });
  const subjectTemplateRef = useRef<HTMLInputElement | null>(null);
  const bodyTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyTemplateEditorRef = useRef<HTMLDivElement | null>(null);
  const bodyTemplateOverlayRef = useRef<HTMLDivElement | null>(null);
  const bodyLinkPopoverRef = useRef<HTMLDivElement | null>(null);
  const bodyLinkInputRef = useRef<HTMLInputElement | null>(null);
  const bodyImageInputRef = useRef<HTMLInputElement | null>(null);
  const editorPreviewBodyRef = useRef<HTMLDivElement | null>(null);
  const resizeTemplateSaveTimeoutRef = useRef<number | null>(null);
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

const insertIntoActiveTemplateField = (snippet: string) => {
    const activeField = activeTemplateFieldRef.current;
    if (!activeField) return;

    const target =
      activeField === 'subject_template' ? subjectTemplateRef.current : bodyTemplateRef.current;
    if (!target) return;

    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const nextPosition = start + snippet.length;

    setTemplateForm((prev) => {
      const currentValue = prev[activeField];
      const nextValue = `${currentValue.slice(0, start)}${snippet}${currentValue.slice(end)}`;
      if (activeField === 'body_template') {
        setBodyLinks((previousLinks) =>
          reconcileBodyLinksAfterTextChange(currentValue, nextValue, previousLinks)
        );
      }
      return {
        ...prev,
        [activeField]: nextValue
      };
    });

    requestAnimationFrame(() => {
      const nextTarget =
        activeField === 'subject_template' ? subjectTemplateRef.current : bodyTemplateRef.current;
      if (!nextTarget) return;
      nextTarget.focus();
      nextTarget.setSelectionRange(nextPosition, nextPosition);
    });
  };

  const buildStandaloneBodyImageMarker = () => {
    const textarea = bodyTemplateRef.current;
    const value = templateForm.body_template;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    return `${prefix}${embeddedImageMarker}${suffix}`;
  };

  const insertPlaceholderToken = (token: string) => {
    insertIntoActiveTemplateField(`{{${token}}}`);
  };

  const insertBodySnippet = (snippet: string) => {
    activeTemplateFieldRef.current = 'body_template';
    bodyTemplateRef.current?.focus();
    insertIntoActiveTemplateField(snippet);
  };

  const handleInsertImageClick = () => {
    activeTemplateFieldRef.current = 'body_template';
    bodyTemplateRef.current?.focus();
    bodyImageInputRef.current?.click();
  };

  const handleBodyImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.toLowerCase().startsWith('image/')) return;
    try {
      const src = await buildEmbeddedEmailImageSrc(file);
      if (!src || !isAllowedUrl(src, { allowDataImage: true })) return;
      const baseName = file.name.replace(/\.[^.]+$/, '').trim();
      const alt = baseName || 'Image';
      const textarea = bodyTemplateRef.current;
      const markerInsertAt = textarea
        ? (templateForm.body_template.slice(0, textarea.selectionStart ?? 0).match(embeddedImageMarkerRegex)?.length || 0)
        : (templateForm.body_template.match(embeddedImageMarkerRegex)?.length || 0);
      setEmbeddedImages((prev) => {
        const next = [...prev];
        next.splice(markerInsertAt, 0, { src, alt });
        return next;
      });
      insertBodySnippet(buildStandaloneBodyImageMarker());
    } catch {
      // Keep flow non-blocking for editor usage.
    }
  };

  const closeBodyLinkEditor = () => {
    setBodyLinkEditor((prev) => ({ ...prev, open: false, expanded: false, highlightRects: [] }));
    setBodyLinkDraft('');
  };

  const openBodyLinkEditorForRange = (
    selectionStart: number,
    selectionEnd: number,
    options?: { href?: string; expanded?: boolean; existingLinkIndex?: number | null }
  ) => {
    const textarea = bodyTemplateRef.current;
    const container = bodyTemplateEditorRef.current;
    if (!textarea || !container || selectionEnd <= selectionStart) {
      return;
    }

    const selectedText = textarea.value.slice(selectionStart, selectionEnd);
    if (!selectedText.trim()) {
      closeBodyLinkEditor();
      return;
    }

    const selectionAnchor = Math.floor((selectionStart + selectionEnd) / 2);
    const selectionPosition = getTextareaSelectionAnchorPosition(textarea, selectionAnchor);
    const selectionRects = getTextareaSelectionHighlightRects(textarea, selectionStart, selectionEnd);
    const textareaRect = textarea.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const rawLeft = textareaRect.left - containerRect.left + selectionPosition.left;
    const minAnchorLeft = 16 + collapsedLinkPopoverHalfWidth;
    const maxAnchorLeft = Math.max(containerRect.width - 16 - collapsedLinkPopoverHalfWidth, minAnchorLeft);
    const anchorLeft = Math.min(Math.max(rawLeft, minAnchorLeft), maxAnchorLeft);
    const top = Math.max(
      textareaRect.top - containerRect.top + selectionPosition.top - 12,
      8
    );

    setBodyLinkEditor({
      open: true,
      expanded: options?.expanded ?? false,
      anchorLeft,
      top,
      containerWidth: containerRect.width,
      selectionStart,
      selectionEnd,
      selectedText,
      existingLinkIndex: options?.existingLinkIndex ?? null,
      highlightRects: selectionRects.map((rect) => ({
        left: textareaRect.left - containerRect.left + rect.left,
        top: textareaRect.top - containerRect.top + rect.top,
        width: rect.width,
        height: rect.height
      }))
    });
    setBodyLinkDraft(options?.href ?? '');
  };

  const updateBodyLinkEditorFromSelection = () => {
    const textarea = bodyTemplateRef.current;
    if (!textarea) {
      return;
    }

    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? 0;

    if (selectionEnd <= selectionStart) {
      return;
    }

    const existingLinkIndex = findBodyLinkIndexForSelection(bodyLinks, selectionStart, selectionEnd);
    if (existingLinkIndex >= 0) {
      const existingLink = bodyLinks[existingLinkIndex];
      openBodyLinkEditorForRange(existingLink.start, existingLink.end, {
        href: existingLink.href,
        expanded: true,
        existingLinkIndex
      });
      requestAnimationFrame(() => {
        bodyLinkInputRef.current?.focus();
      });
      return;
    }

    openBodyLinkEditorForRange(selectionStart, selectionEnd);
  };

  const handleBodyTemplateClick = () => {
    requestAnimationFrame(() => {
      const textarea = bodyTemplateRef.current;
      if (!textarea) return;
      const selectionStart = textarea.selectionStart ?? 0;
      const selectionEnd = textarea.selectionEnd ?? 0;
      if (selectionStart !== selectionEnd) return;

      const existingLinkIndex = findBodyLinkIndexAtPosition(bodyLinks, selectionStart);
      if (existingLinkIndex < 0) return;

      const existingLink = bodyLinks[existingLinkIndex];
      openBodyLinkEditorForRange(existingLink.start, existingLink.end, {
        href: existingLink.href,
        expanded: true,
        existingLinkIndex
      });
      requestAnimationFrame(() => {
        bodyLinkInputRef.current?.focus();
      });
    });
  };

  const syncBodyTemplateOverlayScroll = () => {
    const textarea = bodyTemplateRef.current;
    const overlay = bodyTemplateOverlayRef.current;
    if (!textarea || !overlay) return;
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  };

  const handleSaveBodySelectionLink = () => {
    const textarea = bodyTemplateRef.current;
    const href = normalizeBodyLinkUrl(bodyLinkDraft);
    if (!textarea || !href || !isAllowedUrl(href, { allowRelative: true })) {
      return;
    }

    const { selectionStart, selectionEnd, selectedText } = bodyLinkEditor;
    if (!selectedText || selectionEnd <= selectionStart) {
      closeBodyLinkEditor();
      return;
    }

    setBodyLinks((prev) => {
      if (bodyLinkEditor.existingLinkIndex !== null) {
        return prev.map((link, index) =>
          index === bodyLinkEditor.existingLinkIndex ? { ...link, href } : link
        );
      }
      return [
        ...prev.filter((link) => link.end <= selectionStart || link.start >= selectionEnd),
        { start: selectionStart, end: selectionEnd, href }
      ].sort((a, b) => a.start - b.start);
    });
    closeBodyLinkEditor();

    requestAnimationFrame(() => {
      const nextTextarea = bodyTemplateRef.current;
      if (!nextTextarea) return;
      nextTextarea.focus();
      nextTextarea.setSelectionRange(selectionEnd, selectionEnd);
    });
  };

  const handleExpandBodyLinkEditor = () => {
    setBodyLinkEditor((prev) => ({ ...prev, expanded: true }));
    requestAnimationFrame(() => {
      bodyLinkInputRef.current?.focus();
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
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (bodyTemplateEditorRef.current?.contains(target)) {
        return;
      }
      closeBodyLinkEditor();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const textarea = bodyTemplateRef.current;
      if (!textarea) return;
      if (bodyLinkInputRef.current && document.activeElement === bodyLinkInputRef.current) return;
      if (document.activeElement !== textarea) return;
      requestAnimationFrame(updateBodyLinkEditorFromSelection);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  useEffect(
    () => () => {
      if (resizeTemplateSaveTimeoutRef.current) {
        window.clearTimeout(resizeTemplateSaveTimeoutRef.current);
      }
    },
    []
  );

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
      setEmbeddedImages([]);
      setBodyLinks([]);
      closeBodyLinkEditor();
      return;
    }
    if (selectedTemplateForEditor) {
      const tokenized = tokenizeEmbeddedImagesForEditor(selectedTemplateForEditor.body_template);
      const parsedLinks = parseBodyLinksForEditor(tokenized.value);
      setTemplateForm({
        name: selectedTemplateForEditor.name,
        subject_template: selectedTemplateForEditor.subject_template,
        body_template: parsedLinks.value
      });
      setBodyLinks(parsedLinks.links);
      setEmbeddedImages(tokenized.list);
      closeBodyLinkEditor();
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

  const bodyTemplatePreviewValues = useMemo(() => {
    const previewEventData = previewEvent || eventData;
    const eventName = templatePreviewValues.event_name || 'Innhopp event';
    const eventScheduleUrl = buildEventScheduleUrl(previewEventData?.id);
    return {
      ...templatePreviewValues,
      event_name: `<a href="${escapeHtml(eventScheduleUrl)}">${escapeHtml(eventName)}</a>`
    };
  }, [eventData, previewEvent, templatePreviewValues]);

  const renderedEditorSubjectPreview = useMemo(
    () => renderTemplatePreview(templateForm.subject_template, templatePreviewValues),
    [templateForm.subject_template, templatePreviewValues]
  );

  const editorBodyTemplateHtml = useMemo(
    () => serializeBodyLinksForSave(templateForm.body_template, bodyLinks),
    [bodyLinks, templateForm.body_template]
  );

  const bodyEditorOverlayHtml = useMemo(
    () => renderBodyEditorOverlayHtml(templateForm.body_template, bodyLinks),
    [bodyLinks, templateForm.body_template]
  );

  const renderedEditorBodyPreview = useMemo(
    () =>
      expandEmbeddedImagePlaceholders(
        renderTemplatePreview(editorBodyTemplateHtml, bodyTemplatePreviewValues),
        embeddedImages
      ),
    [bodyTemplatePreviewValues, editorBodyTemplateHtml, embeddedImages]
  );

  const renderedEditorBodyPreviewHtml = useMemo(
    () => sanitizeEmailHtml(renderedEditorBodyPreview),
    [renderedEditorBodyPreview]
  );
  const renderedEditorBodyPreviewLayoutHtml = useMemo(
    () => normalizeEmailImageLayout(renderedEditorBodyPreviewHtml),
    [renderedEditorBodyPreviewHtml]
  );

  useEffect(() => {
    const previewBody = editorPreviewBodyRef.current;
    if (!previewBody) return;

    const cleanupFns: Array<() => void> = [];
    const images = Array.from(previewBody.querySelectorAll('img'));

    images.forEach((imageElement, imageIndex) => {
      let wrapper = imageElement.parentElement;
      if (!wrapper || !wrapper.classList.contains('comms-preview-resizable-image')) {
        const nextWrapper = document.createElement('span');
        nextWrapper.className = 'comms-preview-resizable-image';
        imageElement.parentNode?.insertBefore(nextWrapper, imageElement);
        nextWrapper.appendChild(imageElement);
        wrapper = nextWrapper;
      }

      wrapper.setAttribute('data-image-index', String(imageIndex));
      imageElement.setAttribute('draggable', 'false');

      wrapper.querySelectorAll('.comms-preview-resize-handle').forEach((handle) => handle.remove());

      (['nw', 'ne', 'sw', 'se'] as const).forEach((direction) => {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = `comms-preview-resize-handle is-${direction}`;
        handle.setAttribute('aria-label', `Resize image (${direction})`);
        handle.setAttribute('tabindex', '-1');
        wrapper?.appendChild(handle);

        const handlePointerDown = (event: PointerEvent) => {
          event.preventDefault();
          event.stopPropagation();

          const startX = event.clientX;
          const initialWidth = imageElement.getBoundingClientRect().width;
          const previewWidth = previewBody.getBoundingClientRect().width;
          const maxWidth = Math.max(96, previewWidth - 16);
          const isWest = direction.includes('w');
          let nextWidth = initialWidth;

          const handlePointerMove = (moveEvent: PointerEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const candidate = isWest ? initialWidth - deltaX : initialWidth + deltaX;
            nextWidth = Math.min(Math.max(candidate, 48), maxWidth);
            imageElement.style.width = `${nextWidth}px`;
            imageElement.style.height = 'auto';
          };

          const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            applyImageResizeFromPreviewIndex(imageIndex, nextWidth);
          };

          window.addEventListener('pointermove', handlePointerMove);
          window.addEventListener('pointerup', handlePointerUp);
          window.addEventListener('pointercancel', handlePointerUp);
        };

        handle.addEventListener('pointerdown', handlePointerDown);
        cleanupFns.push(() => handle.removeEventListener('pointerdown', handlePointerDown));
      });
    });

    return () => {
      cleanupFns.forEach((cleanup) => cleanup());
    };
  }, [applyImageResizeFromPreviewIndex, renderedEditorBodyPreviewLayoutHtml]);

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
        body_template: normalizeEmailImageLayout(
          expandEmbeddedImagePlaceholders(editorBodyTemplateHtml, embeddedImages)
        ),
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

  function queueAutoSaveResizedTemplate(
    nextBodyTemplate: string,
    nextEmbeddedImages: EmbeddedImageEntry[]
  ) {
    if (
      selectedTemplateEditorId === createTemplateEditorOption ||
      !derivedTemplateKey ||
      templateKeyDuplicate ||
      creatingTemplate
    ) {
      return;
    }

    if (resizeTemplateSaveTimeoutRef.current) {
      window.clearTimeout(resizeTemplateSaveTimeoutRef.current);
    }

    resizeTemplateSaveTimeoutRef.current = window.setTimeout(async () => {
      setCreatingTemplate(true);
      setError(null);
      try {
        const payload = {
          key: derivedTemplateKey,
          name: templateForm.name,
          subject_template: templateForm.subject_template,
          body_template: normalizeEmailImageLayout(
            expandEmbeddedImagePlaceholders(serializeBodyLinksForSave(nextBodyTemplate, bodyLinks), nextEmbeddedImages)
          ),
          audience_type: 'event_registrations',
          enabled: true
        };
        const template = await updateEmailTemplate(Number(selectedTemplateEditorId), payload);
        setTemplates((prev) => prev.map((current) => (current.id === template.id ? template : current)));
        if (selectedTemplateId === String(template.id)) {
          setSelectedTemplateId(String(template.id));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to auto-save template resize');
      } finally {
        setCreatingTemplate(false);
      }
    }, 250);
  }

  function applyImageResizeFromPreviewIndex(imageIndex: number, widthPx: number) {
    const clampedWidth = Math.max(48, Math.round(widthPx));
    const expandedBodyTemplate = expandEmbeddedImagePlaceholders(editorBodyTemplateHtml, embeddedImages);
    if (!expandedBodyTemplate) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(expandedBodyTemplate, 'text/html');
    const images = Array.from(doc.body.querySelectorAll('img'));
    const targetImage = images[imageIndex];
    if (!targetImage) return;

    targetImage.setAttribute('width', String(clampedWidth));
    targetImage.removeAttribute('height');

    const tokenized = tokenizeEmbeddedImagesForEditor(doc.body.innerHTML);
    const parsedLinks = parseBodyLinksForEditor(tokenized.value);
    setTemplateForm((prev) => ({ ...prev, body_template: parsedLinks.value }));
    setBodyLinks(parsedLinks.links);
    setEmbeddedImages(tokenized.list);
    queueAutoSaveResizedTemplate(parsedLinks.value, tokenized.list);
  }

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

  const linkPopoverLayout = useMemo(() => {
    const collapsedWidth = collapsedLinkPopoverHalfWidth * 2;
    const containerWidth = Math.max(bodyLinkEditor.containerWidth, collapsedWidth + 32);
    const minLeft = 16;
    const collapsedLeft = Math.min(
      Math.max(bodyLinkEditor.anchorLeft - collapsedLinkPopoverHalfWidth, minLeft),
      Math.max(containerWidth - collapsedWidth - 16, minLeft)
    );

    if (!bodyLinkEditor.expanded) {
      return {
        left: collapsedLeft,
        caretLeft: collapsedLinkPopoverHalfWidth,
        width: undefined as string | undefined
      };
    }

    const expandedWidth = Math.min(expandedLinkPopoverWidth, Math.max(containerWidth - 32, 220));
    const expandedLeft = Math.min(
      Math.max(bodyLinkEditor.anchorLeft - collapsedLinkPopoverHalfWidth, minLeft),
      Math.max(containerWidth - expandedWidth - 16, minLeft)
    );
    const expandedCaretLeft = Math.min(
      Math.max(bodyLinkEditor.anchorLeft - expandedLeft, collapsedLinkPopoverHalfWidth),
      expandedWidth - collapsedLinkPopoverHalfWidth
    );

    return {
      left: expandedLeft,
      caretLeft: expandedCaretLeft,
      width: `${expandedWidth}px`
    };
  }, [bodyLinkEditor.anchorLeft, bodyLinkEditor.containerWidth, bodyLinkEditor.expanded]);

  const canSaveBodyLink = isAllowedUrl(normalizeBodyLinkUrl(bodyLinkDraft), { allowRelative: true });

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
          <EventGearMenu
            eventId={eventData.id}
            currentPage="communications"
            copying={copying}
            deleting={deleting}
            menuId="event-comms-actions-menu"
            onCopy={handleCopy}
            onDelete={handleDelete}
          />
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
              <form className="stack comms-template-form" onSubmit={handleSaveTemplate}>
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
                    <div className="comms-body-editor" ref={bodyTemplateEditorRef}>
                      <div
                        ref={bodyTemplateOverlayRef}
                        className="comms-body-editor-overlay"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: bodyEditorOverlayHtml }}
                      />
                      {bodyLinkEditor.open ? (
                        <div className="comms-selection-highlight-layer" aria-hidden="true">
                          {bodyLinkEditor.highlightRects.map((rect, index) => (
                            <span
                              key={`${rect.left}-${rect.top}-${index}`}
                              className="comms-selection-highlight-rect"
                              style={{
                                left: `${rect.left}px`,
                                top: `${rect.top}px`,
                                width: `${rect.width}px`,
                                height: `${rect.height}px`
                              }}
                            />
                          ))}
                        </div>
                      ) : null}
                      {bodyLinkEditor.open ? (
                        <div
                          ref={bodyLinkPopoverRef}
                          className={`comms-selection-link-popover${bodyLinkEditor.expanded ? ' is-expanded' : ''}`}
                          style={
                            {
                              left: `${linkPopoverLayout.left}px`,
                              top: `${bodyLinkEditor.top}px`,
                              width: linkPopoverLayout.width,
                              '--comms-link-caret-left': `${linkPopoverLayout.caretLeft}px`
                            } as CSSProperties
                          }
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="comms-selection-link-icon"
                            aria-label={bodyLinkEditor.expanded ? 'Link tool' : 'Add link to selected text'}
                            onMouseDown={(event) => {
                              event.preventDefault();
                            }}
                            onClick={handleExpandBodyLinkEditor}
                          >
                            <span className="material-symbols-outlined comms-selection-link-glyph" aria-hidden="true">link</span>
                          </button>
                          {bodyLinkEditor.expanded ? (
                            <>
                              <input
                                ref={bodyLinkInputRef}
                                type="text"
                                value={bodyLinkDraft}
                                onChange={(event) => setBodyLinkDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    handleSaveBodySelectionLink();
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    closeBodyLinkEditor();
                                  }
                                }}
                                placeholder="https://example.com"
                                aria-label="Link URL"
                              />
                              <button
                                type="button"
                                className="comms-selection-link-action"
                                aria-label="Save link"
                                disabled={!canSaveBodyLink}
                                onClick={handleSaveBodySelectionLink}
                              >
                                <span className="material-symbols-outlined comms-selection-link-glyph" aria-hidden="true">check</span>
                              </button>
                              <button
                                type="button"
                                className="comms-selection-link-action"
                                aria-label="Close link editor"
                                onClick={closeBodyLinkEditor}
                              >
                                <span className="material-symbols-outlined comms-selection-link-glyph" aria-hidden="true">close</span>
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      <textarea
                        ref={bodyTemplateRef}
                        className="comms-body-template-textarea"
                        value={templateForm.body_template}
                        onFocus={() => {
                          activeTemplateFieldRef.current = 'body_template';
                        }}
                        onBlur={() => {
                          requestAnimationFrame(() => {
                            const active = document.activeElement as HTMLElement | null;
                            if (active && bodyLinkPopoverRef.current?.contains(active)) {
                              return;
                            }
                            if (document.activeElement !== bodyLinkInputRef.current) {
                              closeBodyLinkEditor();
                            }
                          });
                        }}
                        onChange={(e) => {
                          closeBodyLinkEditor();
                          const result = applyBodyTemplateEditorTextChange(
                            templateForm.body_template,
                            e.target.value,
                            bodyLinks
                          );
                          setBodyLinks(result.links);
                          setTemplateForm((prev) => ({ ...prev, body_template: result.value }));
                          if (result.selectionStart !== null) {
                            requestAnimationFrame(() => {
                              const textarea = bodyTemplateRef.current;
                              if (!textarea) return;
                              textarea.setSelectionRange(result.selectionStart, result.selectionStart);
                            });
                          }
                        }}
                        onClick={handleBodyTemplateClick}
                        onSelect={() => requestAnimationFrame(updateBodyLinkEditorFromSelection)}
                        onKeyUp={() => requestAnimationFrame(updateBodyLinkEditorFromSelection)}
                        onMouseUp={() => requestAnimationFrame(updateBodyLinkEditorFromSelection)}
                        onScroll={() => {
                          syncBodyTemplateOverlayScroll();
                          requestAnimationFrame(updateBodyLinkEditorFromSelection);
                        }}
                        placeholder={'Hi {{participant_name}},\nYour deposit for {{event_name}} is due on {{deposit_due_at}}.'}
                      />
                    </div>
                    <div className="detail-actions comms-template-actions">
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
                      <div className="comms-template-tools" role="toolbar" aria-label="Body template tools">
                        <button
                          type="button"
                          className="ghost"
                          onClick={handleInsertImageClick}
                        >
                          Insert image
                        </button>
                        <input
                          ref={bodyImageInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleBodyImageSelected}
                        />
                      </div>
                    </div>
                  </label>
                </div>
                {templateKeyDuplicate ? (
                  <p className="error-text comms-inline-note">A template with this generated name/key already exists.</p>
                ) : null}
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

            <TemplateRenderedPreview
              label={<>Rendered preview: {templateForm.name.trim() || 'No template selected'}</>}
              subject={renderedEditorSubjectPreview}
              subjectFallback="No subject preview yet"
              body={renderedEditorBodyPreview}
              bodyHtml={renderedEditorBodyPreviewLayoutHtml}
              bodyFallback="No body preview yet"
              bodyRef={editorPreviewBodyRef}
              panelElement="aside"
            />
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

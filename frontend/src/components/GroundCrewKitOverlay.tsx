import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { GroundCrewKit, updateGroundCrewKitItem } from '../api/groundCrewKit';

type KitItem = { key: string; label: string; detail?: string; icon: string; group: 'essentials' | 'bag' | 'metal-box' };

const kitItems: KitItem[] = [
  { key: 'stretcher', label: 'Stretcher', detail: 'Ready for immediate deployment', icon: '🛟', group: 'essentials' },
  { key: 'medical_kit', label: 'Medical kit', detail: 'Approved and complete', icon: '✚', group: 'essentials' },
  { key: 'windsock_bag', label: 'Bag with windsock set', detail: 'Windsock, 12 poles and 4 windblade sockets', icon: '🧭', group: 'bag' },
  { key: 'metal_box', label: 'Small metal box', detail: 'Open it and confirm each item below', icon: '🧰', group: 'metal-box' },
  { key: 'target_t', label: 'Target T', icon: 'T', group: 'metal-box' },
  { key: 'radio', label: 'Radio', icon: '◉', group: 'metal-box' },
  { key: 'emergency_plan', label: 'Emergency plan', detail: 'Priority call list', icon: '!', group: 'metal-box' },
  { key: 'marking_band', label: '10 marking bands', detail: '20 m each', icon: '⌁', group: 'metal-box' },
  { key: 'small_flags', label: '20 small flags', icon: '⚑', group: 'metal-box' },
  { key: 'windblades', label: '4 windblades', icon: '✥', group: 'metal-box' },
  { key: 'banners', label: '6 banners', icon: '▰', group: 'metal-box' },
  { key: 'location_flag', label: 'Location flag', icon: '⚐', group: 'metal-box' }
];

type Props = { innhoppId: number; title: string; sequence: number; scheduledAt?: string | null; kit: GroundCrewKit; onClose: () => void; onUpdated: (kit: GroundCrewKit) => void };

export default function GroundCrewKitOverlay({ innhoppId, title, sequence, scheduledAt, kit: initialKit, onClose, onUpdated }: Props) {
  const [kit, setKit] = useState(initialKit);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const checked = new Set(kit.items.filter((item) => item.checked).map((item) => item.key));
  const progress = checked.size / kitItems.length;
  const date = scheduledAt ? new Date(scheduledAt) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Time not scheduled';

  const toggle = async (key: string) => {
    setSaving(key); setError('');
    try {
      const updated = await updateGroundCrewKitItem(innhoppId, key, !checked.has(key));
      setKit(updated); onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save kit item');
    } finally { setSaving(null); }
  };
  const renderGroup = (group: KitItem['group'], heading: string, subheading: string) => <section className={`ground-kit-group ground-kit-group--${group}`}>
    <header><div><h4>{heading}</h4><p>{subheading}</p></div><span>{kitItems.filter((item) => item.group === group && checked.has(item.key)).length}/{kitItems.filter((item) => item.group === group).length}</span></header>
    <div className="ground-kit-items">{kitItems.filter((item) => item.group === group).map((item) => <label key={item.key} className={`ground-kit-item${checked.has(item.key) ? ' checked' : ''}${saving === item.key ? ' saving' : ''}`}>
      <input type="checkbox" checked={checked.has(item.key)} disabled={saving !== null} onChange={() => void toggle(item.key)} />
      <span className="ground-kit-icon" aria-hidden="true">{item.icon}</span><span className="ground-kit-item-copy"><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span><span className="ground-kit-tick">✓</span>
    </label>)}</div>
  </section>;
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="event-schedule-preview-backdrop ground-kit-backdrop" onClick={onClose} role="presentation"><section className="card overlay-panel-with-close ground-kit-overlay" role="dialog" aria-modal="true" aria-labelledby="ground-kit-title" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="overlay-close-button overlay-close-top-left" aria-label="Close ground crew kit checklist" onClick={onClose}>×</button>
    <div className="ground-kit-hero"><div><span className="ground-kit-eyebrow">GROUND CREW • FIELD INVENTORY</span><h3 id="ground-kit-title">{title}</h3><p>Innhopp #{sequence} · {dateLabel}</p></div><div className="ground-kit-progress" style={{ '--kit-progress': `${progress * 360}deg` } as CSSProperties}><strong>{checked.size}</strong><span>of {kitItems.length}</span></div></div>
    {error && <p className="form-error">{error}</p>}
    {renderGroup('essentials', 'The four-piece kit', 'Life-saving essentials')}
    {renderGroup('bag', 'Wind & landing bag', 'The landing picture')}
    {renderGroup('metal-box', 'Small metal box', 'Top-to-bottom inventory')}
  </section></div>, document.body);
}

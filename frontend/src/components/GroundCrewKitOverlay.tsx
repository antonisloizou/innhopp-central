import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { GroundCrewKit, updateGroundCrewKitItem, updateGroundCrewReturnKitItem } from '../api/groundCrewKit';

type KitItem = { key: string; label: string; icon: string; group: 'essentials' | 'bag' | 'metal-box' };

const kitItems: KitItem[] = [
  { key: 'stretcher', label: 'Stretcher', icon: 'airline_seat_flat', group: 'essentials' },
  { key: 'medical_kit', label: 'Medical Kit', icon: '✚', group: 'essentials' },
  { key: 'windsock', label: 'Windsock', icon: 'label_important', group: 'bag' },
  { key: 'poles', label: '12 x Poles', icon: '┃', group: 'bag' },
  { key: 'windblade_sockets', label: '4x Windblade Sockets', icon: 'create', group: 'bag' },
  { key: 'target_t', label: 'T', icon: 'T', group: 'metal-box' },
  { key: 'radio', label: 'Radio', icon: 'cell_tower', group: 'metal-box' },
  { key: 'emergency_plan', label: 'Emergency Plan', icon: '!', group: 'metal-box' },
  { key: 'marking_band', label: '10 x 20m Marking Bands', icon: 'gesture', group: 'metal-box' },
  { key: 'small_flags', label: '20 x Small Flags', icon: 'tour', group: 'metal-box' },
  { key: 'windblades', label: '4 x Windblades', icon: '✥', group: 'metal-box' },
  { key: 'banners', label: '6 x Banners', icon: '▰', group: 'metal-box' },
  { key: 'location_flag', label: 'Location Flag', icon: 'emoji_flags', group: 'metal-box' }
];

type Props = { innhoppId: number; title: string; sequence: number; scheduledAt?: string | null; kit: GroundCrewKit; stage?: 'site_clearing'; onClose: () => void; onUpdated: (kit: GroundCrewKit) => void };

export default function GroundCrewKitOverlay({ innhoppId, title, sequence, scheduledAt, kit: initialKit, stage, onClose, onUpdated }: Props) {
  const [kit, setKit] = useState(initialKit);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const checked = new Set(kit.items.filter((item) => item.checked).map((item) => item.key));
  const progress = checked.size / kitItems.length;
  const date = scheduledAt ? new Date(scheduledAt) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', hour12: false }) : 'Time not scheduled';

  useEffect(() => {
    document.body.classList.add('ground-kit-overlay-open');
    return () => document.body.classList.remove('ground-kit-overlay-open');
  }, []);

  const toggle = async (key: string) => {
    setSaving(key); setError('');
    try {
      const updated = await (stage ? updateGroundCrewReturnKitItem(innhoppId, key, !checked.has(key)) : updateGroundCrewKitItem(innhoppId, key, !checked.has(key)));
      setKit(updated); onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save kit item');
    } finally { setSaving(null); }
  };
  const renderGroup = (group: KitItem['group'], heading: string, subheading: string) => <section className={`ground-kit-group ground-kit-group--${group}`}>
    <header><div><h4>{heading}</h4>{subheading && <p>{subheading}</p>}</div><span>{kitItems.filter((item) => item.group === group && checked.has(item.key)).length}/{kitItems.filter((item) => item.group === group).length}</span></header>
    <div className="ground-kit-items">{kitItems.filter((item) => item.group === group).map((item) => <label key={item.key} className={`ground-kit-item${checked.has(item.key) ? ' checked' : ''}${saving === item.key ? ' saving' : ''}`}>
      <input type="checkbox" checked={checked.has(item.key)} disabled={saving !== null} onChange={() => void toggle(item.key)} />
      <span className={`ground-kit-icon${item.key === 'stretcher' || item.key === 'windsock' || item.key === 'windblade_sockets' || item.key === 'radio' || item.key === 'location_flag' || item.key === 'small_flags' || item.key === 'marking_band' ? ' material-symbols-outlined' : ''}`} aria-hidden="true">{item.icon}</span><span className="ground-kit-item-copy"><strong>{item.label}</strong></span><span className="ground-kit-tick">✓</span>
    </label>)}</div>
  </section>;
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="event-schedule-preview-backdrop ground-kit-backdrop" onClick={onClose} role="presentation"><section className="card overlay-panel-with-close ground-kit-overlay" role="dialog" aria-modal="true" aria-labelledby="ground-kit-title" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="overlay-close-button overlay-close-top-left" aria-label="Close ground crew kit checklist" onClick={onClose}>×</button>
    <div className="ground-kit-hero"><div><span className="ground-kit-eyebrow">GROUND CREW INVENTORY</span><h3 id="ground-kit-title">#{sequence} {title}</h3><p>{dateLabel}</p></div><div className="ground-kit-progress" style={{ '--kit-progress': `${progress * 360}deg` } as CSSProperties}><strong>{checked.size}</strong><span>of {kitItems.length}</span></div></div>
    {error && <p className="form-error">{error}</p>}
    <div className="ground-kit-top-groups">
      {renderGroup('essentials', 'First Aid', '')}
      {renderGroup('bag', 'Windsock Bag', '')}
    </div>
    {renderGroup('metal-box', 'Small Metal Box', 'Top-to-bottom inventory')}
  </section></div>, document.body);
}

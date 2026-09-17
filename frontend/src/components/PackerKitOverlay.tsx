import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GroundCrewKit } from '../api/groundCrewKit';
import { updatePackerKitItem, updatePackerReturnKitItem } from '../api/packerKit';
import { usePreserveOverlayScroll } from '../hooks/usePreserveOverlayScroll';

type KitItem = { key: string; label: string; detail?: string; icon: string; group: 'equipment' | 'large_metal_box' | 'kiosk_box' | 'shop_box' };

const kitItems: KitItem[] = [
  { key: 'speaker', label: 'Speaker', icon: 'volume_up', group: 'equipment' },
  { key: 'generator', label: 'Generator', icon: 'bolt', group: 'equipment' },
  { key: 'table', label: 'Table', icon: 'table_restaurant', group: 'equipment' },
  { key: 'chairs', label: '5 x Chairs', icon: 'chair', group: 'equipment' },
  { key: 'packing_mat', label: 'Packing Mat', icon: 'texture', group: 'large_metal_box' },
  { key: 'rubber_bands_loops_pullupcords', label: 'Rubber Bands, Loops & Pull-Up Cords', icon: 'all_inclusive', group: 'large_metal_box' },
  { key: 'banners', label: '4 x Banners', icon: 'flag', group: 'large_metal_box' },
  { key: 'extension_cable_multiplier', label: 'Extension Cable / Multiplier', icon: 'power', group: 'large_metal_box' },
  { key: 'office_box', label: 'Office Box', detail: 'Innhopp Briefing Drawings and Other Office Supplies', icon: 'folder', group: 'large_metal_box' },
  { key: 'coffee_maker', label: 'Coffee Maker', icon: 'coffee', group: 'large_metal_box' },
  { key: 'cups', label: 'Cups', icon: 'local_cafe', group: 'large_metal_box' },
  { key: 'beverages', label: 'Water and Beverages', icon: 'local_drink', group: 'kiosk_box' },
  { key: 'snacks', label: 'Snacks', icon: 'lunch_dining', group: 'kiosk_box' },
  { key: 'fruit', label: 'Fruit', icon: 'nutrition', group: 'kiosk_box' },
  { key: 't_shirts', label: 'T-Shirts', icon: 'apparel', group: 'shop_box' },
  { key: 'innhopp_gadgets', label: 'Innhopp Gadgets', icon: 'deployed_code', group: 'shop_box' },
  { key: 'souvenirs', label: 'Souvenirs', icon: 'redeem', group: 'shop_box' }
];

type Props = { innhoppId: number; title: string; sequence: number; scheduledAt?: string | null; kit: GroundCrewKit; stage?: 'site_clearing'; onClose: () => void; onUpdated: (kit: GroundCrewKit) => void };

export default function PackerKitOverlay({ innhoppId, title, sequence, scheduledAt, kit: initialKit, stage, onClose, onUpdated }: Props) {
  const [kit, setKit] = useState(initialKit);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const checked = new Set(kit.items.filter((item) => item.checked).map((item) => item.key));
  const absent = new Set(kit.items.filter((item) => item.absent).map((item) => item.key));
  const progress = checked.size / kitItems.length;
  const date = scheduledAt ? new Date(scheduledAt) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', hour12: false }) : 'Time not scheduled';

  usePreserveOverlayScroll();

  const toggle = async (key: string) => {
    setSaving(key); setError('');
    try {
      const updated = await (stage ? updatePackerReturnKitItem(innhoppId, key, !checked.has(key), false) : updatePackerKitItem(innhoppId, key, !checked.has(key), false));
      setKit(updated); onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save packing kit item');
    } finally { setSaving(null); }
  };
  const toggleAbsent = async (key: string) => {
    setSaving(key); setError('');
    try {
      const updated = await (stage ? updatePackerReturnKitItem(innhoppId, key, false, !absent.has(key)) : updatePackerKitItem(innhoppId, key, false, !absent.has(key)));
      setKit(updated); onUpdated(updated);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save packing kit item'); } finally { setSaving(null); }
  };

  const renderGroup = (group: KitItem['group'], heading: string, container = false) => {
    const items = kitItems.filter((item) => item.group === group);
    const completed = items.filter((item) => checked.has(item.key)).length;
    return <section className={`ground-kit-group${container ? ' ground-kit-group--metal-box' : ''}`}>
      <header><div><h4>{heading}</h4></div><span>{completed}/{items.length}</span></header>
      <div className="ground-kit-items">{items.map((item) => <div key={item.key} className={`ground-kit-item${checked.has(item.key) ? ' checked' : ''}${absent.has(item.key) ? ' absent' : ''}${saving === item.key ? ' saving' : ''}`}>
        <span className="ground-kit-icon material-symbols-outlined" aria-hidden="true">{item.icon}</span><span className="ground-kit-item-copy"><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span><button type="button" className="ground-kit-tick" aria-label={`Mark ${item.label} as ${checked.has(item.key) ? 'unchecked' : 'checked'}`} disabled={saving !== null} onClick={() => void toggle(item.key)}>✓</button><button type="button" className="ground-kit-absent" aria-pressed={absent.has(item.key)} aria-label={`${absent.has(item.key) ? 'Restore' : 'Mark'} ${item.label} as absent`} disabled={saving !== null} onClick={() => void toggleAbsent(item.key)}>×</button>
      </div>)}</div>
    </section>;
  };

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="event-schedule-preview-backdrop ground-kit-backdrop" onClick={onClose} role="presentation"><section className="card overlay-panel-with-close ground-kit-overlay" role="dialog" aria-modal="true" aria-labelledby="packer-kit-title" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="overlay-close-button overlay-close-top-left" aria-label="Close packing kit checklist" onClick={onClose}>×</button>
    <div className="ground-kit-hero"><div><span className="ground-kit-eyebrow">PACKER INVENTORY</span><h3 id="packer-kit-title">#{sequence} {title}</h3><p>{dateLabel}</p></div><div className="ground-kit-progress" style={{ '--kit-progress': `${progress * 360}deg` } as CSSProperties}><strong>{checked.size}</strong><span>of {kitItems.length}</span></div></div>
    {error && <p className="form-error">{error}</p>}
    {renderGroup('equipment', 'Large Items')}
    {renderGroup('large_metal_box', 'Large Metal Box', true)}
    <div className="ground-kit-top-groups">
      {renderGroup('kiosk_box', 'Kiosk Box', true)}
      {renderGroup('shop_box', 'Shop Box', true)}
    </div>
  </section></div>, document.body);
}

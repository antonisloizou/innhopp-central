import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GroundCrewKit } from '../api/groundCrewKit';
import { updatePackerTask } from '../api/packerTasks';
import { usePreserveOverlayScroll } from '../hooks/usePreserveOverlayScroll';

const tasks = [
  ['packing_mat_and_speaker', 'Put out the packing mat and the speaker (5 min)', 'Accessories, rubber bands, pullup cords'],
  ['table_chairs_and_boxes', 'Set out table and chairs, office, and kiosk box (5 min)'],
  ['power_supply', 'Get power supply (5 min)', 'Start the generator if needed, or connect to electricity via extension cable'],
  ['banners_and_decoration', 'Put out banners and decoration (10 min)'],
  ['coffee_and_landing_beer', 'Make coffee / prepare the landing beer (5 min)']
] as const;

type Props = { innhoppId: number; title: string; sequence: number; scheduledAt?: string | null; taskList: GroundCrewKit; onClose: () => void; onUpdated: (next: GroundCrewKit) => void };

export default function PackerTaskListOverlay({ innhoppId, title, sequence, scheduledAt, taskList: initial, onClose, onUpdated }: Props) {
  const [taskList, setTaskList] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const checked = new Set(taskList.items.filter((item) => item.checked).map((item) => item.key));
  const date = scheduledAt ? new Date(scheduledAt) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', hour12: false }) : 'Time not scheduled';
  usePreserveOverlayScroll();
  const toggle = async (key: string) => { setSaving(key); try { const next = await updatePackerTask(innhoppId, key, !checked.has(key)); setTaskList(next); onUpdated(next); } finally { setSaving(null); } };
  if (typeof document === 'undefined') return null;

  return createPortal(<div className="event-schedule-preview-backdrop ground-kit-backdrop" onClick={onClose} role="presentation"><section className="card overlay-panel-with-close ground-kit-overlay" role="dialog" aria-modal="true" aria-labelledby="packer-task-list-title" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="overlay-close-button overlay-close-top-left" aria-label="Close task list" onClick={onClose}>×</button>
    <div className="ground-kit-hero"><div><span className="ground-kit-eyebrow">PACKER TASK LIST · 30 MIN</span><h3 id="packer-task-list-title">#{sequence} {title}</h3><p>{dateLabel}</p></div><div className="ground-kit-progress" style={{ '--kit-progress': `${checked.size / tasks.length * 360}deg` } as CSSProperties}><strong>{checked.size}</strong><span>of {tasks.length}</span></div></div>
    <section className="ground-kit-group ground-task-list"><header><div><h4>Task List</h4></div><span>{checked.size}/{tasks.length}</span></header><div className="ground-kit-items">{tasks.map(([key, label, detail], index) => <div key={key} className={`ground-kit-item${checked.has(key) ? ' checked' : ''}${saving === key ? ' saving' : ''}`}><span className="ground-task-number">{index + 1}</span><span className="ground-kit-item-copy"><strong>{label}</strong>{detail && <small>{detail}</small>}</span><button type="button" className="ground-kit-tick" aria-label={`Mark ${label} as ${checked.has(key) ? 'unchecked' : 'checked'}`} disabled={saving !== null} onClick={() => void toggle(key)}>✓</button></div>)}</div></section>
  </section></div>, document.body);
}

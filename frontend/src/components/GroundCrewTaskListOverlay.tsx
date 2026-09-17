import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GroundCrewKit } from '../api/groundCrewKit';
import { updateGroundCrewTask } from '../api/groundCrewTasks';

const tasks = [
  ['deploy_emergency_kit', 'Unload stretcher, medical kit, windsock bag, small metal box'],
  ['marking_tape', 'Lay out 20m marking tape every 10m until 50m before & after the T (5 min)'],
  ['national_flags', 'Put up small national flags at start & finish of each marking tape (5 min)'],
  ['windblades', 'Set up 4 windblades in a square 25m front/back & 25m right/left of the T (10 min)'],
  ['banners', 'Put up 6 banners 60m front/back & 30m left/right of the T (5 min)']
] as const;

type Props = { innhoppId: number; title: string; sequence: number; scheduledAt?: string | null; taskList: GroundCrewKit; onClose: () => void; onUpdated: (next: GroundCrewKit) => void };
export default function GroundCrewTaskListOverlay({ innhoppId, title, sequence, scheduledAt, taskList: initial, onClose, onUpdated }: Props) {
  const [taskList, setTaskList] = useState(initial); const [saving, setSaving] = useState<string | null>(null);
  const checked = new Set(taskList.items.filter((item) => item.checked).map((item) => item.key));
  const date = scheduledAt ? new Date(scheduledAt) : null; const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', hour12: false }) : 'Time not scheduled';
  useEffect(() => { document.body.classList.add('ground-kit-overlay-open'); return () => document.body.classList.remove('ground-kit-overlay-open'); }, []);
  const toggle = async (key: string) => { setSaving(key); try { const next = await updateGroundCrewTask(innhoppId, key, !checked.has(key)); setTaskList(next); onUpdated(next); } finally { setSaving(null); } };
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="event-schedule-preview-backdrop ground-kit-backdrop" onClick={onClose} role="presentation"><section className="card overlay-panel-with-close ground-kit-overlay" role="dialog" aria-modal="true" aria-labelledby="ground-task-list-title" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="overlay-close-button overlay-close-top-left" aria-label="Close task list" onClick={onClose}>×</button>
    <div className="ground-kit-hero"><div><span className="ground-kit-eyebrow">GROUND CREW TASK LIST · 30 MIN</span><h3 id="ground-task-list-title">#{sequence} {title}</h3><p>{dateLabel}</p></div><div className="ground-kit-progress" style={{ '--kit-progress': `${checked.size / tasks.length * 360}deg` } as CSSProperties}><strong>{checked.size}</strong><span>of {tasks.length}</span></div></div>
    <section className="ground-kit-group ground-task-list"><header><div><h4>Task List</h4></div><span>{checked.size}/{tasks.length}</span></header><div className="ground-kit-items">{tasks.map(([key, label], index) => <Fragment key={key}>{index === 3 && <div className="ground-task-divider"><span>Briefing</span></div>}<label className={`ground-kit-item${checked.has(key) ? ' checked' : ''}`}><input type="checkbox" checked={checked.has(key)} disabled={saving !== null} onChange={() => void toggle(key)} /><span className="ground-task-number">{index + 1}</span><span className="ground-kit-item-copy"><strong>{label}</strong></span><span className="ground-kit-tick">✓</span></label></Fragment>)}</div></section>
  </section></div>, document.body);
}

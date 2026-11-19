import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getStaffMeeting, StaffMeetingItem, StaffMeetingItemKind, updateStaffMeeting } from '../api/events';
import { normalizeStaffMeetingItems } from '../utils/staffMeeting';

type Props = { eventId:number; meetingDate:string; dayLabel:string; innhopps:{ id:number; name:string; sequence:number }[]; onClose:() => void };

const makeID = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function StaffMeetingOverlay({ eventId, meetingDate, dayLabel, innhopps, onClose }:Props) {
  const [items, setItems] = useState<StaffMeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newAgenda, setNewAgenda] = useState('');
  const [newTomorrow, setNewTomorrow] = useState('');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const scrollY = window.scrollY;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getStaffMeeting(eventId, meetingDate).then((meeting) => {
      if (!active) return;
      setItems(normalizeStaffMeetingItems(meeting.items, innhopps));
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : 'Failed to load staff meeting');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, meetingDate, innhopps]);

  const save = async (next:StaffMeetingItem[]) => {
    const previous = itemsRef.current;
    setItems(next);
    itemsRef.current = next;
    setSaving(true);
    setError(null);
    try {
      const meeting = await updateStaffMeeting(eventId, meetingDate, next);
      setItems(meeting.items);
      itemsRef.current = meeting.items;
    } catch (err) {
      setItems(previous);
      itemsRef.current = previous;
      setError(err instanceof Error ? err.message : 'Failed to save staff meeting');
    } finally { setSaving(false); }
  };

  const addItem = (event:FormEvent, kind:StaffMeetingItemKind) => {
    event.preventDefault();
    const value = (kind === 'agenda' ? newAgenda : newTomorrow).trim();
    if (!value || saving) return;
    void save([...itemsRef.current, { id:makeID(), title:value, kind, checked:false }]);
    if (kind === 'agenda') setNewAgenda(''); else setNewTomorrow('');
  };

  const renderItems = (kind:StaffMeetingItemKind) => items.filter((item) => item.kind === kind && !item.id.startsWith('innhopp-')).map((item) => <div key={item.id} className="staff-meeting-item-group">
    <article className={`card staff-meeting-item${item.checked ? ' completed' : ''}${item.id === 'default-4' ? ' staff-meeting-item--heading' : ''}`}>
      {item.id !== 'default-4' ? <button type="button" className="checklist-complete-action" disabled={saving} aria-label={`${item.checked ? 'Reopen' : 'Complete'} ${item.title}`} onClick={() => void save(itemsRef.current.map((current) => current.id === item.id ? {...current, checked:!current.checked} : current))}>
        <span className={`checklist-mark ${item.checked ? 'checklist-mark--completed' : 'checklist-mark--unchecked'}`} aria-hidden="true">{item.checked ? '✓' : ''}</span>
      </button> : null}
      <div className="staff-meeting-item-copy">
        <strong>{item.title}</strong>
        {kind === 'agenda' && item.id !== 'default-4' ? <textarea aria-label={`Notes for ${item.title}`} rows={2} maxLength={10000} placeholder="Add notes…" defaultValue={item.notes || ''} onBlur={(event) => {
          const notes = event.currentTarget.value.trim();
          if (notes !== (item.notes || '')) void save(itemsRef.current.map((current) => current.id === item.id ? {...current, notes} : current));
        }} /> : null}
        {kind === 'tomorrow' ? <input className="staff-meeting-checklist-note-input" aria-label={`${item.id === 'default-tomorrow-8' ? 'Staff name' : 'Notes'} for ${item.title}`} maxLength={300} placeholder={item.id === 'default-tomorrow-8' ? 'Staff name' : 'Notes'} defaultValue={item.notes || ''} onBlur={(event) => {
          const notes = event.currentTarget.value.trim();
          if (notes !== (item.notes || '')) void save(itemsRef.current.map((current) => current.id === item.id ? {...current, notes} : current));
        }} /> : null}
      </div>
      {item.id.startsWith('custom-') ? <button type="button" className="ghost staff-meeting-remove" disabled={saving} aria-label={`Remove ${item.title}`} onClick={() => void save(itemsRef.current.filter((current) => current.id !== item.id))}>Remove</button> : null}
    </article>
    {item.id === 'default-4' ? renderInnhopps() : null}
  </div>);

  const renderInnhopps = () => <div className="staff-meeting-innhopps">
    {items.filter((item) => item.id.startsWith('innhopp-')).map((item, index) => <div key={item.id} className={`staff-meeting-innhopp${item.checked ? ' completed' : ''}`}>
      <button type="button" className="checklist-complete-action" disabled={saving} aria-label={`${item.checked ? 'Reopen' : 'Complete'} ${item.title}`} onClick={() => void save(itemsRef.current.map((current) => current.id === item.id ? {...current, checked:!current.checked} : current))}>
        <span className={`checklist-mark ${item.checked ? 'checklist-mark--completed' : 'checklist-mark--unchecked'}`} aria-hidden="true">{item.checked ? '✓' : ''}</span>
      </button>
      <div className="staff-meeting-innhopp-copy"><strong>#{index + 1} {item.title}</strong>
        <textarea aria-label={`Notes for ${item.title}`} rows={2} maxLength={10000} placeholder="Add notes…" defaultValue={item.notes || ''} onBlur={(event) => {
          const notes = event.currentTarget.value.trim();
          if (notes !== (item.notes || '')) void save(itemsRef.current.map((current) => current.id === item.id ? {...current, notes} : current));
        }} />
      </div>
    </div>)}
    {innhopps.length === 0 ? <p className="muted">No Innhopps scheduled for this day.</p> : null}
  </div>;

  return createPortal(<div className="staff-meeting-overlay" role="presentation" onClick={onClose}>
    <section className="card overlay-panel-with-close staff-meeting-panel" role="dialog" aria-modal="true" aria-labelledby="staff-meeting-title" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="overlay-close-button overlay-close-top-left" aria-label="Close daily staff meeting" onClick={onClose}>×</button>
      <header className="staff-meeting-header">
        <div><h2 id="staff-meeting-title">Daily staff meeting</h2><p>{dayLabel}</p></div>
        <span className="staff-meeting-save-state" aria-live="polite">{saving ? 'Saving…' : ''}</span>
      </header>
      {loading ? <p className="muted">Loading meeting…</p> : <>
        <section className="staff-meeting-section"><h3>Agenda</h3>{renderItems('agenda')}
          <form className="staff-meeting-add" onSubmit={(event) => addItem(event, 'agenda')}><input value={newAgenda} maxLength={300} onChange={(event) => setNewAgenda(event.target.value)} placeholder="Add agenda item" aria-label="New agenda item"/><button type="submit" className="primary" disabled={!newAgenda.trim() || saving}>Add</button></form>
        </section>
        <section className="staff-meeting-section"><h3>Checklist for tomorrow</h3>{renderItems('tomorrow')}
          <form className="staff-meeting-add" onSubmit={(event) => addItem(event, 'tomorrow')}><input value={newTomorrow} maxLength={300} onChange={(event) => setNewTomorrow(event.target.value)} placeholder="Add checklist item" aria-label="New checklist item for tomorrow"/><button type="submit" className="primary" disabled={!newTomorrow.trim() || saving}>Add</button></form>
        </section>
      </>}
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  </div>, document.body);
}

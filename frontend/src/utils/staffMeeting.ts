import { StaffMeetingItem } from '../api/events';

export type StaffMeetingInnhopp = { id:number; name:string; sequence:number };

export const defaultStaffMeetingAgenda:StaffMeetingItem[] = [
  { id:'default-1', title:'What went well', kind:'agenda', checked:false },
  { id:'default-2', title:'What went wrong', kind:'agenda', checked:false },
  { id:'default-3', title:'What we can improve', kind:'agenda', checked:false },
  { id:'default-4', title:'Innhopps', kind:'agenda', checked:false },
  { id:'default-6', title:'Expenses', kind:'agenda', checked:false },
  { id:'default-7', title:"Tommorrow's Weather", kind:'agenda', checked:false },
  { id:'default-8', title:'Ground Crew status', kind:'agenda', checked:false },
  { id:'default-9', title:'Safety incidents', kind:'agenda', checked:false },
  { id:'default-10', title:'Transport and accommodation issues', kind:'agenda', checked:false },
  { id:'default-11', title:'Schedule changes', kind:'agenda', checked:false },
  { id:'default-12', title:'Communications requiring follow-up', kind:'agenda', checked:false },
  { id:'default-13', title:'Review open tasks', kind:'agenda', checked:false }
];

export const defaultStaffMeetingChecklist:StaffMeetingItem[] = [
  { id:'default-tomorrow-0', title:'Review schedule for tomorrow', kind:'tomorrow', checked:false },
  { id:'default-tomorrow-1', title:'Share Pilot brief with pilots', kind:'tomorrow', checked:false },
  { id:'default-tomorrow-2', title:'Charge radios and other equipment', kind:'tomorrow', checked:false },
  { id:'default-tomorrow-3', title:'Confirm accommodation and meals', kind:'tomorrow', checked:false },
  { id:'default-tomorrow-7', title:'Accommodation for Staff leaving early (ground crew, pilots, etc)', kind:'tomorrow', checked:false },
  { id:'default-tomorrow-4', title:'Confirm staff assignments', kind:'tomorrow', checked:false },
  { id:'default-tomorrow-8', title:'Assign staff to lead participant meeting and group presentations', kind:'tomorrow', checked:false },
  { id:'default-tomorrow-5', title:'Confirm ground transport', kind:'tomorrow', checked:false },
  { id:'default-tomorrow-6', title:'Bring Water', kind:'tomorrow', checked:false }
];

const mergeDefault = (item:StaffMeetingItem, current:StaffMeetingItem | undefined):StaffMeetingItem => ({
  ...item,
  checked:current?.checked || false,
  ...(current?.notes ? { notes:current.notes } : {})
});

export const normalizeStaffMeetingItems = (
  items:StaffMeetingItem[],
  innhopps:StaffMeetingInnhopp[]
):StaffMeetingItem[] => {
  const currentByID = new Map(items.map((item) => [item.id, item]));
  const agendaDefaultIDs = new Set(defaultStaffMeetingAgenda.map((item) => item.id));
  const checklistDefaultIDs = new Set(defaultStaffMeetingChecklist.map((item) => item.id));
  const seenCustomIDs = new Set<string>();

  const customItems = items.filter((item) => {
    if (item.id === 'default-5' || item.id.startsWith('innhopp-')) return false;
    if (agendaDefaultIDs.has(item.id) || checklistDefaultIDs.has(item.id)) return false;
    if (seenCustomIDs.has(item.id)) return false;
    seenCustomIDs.add(item.id);
    return item.kind === 'agenda' || item.kind === 'tomorrow';
  });

  const agenda = defaultStaffMeetingAgenda.map((item) => mergeDefault(item, currentByID.get(item.id)));
  const finalAgendaItem = agenda.find((item) => item.id === 'default-13');
  const checklist = defaultStaffMeetingChecklist.map((item) => mergeDefault(item, currentByID.get(item.id)));
  const scheduledInnhopps = innhopps.map((innhopp):StaffMeetingItem => {
    const current = currentByID.get(`innhopp-${innhopp.id}`);
    return {
      id:`innhopp-${innhopp.id}`,
      title:innhopp.name,
      kind:'agenda',
      checked:current?.checked || false,
      ...(current?.notes ? { notes:current.notes } : {})
    };
  });

  return [
    ...agenda.filter((item) => item.id !== 'default-13'),
    ...customItems.filter((item) => item.kind === 'agenda'),
    ...(finalAgendaItem ? [finalAgendaItem] : []),
    ...checklist,
    ...customItems.filter((item) => item.kind === 'tomorrow'),
    ...scheduledInnhopps
  ];
};

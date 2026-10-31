import { useEffect, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { FormDialog } from './ui';
import { create, remove, restore, update, useStore, activeMembers } from '../db/store';
import { addDays, today } from '../db/util';
import { LEAVE_TYPES, leaveTypeChoices } from '../logic/availability';
import { CATEGORIES } from '../logic/review';
import { TEAMS } from '../logic/category';
import { useToast } from '../toast';

const dateProps = { type: 'date', slotProps: { inputLabel: { shrink: true } } };

/** Keeps a draft of the form; reset whenever the dialog opens for a different row. */
function useDraft(open, initial) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => { if (open) setDraft(initial); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return [draft, (patch) => setDraft((d) => ({ ...d, ...patch }))];
}

function useDeleter(table, row, onClose, label) {
  const toast = useToast();
  return () => {
    remove(table, row.id);
    onClose();
    toast(`${label} deleted`, { label: 'Undo', run: () => restore(table, row.id, table === 'members') });
  };
}

export function MemberDialog({ open, onClose, member }) {
  const [d, set] = useDraft(open, { name: member?.name ?? '', title: member?.title ?? '', startDate: member?.startDate ?? '', about: member?.about ?? '', email: member?.email ?? '', phone: member?.phone ?? '', emergencyContact: member?.emergencyContact ?? '', category: member?.category ?? '' });
  const del = useDeleter('members', member ?? {}, onClose, 'Team member');
  const save = () => {
    const fields = { name: d.name.trim(), title: d.title.trim(), startDate: d.startDate || null, about: d.about, email: d.email.trim(), phone: d.phone.trim(), emergencyContact: d.emergencyContact.trim(), category: d.category };
    if (member) update('members', member.id, fields);
    else create('members', { ...fields, archived: false });
    onClose();
  };
  return (
    <FormDialog open={open} title={member ? 'Edit team member' : 'Add team member'} onClose={onClose} onSubmit={save} valid={!!d.name.trim()} onDelete={member ? del : undefined}>
      <TextField name="name" label="Name" value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus required />
      <TextField name="title" label="Role / title" value={d.title} onChange={(e) => set({ title: e.target.value })} />
      <TextField select name="category" label="Team" value={d.category} onChange={(e) => set({ category: e.target.value })} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
        <option value="">None</option>
        {Object.entries(TEAMS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
      </TextField>
      <TextField name="startDate" label="Start date" value={d.startDate} onChange={(e) => set({ startDate: e.target.value })} {...dateProps} />
      <TextField name="email" label="Email" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} autoComplete="off" />
      <TextField name="phone" label="Phone" type="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="off" />
      <TextField name="emergencyContact" label="Emergency contact (name and phone)" value={d.emergencyContact} onChange={(e) => set({ emergencyContact: e.target.value })} autoComplete="off" />
      <TextField name="about" label="About (strengths, interests, context)" value={d.about} onChange={(e) => set({ about: e.target.value })} multiline minRows={3} />
    </FormDialog>
  );
}

function MemberSelect({ value, onChange, fixed }) {
  const state = useStore();
  if (fixed) return null;
  return (
    <TextField select name="memberId" label="Team member" value={value} onChange={(e) => onChange(e.target.value)} required slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
      <option value="" disabled>Choose…</option>
      {activeMembers(state).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </TextField>
  );
}

export function LeaveDialog({ open, onClose, leave, memberId, date }) {
  const start = leave?.startDate ?? date ?? today();
  const [d, set] = useDraft(open, { memberId: leave?.memberId ?? memberId ?? '', startDate: start, endDate: leave?.endDate ?? start, type: leave?.type ?? 'VACATION', note: leave?.note ?? '' });
  const del = useDeleter('leaves', leave ?? {}, onClose, 'Leave');
  const save = () => {
    const fields = { memberId: d.memberId, startDate: d.startDate, endDate: d.endDate, type: d.type, note: d.note.trim() };
    if (leave) update('leaves', leave.id, fields);
    else create('leaves', fields);
    onClose();
  };
  const other = d.type === 'OTHER';
  const valid = !!d.memberId && !!d.startDate && !!d.endDate && d.endDate >= d.startDate && (!other || !!d.note.trim());
  return (
    <FormDialog open={open} title={leave ? 'Edit leave' : 'Add leave'} onClose={onClose} onSubmit={save} valid={valid} onDelete={leave ? del : undefined}>
      <MemberSelect value={d.memberId} onChange={(v) => set({ memberId: v })} fixed={!!(leave || memberId)} />
      <TextField name="type" label="Type" value={d.type} onChange={(e) => set({ type: e.target.value })} select slotProps={{ select: { native: true } }}>
        {leaveTypeChoices(leave?.type).map((k) => <option key={k} value={k}>{LEAVE_TYPES[k]}</option>)}
      </TextField>
      <TextField name="startDate" label="From" value={d.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: d.endDate < e.target.value ? e.target.value : d.endDate })} {...dateProps} required />
      <TextField name="endDate" label="To (last day away)" value={d.endDate} onChange={(e) => set({ endDate: e.target.value })} {...dateProps} required
        error={d.endDate < d.startDate} helperText={d.endDate < d.startDate ? 'Must not be before the first day' : 'Weekends and holidays inside the range are not counted'} />
      <TextField name="note" label={other ? 'Reason' : 'Note'} value={d.note} onChange={(e) => set({ note: e.target.value })}
        required={other} error={other && !d.note.trim()} helperText={other ? 'Say why they are away, for example jury duty' : undefined} />
    </FormDialog>
  );
}

export function AllocationDialog({ open, onClose, allocation, memberId }) {
  const [d, set] = useDraft(open, {
    memberId: allocation?.memberId ?? memberId ?? '', project: allocation?.project ?? '', percent: allocation?.percent ?? 50,
    startDate: allocation?.startDate ?? today(), endDate: allocation?.endDate ?? '', note: allocation?.note ?? '',
  });
  const del = useDeleter('allocations', allocation ?? {}, onClose, 'Allocation');
  const save = () => {
    const fields = { memberId: d.memberId, project: d.project.trim(), percent: Number(d.percent), startDate: d.startDate, endDate: d.endDate || null, note: d.note };
    if (allocation) update('allocations', allocation.id, fields);
    else create('allocations', fields);
    onClose();
  };
  const pct = Number(d.percent);
  const valid = !!d.memberId && !!d.project.trim() && pct >= 0 && pct <= 200 && !!d.startDate && (!d.endDate || d.endDate >= d.startDate);
  return (
    <FormDialog open={open} title={allocation ? 'Edit allocation' : 'Add work allocation'} onClose={onClose} onSubmit={save} valid={valid} onDelete={allocation ? del : undefined}>
      <MemberSelect value={d.memberId} onChange={(v) => set({ memberId: v })} fixed={!!(allocation || memberId)} />
      <TextField name="project" label="Project / work" value={d.project} onChange={(e) => set({ project: e.target.value })} required autoFocus />
      <TextField name="percent" label="Share of their time (%)" type="number" value={d.percent} onChange={(e) => set({ percent: e.target.value })} slotProps={{ htmlInput: { min: 0, max: 200, step: 5 } }} required />
      <TextField name="startDate" label="From" value={d.startDate} onChange={(e) => set({ startDate: e.target.value })} {...dateProps} required />
      <TextField name="endDate" label="To (leave empty if ongoing)" value={d.endDate} onChange={(e) => set({ endDate: e.target.value })} {...dateProps}
        error={!!d.endDate && d.endDate < d.startDate} />
      <TextField name="note" label="Note" value={d.note} onChange={(e) => set({ note: e.target.value })} />
    </FormDialog>
  );
}

export function NoteDialog({ open, onClose, note, memberId }) {
  const [d, set] = useDraft(open, {
    memberId: note?.memberId ?? memberId ?? '', category: note?.category ?? 'ONE_ON_ONE', body: note?.body ?? '',
    noteDate: note?.noteDate ?? today(), followUpDate: note?.followUpDate ?? '', done: note?.done ?? false,
  });
  const del = useDeleter('notes', note ?? {}, onClose, 'Note');
  const save = () => {
    const fields = { memberId: d.memberId, category: d.category, body: d.body.trim(), noteDate: d.noteDate, followUpDate: d.followUpDate || null, done: d.followUpDate ? d.done : false };
    if (note) update('notes', note.id, fields);
    else create('notes', fields);
    onClose();
  };
  const valid = !!d.memberId && !!d.body.trim() && !!d.noteDate;
  return (
    <FormDialog open={open} title={note ? 'Edit note' : 'Add note'} onClose={onClose} onSubmit={save} valid={valid} onDelete={note ? del : undefined}>
      <MemberSelect value={d.memberId} onChange={(v) => set({ memberId: v })} fixed={!!(note || memberId)} />
      <TextField name="category" label="Kind of note" value={d.category} onChange={(e) => set({ category: e.target.value })} select slotProps={{ select: { native: true } }}>
        {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </TextField>
      <TextField name="body" label="Note" value={d.body} onChange={(e) => set({ body: e.target.value })} multiline minRows={4} required autoFocus />
      <TextField name="noteDate" label="Date" value={d.noteDate} onChange={(e) => set({ noteDate: e.target.value })} {...dateProps} required />
      <TextField name="followUpDate" label="Follow up on (optional)" value={d.followUpDate} onChange={(e) => set({ followUpDate: e.target.value })} {...dateProps} />
      <QuickFollowUps set={set} />
    </FormDialog>
  );
}

function QuickFollowUps({ set }) {
  const t = today();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {[['Tomorrow', 1], ['In 1 week', 7], ['In 2 weeks', 14], ['In 1 month', 30]].map(([label, n]) => (
        <button key={label} type="button" onClick={() => set({ followUpDate: addDays(t, n), done: false })}
          style={{ font: 'inherit', fontSize: 13, padding: '4px 12px', borderRadius: 999, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.8 }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function HolidayDialog({ open, onClose, holiday, date }) {
  const [d, set] = useDraft(open, { holidayDate: holiday?.holidayDate ?? date ?? today(), name: holiday?.name ?? '' });
  const del = useDeleter('holidays', holiday ?? {}, onClose, 'Holiday');
  const save = () => {
    const fields = { holidayDate: d.holidayDate, name: d.name.trim() };
    if (holiday) update('holidays', holiday.id, fields);
    else create('holidays', fields);
    onClose();
  };
  return (
    <FormDialog open={open} title={holiday ? 'Edit holiday' : 'Add a holiday'} onClose={onClose} onSubmit={save} valid={!!d.name.trim() && !!d.holidayDate} onDelete={holiday ? del : undefined}>
      <TextField name="name" label="Name (for example Company day)" value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus required />
      <TextField name="holidayDate" label="Date" value={d.holidayDate} onChange={(e) => set({ holidayDate: e.target.value })} {...dateProps} required
        helperText="Nobody is expected to work this day, so leave on it is not counted" />
    </FormDialog>
  );
}

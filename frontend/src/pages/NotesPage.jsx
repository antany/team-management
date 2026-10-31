import { useState } from 'react';
import { Fab, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { liveNotes, memberById, openFollowUps, useStore } from '../db/store';
import { today } from '../db/util';
import { CATEGORIES } from '../logic/review';
import { NoteCard } from '../components/Rows';
import { NoteDialog } from '../components/Dialogs';
import { Empty, PageHeader } from '../components/ui';

export default function NotesPage() {
  const state = useStore();
  const [tab, setTab] = useState('followups');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const t = today();

  const follow = openFollowUps(state);
  const overdue = follow.filter((n) => n.followUpDate < t);
  const dueToday = follow.filter((n) => n.followUpDate === t);
  const later = follow.filter((n) => n.followUpDate > t);
  const q = query.trim().toLowerCase();
  const all = liveNotes(state)
    .filter((n) => memberById(state, n.memberId))
    .filter((n) => !category || n.category === category)
    .filter((n) => !q || n.body.toLowerCase().includes(q) || memberById(state, n.memberId).name.toLowerCase().includes(q))
    .sort((a, b) => b.noteDate.localeCompare(a.noteDate) || b.updatedAt.localeCompare(a.updatedAt));

  const section = (title, list, color) => list.length > 0 && (
    <>
      <Typography variant="overline" color={color} sx={{ display: 'block', mt: 1 }}>{title} ({list.length})</Typography>
      {list.map((n) => <NoteCard key={n.id} note={n} member={memberById(state, n.memberId)} onEdit={(row) => setDialog({ row })} />)}
    </>
  );

  return (
    <>
      <PageHeader
        title="Notes" subtitle="Follow-ups and everything you have written down"
        actions={
          <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v) => v && setTab(v)}>
            <ToggleButton value="followups">Follow-ups</ToggleButton>
            <ToggleButton value="all">All notes</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      {tab === 'followups' ? (
        <>
          {follow.length === 0 && <Empty>No open follow-ups. Add a follow-up date to a note and it shows up here.</Empty>}
          {section('Overdue', overdue, 'error')}
          {section('Today', dueToday, 'warning.main')}
          {section('Upcoming', later, 'text.secondary')}
        </>
      ) : (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField name="search" placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
            <TextField name="category" select value={category} onChange={(e) => setCategory(e.target.value)} sx={{ maxWidth: 150 }} slotProps={{ select: { native: true, displayEmpty: true } }}>
              <option value="">All kinds</option>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </TextField>
          </Stack>
          {all.length === 0 && <Empty>No notes found.</Empty>}
          {all.map((n) => <NoteCard key={n.id} note={n} member={memberById(state, n.memberId)} onEdit={(row) => setDialog({ row })} />)}
        </>
      )}
      <Fab color="primary" aria-label="Add note" onClick={() => setDialog({})} sx={{ position: 'fixed', right: 20, bottom: { xs: 100, md: 28 } }}><AddIcon /></Fab>
      <NoteDialog open={!!dialog} onClose={() => setDialog(null)} note={dialog?.row} />
    </>
  );
}

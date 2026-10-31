import { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Fab, Stack, Tab, Tabs, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import AssessmentIcon from '@mui/icons-material/Assessment';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import ContactEmergencyIcon from '@mui/icons-material/ContactEmergency';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { allocationsOf, leavesOf, memberById, notesOf, update, useStore } from '../db/store';
import { dayLabel, today } from '../db/util';
import { Empty, MemberAvatar } from '../components/ui';
import { AllocationRow, LeaveRow, NoteCard } from '../components/Rows';
import { AllocationDialog, LeaveDialog, MemberDialog, NoteDialog } from '../components/Dialogs';
import { loadOn } from '../logic/allocation';

export default function MemberPage() {
  const { id } = useParams();
  const state = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState('notes');
  const [editMember, setEditMember] = useState(false);
  const [dialog, setDialog] = useState(null); // { kind, row }
  const member = memberById(state, id);
  if (!member) return <Navigate to="/people" replace />;

  const notes = notesOf(state, id);
  const leaves = leavesOf(state, id);
  const allocs = allocationsOf(state, id);
  const t = today();
  const load = loadOn(allocs, t);
  const upcoming = leaves.filter((l) => l.endDate >= t).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const close = () => setDialog(null);
  const addKind = { notes: 'note', leave: 'leave', work: 'allocation' }[tab];

  return (
    <>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <MemberAvatar member={member} size={56} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h5" noWrap>{member.name}</Typography>
              <Typography color="text.secondary">{member.title || 'No title'}{member.startDate ? ` · since ${dayLabel(member.startDate)}` : ''}</Typography>
            </Box>
          </Stack>
          {(member.email || member.phone || member.emergencyContact) && (
            <Stack spacing={0.25} sx={{ mt: 1.5 }} data-testid="contact">
              {member.email && <Typography variant="body2"><EmailIcon fontSize="inherit" sx={{ mr: 1, verticalAlign: 'middle' }} /><a href={`mailto:${member.email}`}>{member.email}</a></Typography>}
              {member.phone && <Typography variant="body2"><PhoneIcon fontSize="inherit" sx={{ mr: 1, verticalAlign: 'middle' }} /><a href={`tel:${member.phone.replace(/[^+\d]/g, '')}`}>{member.phone}</a></Typography>}
              {member.emergencyContact && <Typography variant="body2" color="text.secondary"><ContactEmergencyIcon fontSize="inherit" sx={{ mr: 1, verticalAlign: 'middle' }} />Emergency: {member.emergencyContact}</Typography>}
            </Stack>
          )}
          {member.about && <Typography variant="body2" sx={{ mt: 1.5, whiteSpace: 'pre-wrap' }}>{member.about}</Typography>}
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
            {load > 0 && <Chip size="small" color={load > 100 ? 'error' : 'default'} label={`${load}% allocated now`} />}
            {upcoming[0] && <Chip size="small" color="info" label={`Next leave ${dayLabel(upcoming[0].startDate)}`} />}
            {member.archived && <Chip size="small" label="Archived" />}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Button size="small" startIcon={<EditIcon />} onClick={() => setEditMember(true)}>Edit</Button>
            <Button size="small" startIcon={<AssessmentIcon />} onClick={() => nav(`/review/${id}`)}>Review prep</Button>
            <Button size="small" startIcon={member.archived ? <UnarchiveIcon /> : <ArchiveIcon />} onClick={() => update('members', id, { archived: !member.archived })}>
              {member.archived ? 'Restore' : 'Archive'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 2 }}>
        <Tab value="notes" label={`Notes (${notes.length})`} />
        <Tab value="leave" label={`Leave (${leaves.length})`} />
        <Tab value="work" label={`Work (${allocs.length})`} />
      </Tabs>

      {tab === 'notes' && (notes.length === 0 ? <Empty>No notes yet.</Empty> : notes.map((n) => <NoteCard key={n.id} note={n} onEdit={(row) => setDialog({ kind: 'note', row })} />))}
      {tab === 'leave' && (leaves.length === 0 ? <Empty>No leave recorded.</Empty> : leaves.map((l) => <LeaveRow key={l.id} leave={l} onEdit={(row) => setDialog({ kind: 'leave', row })} />))}
      {tab === 'work' && (allocs.length === 0 ? <Empty>No work allocated yet.</Empty> : allocs.map((a) => <AllocationRow key={a.id} allocation={a} onEdit={(row) => setDialog({ kind: 'allocation', row })} />))}

      <Fab color="primary" aria-label={`Add ${addKind}`} onClick={() => setDialog({ kind: addKind })} sx={{ position: 'fixed', right: 20, bottom: { xs: 100, md: 28 } }}><AddIcon /></Fab>
      <MemberDialog open={editMember} onClose={() => setEditMember(false)} member={member} />
      <NoteDialog open={dialog?.kind === 'note'} onClose={close} note={dialog?.row} memberId={id} />
      <LeaveDialog open={dialog?.kind === 'leave'} onClose={close} leave={dialog?.row} memberId={id} />
      <AllocationDialog open={dialog?.kind === 'allocation'} onClose={close} allocation={dialog?.row} memberId={id} />
    </>
  );
}

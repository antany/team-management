import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, Stack, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { useNavigate } from 'react-router-dom';
import { activeMembers, addSampleData, memberById, openFollowUps, update, useStore } from '../db/store';
import { useSettings } from '../db/settings';
import { addDays, dayLabel, today } from '../db/util';
import { upcomingConflicts } from '../logic/availability';
import { AvailabilityPanel } from '../components/Availability';
import { MemberAvatar, PageHeader } from '../components/ui';
import { followUpChip } from '../components/Rows';
import PinDialog from '../components/PinDialog';
import { useLock } from '../lock';
import { cryptoAvailable } from '../crypto';
import { rangeLabel } from '../db/util';

export default function HomePage() {
  const state = useStore();
  const nav = useNavigate();
  const { holidays, maxOut } = useSettings();
  const { hasPin } = useLock();
  const [pinOpen, setPinOpen] = useState(false);
  const members = activeMembers(state);
  const t = today();
  const due = openFollowUps(state, addDays(t, 7));
  const { runs, heavy } = upcomingConflicts(state, holidays, maxOut, 60);

  return (
    <>
      <PageHeader title="Home" subtitle={dayLabel(t)} />
      {!hasPin && (
        <Alert severity="warning" icon={<LockIcon />} sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={() => setPinOpen(true)} disabled={!cryptoAvailable()}>Set PIN</Button>}>
          {cryptoAvailable()
            ? 'Employee notes are unprotected on this device. Set an app-lock PIN: the app then locks itself when idle.'
            : 'App lock needs https:// (or localhost) to encrypt notes on this device.'}
        </Alert>
      )}
      <PinDialog open={pinOpen} onClose={() => setPinOpen(false)} />

      {members.length === 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6">Welcome</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Add the people you manage, then track their leave, work and follow-ups.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={() => nav('/people')}>Add team members</Button>
              <Button onClick={addSampleData}>Add sample data</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <AvailabilityPanel date={t} />
          <Button size="small" sx={{ mt: 1 }} onClick={() => nav('/calendar')}>Open calendar</Button>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Follow-ups due this week</Typography>
          {due.length === 0 && <Typography color="text.secondary" variant="body2">Nothing to follow up on.</Typography>}
          <Stack spacing={1}>
            {due.slice(0, 6).map((n) => {
              const m = memberById(state, n.memberId);
              const chip = followUpChip(n);
              return (
                <Stack key={n.id} direction="row" spacing={1} alignItems="center">
                  <Checkbox size="small" sx={{ p: 0.5 }} slotProps={{ input: { 'aria-label': 'Mark follow-up done' } }} onChange={() => update('notes', n.id, { done: true })} />
                  <MemberAvatar member={m} size={24} />
                  <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => nav(`/people/${m.id}`)}>
                    <Typography variant="body2" noWrap><b>{m.name}</b>: {n.body}</Typography>
                  </Box>
                  <Chip size="small" color={chip.color} label={dayLabel(n.followUpDate)} />
                </Stack>
              );
            })}
          </Stack>
          {due.length > 0 && <Button size="small" sx={{ mt: 1 }} onClick={() => nav('/notes')}>All follow-ups</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Heads-up (next 60 days)</Typography>
          {runs.length === 0 && heavy.length === 0 && <Typography color="text.secondary" variant="body2">No overlapping leave.</Typography>}
          <Stack spacing={1}>
            {runs.slice(0, 5).map((r) => (
              <Alert key={r.key + r.from} severity={r.level === 'high' ? 'error' : 'warning'}>
                {rangeLabel(r.from, r.to)}: {r.people.map((p) => p.name).join(', ')} out together
              </Alert>
            ))}
            {heavy.slice(0, 3).map((h) => (
              <Alert key={h.leave.id} severity="info">
                {h.member.name} is out {rangeLabel(h.leave.startDate, h.leave.endDate)} while allocated up to {h.peak}% ({h.projects.join(', ')})
              </Alert>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}

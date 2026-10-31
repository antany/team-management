import { useState } from 'react';
import { Box, Card, CardActionArea, Chip, Fab, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import { activeMembers, liveAllocations, liveMembers, openFollowUps, useStore } from '../db/store';
import { useSettings } from '../db/settings';
import { today } from '../db/util';
import { availabilityOn } from '../logic/availability';
import { TEAMS } from '../logic/category';
import { loadOn } from '../logic/allocation';
import { Empty, MemberAvatar, PageHeader } from '../components/ui';
import { MemberDialog } from '../components/Dialogs';

export default function PeoplePage() {
  const state = useStore();
  const nav = useNavigate();
  const { holidays } = useSettings();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const members = showArchived ? liveMembers(state) : activeMembers(state);
  const t = today();
  const outToday = new Map(availabilityOn(state, t, holidays).out.map((o) => [o.member.id, o.leave]));
  const follow = openFollowUps(state);
  const allocs = liveAllocations(state);

  return (
    <>
      <PageHeader
        title="Team" subtitle={`${activeMembers(state).length} active`}
        actions={<FormControlLabel control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />} label="Show archived" />}
      />
      {members.length === 0 && <Empty>No team members yet. Tap + to add the first one.</Empty>}
      {members.map((m) => {
        const load = loadOn(allocs.filter((a) => a.memberId === m.id), t);
        const open = follow.filter((n) => n.memberId === m.id).length;
        return (
          <Card key={m.id} sx={{ mb: 1.5, opacity: m.archived ? 0.6 : 1 }}>
            <CardActionArea onClick={() => nav(`/people/${m.id}`)} sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <MemberAvatar member={m} size={44} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" noWrap>{m.name}</Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>{TEAMS[m.category] ? `${TEAMS[m.category].label} · ` : ''}{m.title || 'No title'}{m.archived ? ' · archived' : ''}</Typography>
                </Box>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 0.5 }}>
                  {outToday.has(m.id) && <Chip size="small" color="info" label="Out today" />}
                  {load > 0 && <Chip size="small" color={load > 100 ? 'error' : 'default'} variant="outlined" label={`${load}% allocated`} />}
                  {open > 0 && <Chip size="small" color="warning" variant="outlined" label={`${open} follow-up${open === 1 ? '' : 's'}`} />}
                </Stack>
              </Stack>
            </CardActionArea>
          </Card>
        );
      })}
      <Fab color="primary" aria-label="Add team member" onClick={() => setAdding(true)} sx={{ position: 'fixed', right: 20, bottom: { xs: 100, md: 28 } }}><AddIcon /></Fab>
      <MemberDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

import { useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, Fab, IconButton, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNavigate } from 'react-router-dom';
import { activeMembers, liveAllocations, memberById, useStore } from '../db/store';
import { addDays, mondayOf, shortDate, today } from '../db/util';
import { loadColor, teamLoad } from '../logic/allocation';
import { AllocationDialog } from '../components/Dialogs';
import { AllocationRow } from '../components/Rows';
import { Empty, MemberAvatar, PageHeader } from '../components/ui';

const WEEKS = 6;

export default function WorkPage() {
  const state = useStore();
  const theme = useTheme();
  const nav = useNavigate();
  const [from, setFrom] = useState(mondayOf(today()));
  const [dialog, setDialog] = useState(null); // {row?}
  const { mondays, rows } = teamLoad(state, from, WEEKS);
  const t = today();
  const current = liveAllocations(state).filter((a) => a.startDate <= t && (!a.endDate || a.endDate >= t) && memberById(state, a.memberId) && !memberById(state, a.memberId).archived);
  const byProject = new Map();
  current.forEach((a) => byProject.set(a.project, [...(byProject.get(a.project) ?? []), a]));
  const over = rows.filter((r) => r.loads.some((l) => l > 100));

  const color = (pct) => {
    const key = loadColor(pct);
    return key === 'default' ? alpha(theme.palette.text.primary, 0.06) : alpha(theme.palette[key].main, key === 'error' ? 0.35 : 0.22);
  };

  return (
    <>
      <PageHeader title="Work" subtitle="Who is allocated to what" />
      {over.length > 0 && <Alert severity="error" sx={{ mb: 2 }}>{over.map((r) => r.member.name).join(', ')} {over.length === 1 ? 'is' : 'are'} allocated over 100% in this window.</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ flex: 1 }}>Weekly load (highest day of each week)</Typography>
            <IconButton aria-label="Earlier" size="small" onClick={() => setFrom(addDays(from, -7 * WEEKS))}><ChevronLeftIcon /></IconButton>
            <IconButton aria-label="Later" size="small" onClick={() => setFrom(addDays(from, 7 * WEEKS))}><ChevronRightIcon /></IconButton>
          </Stack>
          {rows.length === 0 ? <Empty>No active team members.</Empty> : (
            <Box sx={{ overflowX: 'auto' }} data-testid="load-grid">
              <Box sx={{ display: 'grid', gridTemplateColumns: `minmax(96px, 1.3fr) repeat(${WEEKS}, minmax(52px, 1fr))`, gap: 0.5, minWidth: 440 }}>
                <Box />
                {mondays.map((m) => <Typography key={m} variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>{shortDate(m)}</Typography>)}
                {rows.map((r) => (
                  <Box key={r.member.id} sx={{ display: 'contents' }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ cursor: 'pointer', minWidth: 0 }} onClick={() => nav(`/people/${r.member.id}`)}>
                      <MemberAvatar member={r.member} size={22} />
                      <Typography variant="body2" noWrap>{r.member.name}</Typography>
                    </Stack>
                    {r.loads.map((l, i) => (
                      <Box key={mondays[i]} data-load={l} data-cell={`${r.member.id}:${mondays[i]}`}
                        sx={{ borderRadius: '8px', minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: color(l) }}>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>{l ? `${l}%` : ''}</Typography>
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      <Typography variant="subtitle1" sx={{ mb: 1 }}>Current projects</Typography>
      {byProject.size === 0 && <Empty>No active allocations. Tap + to add one.</Empty>}
      {[...byProject.entries()].map(([project, list]) => (
        <Card key={project} sx={{ mb: 1.5 }}>
          <CardContent sx={{ pb: '12px !important' }}>
            <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle1" sx={{ flex: 1 }}>{project}</Typography>
              <Chip size="small" label={`${list.reduce((s, a) => s + a.percent, 0)}% total`} />
            </Stack>
            {list.map((a) => <AllocationRow key={a.id} allocation={a} member={memberById(state, a.memberId)} onEdit={(row) => setDialog({ row })} />)}
          </CardContent>
        </Card>
      ))}
      <Fab color="primary" aria-label="Add allocation" onClick={() => setDialog({})} sx={{ position: 'fixed', right: 20, bottom: { xs: 100, md: 28 } }}><AddIcon /></Fab>
      <AllocationDialog open={!!dialog} onClose={() => setDialog(null)} allocation={dialog?.row} />
    </>
  );
}

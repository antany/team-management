import { useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Fab, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { activeMembers, useStore } from '../db/store';
import { useSettings } from '../db/settings';
import { addDays, addMonths, eachDay, fromDateStr, isWeekend, mondayOf, monthLabel, monthStart, rangeLabel, shortDate, today } from '../db/util';
import { leaveLabel, outByDay, upcomingConflicts } from '../logic/availability';
import { TEAMS, categoryCoverage } from '../logic/category';
import { AvailabilityPanel } from '../components/Availability';
import { HolidayDialog, LeaveDialog } from '../components/Dialogs';
import { MemberAvatar, PageHeader } from '../components/ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const state = useStore();
  const theme = useTheme();
  const { holidays, maxOut } = useSettings();
  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(today());
  const [selected, setSelected] = useState(today());
  const [adding, setAdding] = useState(false);
  const [holidayDialog, setHolidayDialog] = useState(null); // { row?, date? }

  const monthFirst = monthStart(anchor);
  const gridStart = mondayOf(monthFirst);
  const gridEnd = addDays(mondayOf(addDays(addMonths(monthFirst, 1), -1)), 6);
  const weekStart = mondayOf(anchor);
  const from = view === 'month' ? gridStart : weekStart;
  const to = view === 'month' ? gridEnd : addDays(weekStart, 6);
  const { out, holidays: holidayNames } = useMemo(() => outByDay(state, from, to, holidays), [state, from, to, holidays]);
  const members = activeMembers(state);
  const conflicts = useMemo(() => upcomingConflicts(state, holidays, maxOut), [state, holidays, maxOut]);

  const step = (n) => setAnchor(view === 'month' ? addMonths(anchor, n) : addDays(anchor, 7 * n));
  const title = view === 'month' ? monthLabel(anchor) : `Week of ${shortDate(weekStart)}`;

  return (
    <>
      <PageHeader
        title="Calendar" subtitle="Leave, holidays and who is available"
        actions={
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => { if (v) { setView(v); if (v === 'week') setAnchor(selected); } }}>
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <IconButton aria-label="Previous" onClick={() => step(-1)}><ChevronLeftIcon /></IconButton>
        <Typography variant="h6" sx={{ flex: 1, textAlign: 'center' }}>{title}</Typography>
        <IconButton aria-label="Next" onClick={() => step(1)}><ChevronRightIcon /></IconButton>
        <Button size="small" onClick={() => { setAnchor(today()); setSelected(today()); }}>Today</Button>
        <Button size="small" onClick={() => setHolidayDialog({ date: selected })}>Add holiday</Button>
      </Stack>

      {view === 'month' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mb: 2 }} data-testid="month-grid">
          {WEEKDAYS.map((d) => <Typography key={d} variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>{d}</Typography>)}
          {eachDay(gridStart, gridEnd).map((day) => {
            const people = out.get(day) ?? [];
            const inMonth = day.slice(0, 7) === monthFirst.slice(0, 7);
            const holiday = holidayNames.get(day);
            const teams = people.length ? categoryCoverage(members, new Set(people.map((o) => o.member.id))).filter((t) => t.out > 0) : [];
            return (
              <Box
                key={day} component="button" type="button" onClick={() => setSelected(day)}
                data-day={day} data-out={people.length}
                aria-label={`${day}${people.length ? `, ${people.length} out` : ''}${holiday ? `, ${holiday}` : ''}`}
                sx={{
                  font: 'inherit', color: 'text.primary', cursor: 'pointer', textAlign: 'left', p: 0.5, minHeight: { xs: 54, md: 72 },
                  borderRadius: '10px', border: 2, borderColor: selected === day ? 'primary.main' : 'divider',
                  bgcolor: holiday || isWeekend(day) ? alpha(theme.palette.text.primary, 0.05) : 'transparent',
                  opacity: inMonth ? 1 : 0.45, display: 'flex', flexDirection: 'column', gap: 0.25, overflow: 'hidden',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: day === today() ? 800 : 500, color: day === today() ? 'primary.main' : undefined }}>{fromDateStr(day).getDate()}</Typography>
                {teams.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                    {teams.map((t) => (
                      <Box key={t.key} data-team={t.key} data-status={t.status} title={`${TEAMS[t.key].label}: ${t.out} of ${t.total} out`}
                        sx={{ px: '4px', borderRadius: '6px', bgcolor: t.color, color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1.4 }}>
                        <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>{TEAMS[t.key].label} </Box>{t.out}/{t.total}
                      </Box>
                    ))}
                  </Box>
                )}
                {holiday && <Typography variant="caption" sx={{ lineHeight: 1.1, fontSize: 10, display: { xs: 'none', md: 'block' } }}>{holiday}</Typography>}
                {holiday && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.secondary', display: { md: 'none' } }} />}
              </Box>
            );
          })}
        </Box>
      ) : (
        <WeekGrid members={members} week={weekStart} out={out} holidayNames={holidayNames} selected={selected} onSelect={setSelected} theme={theme} />
      )}

      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }} data-testid="team-legend">
        {Object.entries(TEAMS).map(([k, t]) => <Chip key={k} size="small" label={t.label} sx={{ bgcolor: t.color, color: '#fff', fontWeight: 700 }} />)}
        <Chip size="small" label="Over half out" sx={{ bgcolor: '#ed6c02', color: '#fff', fontWeight: 700 }} />
        <Chip size="small" label="All out" sx={{ bgcolor: '#d32f2f', color: '#fff', fontWeight: 700 }} />
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent><AvailabilityPanel date={selected} onHoliday={(date, row) => setHolidayDialog({ date, row })} /></CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Heads-up (next 90 days)</Typography>
          {conflicts.runs.length === 0 && conflicts.heavy.length === 0 && <Typography variant="body2" color="text.secondary">No overlapping leave.</Typography>}
          <Stack spacing={1}>
            {conflicts.runs.map((r) => (
              <Alert key={r.key + r.from} severity={r.level === 'high' ? 'error' : 'warning'} onClick={() => { setSelected(r.from); setAnchor(r.from); }} sx={{ cursor: 'pointer' }}>
                {rangeLabel(r.from, r.to)}: {r.people.map((p) => p.name).join(', ')} out together
              </Alert>
            ))}
            {conflicts.heavy.map((h) => (
              <Alert key={h.leave.id} severity="info">
                {h.member.name} is out {rangeLabel(h.leave.startDate, h.leave.endDate)} while allocated up to {h.peak}% ({h.projects.join(', ')})
              </Alert>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Fab color="primary" aria-label="Add leave" onClick={() => setAdding(true)} sx={{ position: 'fixed', right: 20, bottom: { xs: 100, md: 28 } }}><AddIcon /></Fab>
      <HolidayDialog open={!!holidayDialog} onClose={() => setHolidayDialog(null)} holiday={holidayDialog?.row} date={holidayDialog?.date} />
      <LeaveDialog open={adding} onClose={() => setAdding(false)} date={selected} />
    </>
  );
}

/** Members down, Monday to Friday across: who is out when, plus a coverage row. */
function WeekGrid({ members, week, out, holidayNames, selected, onSelect, theme }) {
  const days = eachDay(week, addDays(week, 4));
  const SHORT = { VACATION: 'Vacation', SICK: 'Sick', PERSONAL: 'Personal', HOLIDAY: 'Day off', OTHER: 'Other' };
  return (
    <Box sx={{ overflowX: 'auto', mb: 2 }} data-testid="week-grid">
      <Box sx={{ display: 'grid', gridTemplateColumns: `minmax(96px, 1.2fr) repeat(5, minmax(56px, 1fr))`, gap: 0.5, minWidth: 420 }}>
        <Box />
        {days.map((d) => (
          <Box key={d} component="button" type="button" onClick={() => onSelect(d)} data-day={d}
            sx={{ font: 'inherit', cursor: 'pointer', border: 2, borderColor: selected === d ? 'primary.main' : 'divider', borderRadius: '10px', bgcolor: 'transparent', color: 'text.primary', p: 0.5, textAlign: 'center' }}>
            <Typography variant="caption" display="block" color="text.secondary">{WEEKDAYS[days.indexOf(d)]}</Typography>
            <Typography variant="body2" sx={{ fontWeight: d === today() ? 800 : 500 }}>{fromDateStr(d).getDate()}</Typography>
            {holidayNames.get(d) && <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1 }} display="block" noWrap>{holidayNames.get(d)}</Typography>}
          </Box>
        ))}
        {members.map((m) => (
          <Box key={m.id} sx={{ display: 'contents' }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              <Box sx={{ width: 4, alignSelf: 'stretch', borderRadius: 2, bgcolor: TEAMS[m.category]?.color ?? 'transparent' }} />
              <MemberAvatar member={m} size={22} />
              <Typography variant="body2" noWrap>{m.name}</Typography>
            </Stack>
            {days.map((d) => {
              const entry = (out.get(d) ?? []).find((o) => o.member.id === m.id);
              const off = holidayNames.has(d);
              return (
                <Box key={d} data-cell={`${m.id}:${d}`} data-out={entry ? 'yes' : 'no'} title={entry ? leaveLabel(entry.leave) : undefined}
                  sx={{ borderRadius: '8px', minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: entry ? alpha(theme.palette.info.main, 0.28) : off ? alpha(theme.palette.text.primary, 0.06) : alpha(theme.palette.success.main, 0.08) }}>
                  {entry && <Typography variant="caption" sx={{ fontWeight: 700 }}>{SHORT[entry.leave.type]}</Typography>}
                </Box>
              );
            })}
          </Box>
        ))}
        {Object.keys(TEAMS).filter((k) => members.some((m) => m.category === k)).map((k) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Typography variant="caption" sx={{ alignSelf: 'center', fontWeight: 700, color: TEAMS[k].color }}>{TEAMS[k].label} out</Typography>
            {days.map((d) => {
              const t = categoryCoverage(members, new Set((out.get(d) ?? []).map((o) => o.member.id))).find((c) => c.key === k);
              return (
                <Box key={d} data-team-cell={`${k}:${d}`} data-status={t.status} sx={{ textAlign: 'center', borderRadius: '8px', p: 0.25, bgcolor: alpha(t.color, t.status === 'ok' ? 0.12 : 0.85), color: t.status === 'ok' ? 'text.primary' : '#fff' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>{holidayNames.has(d) ? '–' : `${t.out}/${t.total}`}</Typography>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      {members.length === 0 && <Chip label="Add team members to see availability" sx={{ mt: 1 }} />}
    </Box>
  );
}

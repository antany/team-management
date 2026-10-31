import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { MemberAvatar } from './ui';
import { availabilityOn, leaveLabel, levelOf } from '../logic/availability';
import { useSettings } from '../db/settings';
import { liveHolidays, useStore } from '../db/store';
import { dayLabel } from '../db/util';

export const LEVEL_COLOR = { none: 'transparent', one: 'info', multi: 'warning', high: 'error' };

/** Who is available on a day and who is out (and why, and until when). */
/** `onHoliday(date, existingCustomHoliday?)` adds the holiday buttons (calendar page only). */
export function AvailabilityPanel({ date, onHoliday }) {
  const state = useStore();
  const { holidays, maxOut } = useSettings();
  const a = availabilityOn(state, date, holidays);
  const level = levelOf(a.out.length, maxOut);
  const custom = liveHolidays(state).find((h) => h.holidayDate === date);

  return (
    <Box data-testid="availability">
      <Typography variant="subtitle1" sx={{ mb: 0.5 }}>{dayLabel(date)}</Typography>
      {a.holiday && (
        <Alert severity="info" sx={{ mb: 1 }} action={custom && onHoliday && <Button color="inherit" size="small" onClick={() => onHoliday(date, custom)}>Edit</Button>}>
          {a.holiday}: not a working day{custom ? ' (your holiday)' : ''}
        </Alert>
      )}
      {!a.holiday && a.weekend && <Alert severity="info" sx={{ mb: 1 }}>Weekend</Alert>}
      {!a.holiday && !a.weekend && onHoliday && <Button size="small" sx={{ mb: 1 }} onClick={() => onHoliday(date)}>Mark this day as a holiday</Button>}
      {!a.holiday && !a.weekend && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {a.total === 0 ? 'No active team members yet' : `${a.available.length} of ${a.total} available`}
          </Typography>
          {level === 'high' && <Alert severity="error" sx={{ mb: 1 }}>{a.out.length} people are out: coverage is thin.</Alert>}
          {level === 'multi' && <Alert severity="warning" sx={{ mb: 1 }}>{a.out.length} people are out the same day.</Alert>}
          {a.out.length > 0 && (
            <>
              <Typography variant="overline" color="text.secondary">Out</Typography>
              <Stack spacing={0.75} sx={{ mb: 1.5 }}>
                {a.out.map(({ member, leave }) => (
                  <Stack key={leave.id} direction="row" spacing={1} alignItems="center">
                    <MemberAvatar member={member} size={26} />
                    <Typography variant="body2" sx={{ flex: 1 }}>{member.name}</Typography>
                    <Chip size="small" label={`${leaveLabel(leave)} until ${dayLabel(leave.endDate)}`} />
                  </Stack>
                ))}
              </Stack>
            </>
          )}
          {a.available.length > 0 && (
            <>
              <Typography variant="overline" color="text.secondary">Available</Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {a.available.map((m) => <Chip key={m.id} size="small" variant="outlined" avatar={<MemberAvatar member={m} size={20} />} label={m.name} />)}
              </Stack>
            </>
          )}
        </>
      )}
    </Box>
  );
}

import { Box, Card, CardActionArea, Checkbox, Chip, Stack, Typography } from '@mui/material';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import { MemberAvatar } from './ui';
import { dayLabel, daysBetween, rangeLabel, today } from '../db/util';
import { update } from '../db/store';
import { LEAVE_TYPES } from '../logic/availability';
import { CATEGORIES } from '../logic/review';
import { loadColor } from '../logic/allocation';

const CATEGORY_COLOR = { KUDOS: 'success', CONCERN: 'error', GOAL: 'primary', FEEDBACK: 'warning', ONE_ON_ONE: 'secondary', OTHER: 'default' };

export function followUpChip(note) {
  if (!note.followUpDate) return null;
  if (note.done) return { label: `Followed up (${dayLabel(note.followUpDate)})`, color: 'default' };
  const diff = daysBetween(today(), note.followUpDate);
  return { label: `Follow up ${dayLabel(note.followUpDate)}`, color: diff < 0 ? 'error' : diff === 0 ? 'warning' : 'default' };
}

export function NoteCard({ note, member, onEdit }) {
  const chip = followUpChip(note);
  return (
    <Card sx={{ mb: 1.5, opacity: note.done ? 0.75 : 1 }}>
      <Stack direction="row" alignItems="flex-start">
        {note.followUpDate && (
          <Checkbox
            checked={note.done} sx={{ mt: 0.5 }} slotProps={{ input: { 'aria-label': `Mark follow-up done: ${note.body.slice(0, 30)}` } }}
            onChange={(e) => update('notes', note.id, { done: e.target.checked })}
          />
        )}
        <CardActionArea onClick={() => onEdit(note)} sx={{ p: 1.5, pl: note.followUpDate ? 0 : 1.5, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
            {member && <MemberAvatar member={member} size={22} />}
            {member && <Typography variant="subtitle2">{member.name}</Typography>}
            <Chip size="small" color={CATEGORY_COLOR[note.category]} variant="outlined" label={CATEGORIES[note.category]} />
            <Typography variant="caption" color="text.secondary">{dayLabel(note.noteDate)}</Typography>
          </Stack>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', textDecoration: note.done ? 'line-through' : 'none' }}>{note.body}</Typography>
          {chip && <Chip size="small" icon={<EventRepeatIcon />} color={chip.color} label={chip.label} sx={{ mt: 1 }} />}
        </CardActionArea>
      </Stack>
    </Card>
  );
}

export function LeaveRow({ leave, member, onEdit }) {
  const days = daysBetween(leave.startDate, leave.endDate) + 1;
  return (
    <Card sx={{ mb: 1 }}>
      <CardActionArea onClick={() => onEdit(leave)} sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {member && <MemberAvatar member={member} size={30} />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2">{member ? `${member.name}: ` : ''}{rangeLabel(leave.startDate, leave.endDate)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {LEAVE_TYPES[leave.type]} · {days} calendar day{days === 1 ? '' : 's'}{leave.note ? ` · ${leave.type === 'OTHER' ? 'Reason: ' : ''}${leave.note}` : ''}
            </Typography>
          </Box>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

export function AllocationRow({ allocation, member, onEdit }) {
  const ended = allocation.endDate && allocation.endDate < today();
  return (
    <Card sx={{ mb: 1, opacity: ended ? 0.65 : 1 }}>
      <CardActionArea onClick={() => onEdit(allocation)} sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {member && <MemberAvatar member={member} size={30} />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>{member ? `${member.name}: ` : ''}{allocation.project}</Typography>
            <Typography variant="caption" color="text.secondary">
              {allocation.endDate ? rangeLabel(allocation.startDate, allocation.endDate) : `From ${dayLabel(allocation.startDate)}, ongoing`}
              {allocation.note ? ` · ${allocation.note}` : ''}
            </Typography>
          </Box>
          <Chip size="small" color={loadColor(allocation.percent)} label={`${allocation.percent}%`} />
        </Stack>
      </CardActionArea>
    </Card>
  );
}

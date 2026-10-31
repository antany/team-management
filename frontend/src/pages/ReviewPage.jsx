import { useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, TextField, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import { useNavigate, useParams } from 'react-router-dom';
import { activeMembers, useStore } from '../db/store';
import { useSettings } from '../db/settings';
import { addMonths, dayLabel, rangeLabel, today } from '../db/util';
import { buildReview, reviewMarkdown, segmentsText, CATEGORIES } from '../logic/review';
import { LEAVE_TYPES, leaveLabel } from '../logic/availability';
import { PageHeader } from '../components/ui';
import { useToast } from '../toast';

const PRESETS = {
  six: { label: 'Last 6 months', range: () => [addMonths(today(), -6), today()] },
  twelve: { label: 'Last 12 months', range: () => [addMonths(today(), -12), today()] },
  year: { label: 'This calendar year', range: () => [`${today().slice(0, 4)}-01-01`, today()] },
  lastYear: { label: 'Last calendar year', range: () => [`${Number(today().slice(0, 4)) - 1}-01-01`, `${Number(today().slice(0, 4)) - 1}-12-31`] },
};

export default function ReviewPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const state = useStore();
  const { holidays } = useSettings();
  const members = activeMembers(state);
  const [[from, to], setRange] = useState(PRESETS.twelve.range());
  const memberId = id ?? '';
  const review = useMemo(() => (memberId ? buildReview(state, memberId, from, to, holidays) : null), [state, memberId, from, to, holidays]);
  const markdown = review ? reviewMarkdown(review) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast('Copied as Markdown');
    } catch {
      toast('Could not copy: use Download instead');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-prep-${review.member.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${to}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="Review prep" subtitle="Everything you recorded for the period, grouped. You write the review." />
      <Card sx={{ mb: 2 }} className="no-print">
        <CardContent>
          <Stack spacing={2}>
            <TextField name="member" label="Team member" select value={memberId} onChange={(e) => nav(e.target.value ? `/review/${e.target.value}` : '/review')} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
              <option value="">Choose…</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </TextField>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {Object.entries(PRESETS).map(([k, p]) => <Chip key={k} label={p.label} onClick={() => setRange(p.range())} variant="outlined" />)}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField name="from" label="From" type="date" value={from} onChange={(e) => setRange([e.target.value, to])} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField name="to" label="To" type="date" value={to} onChange={(e) => setRange([from, e.target.value])} slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            {from > to && <Alert severity="error">The start date is after the end date.</Alert>}
          </Stack>
        </CardContent>
      </Card>

      {!review && <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Choose a team member to see their summary.</Typography>}
      {review && from <= to && (
        <Box data-testid="review">
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} className="no-print">
            <Button startIcon={<ContentCopyIcon />} onClick={copy}>Copy</Button>
            <Button startIcon={<DownloadIcon />} onClick={download}>Download .md</Button>
            <Button startIcon={<PrintIcon />} onClick={() => window.print()}>Print</Button>
          </Stack>
          <Typography variant="h5">{review.member.name}</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>{review.member.title ? `${review.member.title} · ` : ''}{rangeLabel(from, to)}</Typography>

          <Section title="Leave">
            {review.leaves.length === 0 ? <Typography color="text.secondary">No leave recorded.</Typography> : (
              <>
                <Typography sx={{ mb: 1 }}>
                  <b>{review.leaveTotal}</b> working day{review.leaveTotal === 1 ? '' : 's'} away
                  {' ('}{Object.entries(review.leaveDays).filter(([, n]) => n).map(([k, n]) => `${LEAVE_TYPES[k]} ${n}`).join(', ')}{')'}
                </Typography>
                {review.leaves.map((l) => <Typography key={l.id} variant="body2">{rangeLabel(l.startDate, l.endDate)} · {leaveLabel(l)}{l.note && l.type !== 'OTHER' ? ` · ${l.note}` : ''}</Typography>)}
              </>
            )}
          </Section>

          <Section title="Work allocation">
            {review.projects.length === 0 ? <Typography color="text.secondary">No allocations recorded.</Typography> : review.projects.map((p) => (
              <Typography key={p.project} variant="body2" sx={{ mb: 0.5 }}>
                <b>{p.project}</b>: {segmentsText(p)}{p.notes.length ? `. ${p.notes.join(' ')}` : ''}
              </Typography>
            ))}
          </Section>

          <Section title={`Notes (${review.notes.length})`}>
            {review.byCategory.length === 0 && <Typography color="text.secondary">No notes recorded for this period.</Typography>}
            {review.byCategory.map((g) => (
              <Box key={g.category} sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{CATEGORIES[g.category]} ({g.notes.length})</Typography>
                {g.notes.map((n) => (
                  <Typography key={n.id} variant="body2" sx={{ mb: 0.75, whiteSpace: 'pre-wrap' }}>
                    <Box component="span" sx={{ color: 'text.secondary' }}>{dayLabel(n.noteDate)}: </Box>{n.body}
                    {n.followUpDate && <Box component="span" sx={{ color: 'text.secondary' }}> (follow-up {dayLabel(n.followUpDate)}{n.done ? ', done' : ''})</Box>}
                  </Typography>
                ))}
              </Box>
            ))}
          </Section>

          <Section title="Follow-ups" last>
            <Typography variant="body2">
              {review.followUps.total} set, {review.followUps.done} done, {review.followUps.open} open
              {review.followUps.overdue ? `, ${review.followUps.overdue} overdue` : ''}.
            </Typography>
          </Section>
        </Box>
      )}
    </>
  );
}

function Section({ title, children, last }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      {children}
      {!last && <Divider sx={{ mt: 2 }} />}
    </Box>
  );
}


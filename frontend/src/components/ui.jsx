import { Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { chartColors } from '../theme';

/** Stable colour per member, from the validated categorical palette. */
export function colorFor(id, mode = 'light') {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const palette = chartColors[mode].slice(0, 6);
  return palette[h % palette.length];
}

export function MemberAvatar({ member, size = 36 }) {
  const color = colorFor(member.id);
  return (
    <Avatar sx={{ width: size, height: size, bgcolor: alpha(color, 0.18), color, fontWeight: 700, fontSize: size * 0.42, border: `1px solid ${alpha(color, 0.5)}` }}>
      {member.name.trim().charAt(0).toUpperCase()}
    </Avatar>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
      <Box sx={{ flex: 1, minWidth: 160 }}>
        <Typography variant="h5">{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {actions}
    </Stack>
  );
}

export function Empty({ children }) {
  return <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{children}</Typography>;
}

/** Modal form. Submits on Enter; `onDelete` adds a Delete button. */
export function FormDialog({ open, title, onClose, onSubmit, onDelete, valid = true, submitLabel = 'Save', children }) {
  const submit = (e) => {
    e.preventDefault();
    if (valid) onSubmit();
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>{children}</Stack>
        </DialogContent>
        <DialogActions>
          {onDelete && <Button color="error" onClick={onDelete} sx={{ mr: 'auto' }}>Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!valid}>{submitLabel}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

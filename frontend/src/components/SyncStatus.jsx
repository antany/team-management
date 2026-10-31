import { Chip, CircularProgress } from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { syncNow, useSyncStatus } from '../sync/engine';

export function describeSync(s) {
  switch (s.state) {
    case 'syncing': return 'Syncing…';
    case 'offline': return 'Offline: changes are saved on this device';
    case 'error': return `Sync problem: ${s.error ?? 'unknown error'}`;
    default: return s.lastSyncAt ? `Synced at ${new Date(s.lastSyncAt).toLocaleTimeString()}` : 'Up to date';
  }
}

export function SyncChip() {
  const s = useSyncStatus();
  const icon = s.state === 'syncing' ? <CircularProgress size={14} color="inherit" />
    : s.state === 'offline' ? <CloudOffIcon />
    : s.state === 'error' ? <ErrorOutlineIcon />
    : <CloudDoneIcon />;
  return (
    <Chip
      size="small" icon={icon} label={{ syncing: 'Syncing', offline: 'Offline', error: 'Problem' }[s.state] ?? 'Synced'}
      title={describeSync(s)} onClick={syncNow} aria-label={describeSync(s)}
      sx={{ mr: 1, color: 'inherit', bgcolor: 'rgba(255,255,255,0.16)', '& .MuiChip-icon': { color: 'inherit' } }}
    />
  );
}

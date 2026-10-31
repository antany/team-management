import { useState } from 'react';
import {
  Alert, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControlLabel, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { api, ApiError } from '../api';
import { useSession } from '../session';
import { useLock } from '../lock';
import { addSampleData, liveMembers, useStore } from '../db/store';
import { updateSettings, useSettings } from '../db/settings';
import { HOLIDAY_GROUPS } from '../logic/holidays';
import { useThemeMode } from '../themeMode';
import { describeSync } from '../components/SyncStatus';
import { useSyncStatus, syncNow } from '../sync/engine';
import BackupSection from '../components/BackupSection';
import PinDialog from '../components/PinDialog';
import { cryptoAvailable } from '../crypto';
import { useToast } from '../toast';

const Section = ({ title, children }) => (
  <Card sx={{ mb: 2 }}>
    <CardContent>
      <Typography variant="h6" sx={{ mb: 1.5 }}>{title}</Typography>
      <Stack spacing={2}>{children}</Stack>
    </CardContent>
  </Card>
);

export default function SettingsPage() {
  const { me } = useSession();
  const lock = useLock();
  const state = useStore();
  const settings = useSettings();
  const { pref, cycle } = useThemeMode();
  const sync = useSyncStatus();
  const toast = useToast();
  const [pinOpen, setPinOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMessage, setPwMessage] = useState(null);

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMessage(null);
    try {
      await api.post('/api/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '' });
      setPwMessage({ severity: 'success', text: 'Password changed' });
    } catch (err) {
      setPwMessage({ severity: 'error', text: err instanceof ApiError ? err.message : 'Could not reach the server' });
    }
  };

  const signOut = async () => {
    const done = await lock.signOutNow();
    if (!done) setConfirmSignOut(true);
  };

  return (
    <>
      <Typography variant="h5" sx={{ mb: 2 }}>Settings</Typography>

      <Section title="Privacy and app lock">
        <Typography variant="body2" color="text.secondary">
          {lock.hasPin
            ? 'A PIN is set. Notes cached on this device are encrypted with it, and the app locks when idle.'
            : 'No PIN yet: the notes cached on this device are not encrypted and the app does not lock.'}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Button variant="contained" onClick={() => setPinOpen(true)} disabled={!cryptoAvailable()}>{lock.hasPin ? 'Change PIN' : 'Set PIN'}</Button>
          {lock.hasPin && <Button onClick={() => lock.lockNow()}>Lock now</Button>}
          {lock.hasPin && <Button color="error" onClick={() => lock.removePin()}>Remove PIN</Button>}
        </Stack>
        <TextField
          name="idleMinutes" label="Go back to Home (and lock) after no activity for" select value={settings.idleMinutes}
          onChange={(e) => updateSettings({ idleMinutes: Number(e.target.value) })} slotProps={{ select: { native: true } }}
        >
          {[1, 2, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} minute{m === 1 ? '' : 's'}</option>)}
          <option value={0}>Never</option>
        </TextField>
        <FormControlLabel
          control={<Switch checked={settings.lockOnHide} onChange={(e) => updateSettings({ lockOnHide: e.target.checked })} />}
          label="Lock as soon as I switch to another app or tab"
        />
      </Section>

      <Section title="Calendar">
        <TextField
          name="maxOut" label="Mark a day red when this many people are out" type="number" value={settings.maxOut}
          onChange={(e) => updateSettings({ maxOut: Math.max(2, Number(e.target.value) || 2) })} slotProps={{ htmlInput: { min: 2, max: 50 } }}
        />
        {HOLIDAY_GROUPS.map((g) => (
          <FormControlLabel
            key={g.key} label={g.label}
            control={<Switch checked={!!settings.holidays[g.key]} onChange={(e) => updateSettings({ holidays: { [g.key]: e.target.checked } })} />}
          />
        ))}
      </Section>

      <Section title="Backup and restore">
        <BackupSection />
      </Section>

      <Section title="Sync">
        <Typography variant="body2">{describeSync(sync)}</Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={syncNow}>Sync now</Button>
          {liveMembers(state).length === 0 && <Button onClick={() => { addSampleData(); toast('Sample data added'); }}>Add sample data</Button>}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Everything is kept on this device and synced to your account when online. Nothing is sent anywhere else.
        </Typography>
      </Section>

      <Section title="Appearance">
        <Button onClick={cycle}>Theme: {pref} (tap to change)</Button>
      </Section>

      <Section title={`Account: ${me.displayName}`}>
        <form onSubmit={changePassword}>
          <Stack spacing={2}>
            <TextField name="currentPassword" label="Current password" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            <TextField name="newPassword" label="New password" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" helperText="At least 8 characters" />
            {pwMessage && <Alert severity={pwMessage.severity}>{pwMessage.text}</Alert>}
            <Button type="submit" disabled={!pw.current || !pw.next}>Change password</Button>
          </Stack>
        </form>
        <Button color="error" variant="outlined" onClick={signOut}>Sign out and clear this device</Button>
      </Section>

      <PinDialog open={pinOpen} onClose={() => setPinOpen(false)} />
      <Dialog open={confirmSignOut} onClose={() => setConfirmSignOut(false)}>
        <DialogTitle>Some changes have not synced</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are offline or the server is unreachable. Signing out clears this device, and changes that were never synced would be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSignOut(false)}>Stay signed in</Button>
          <Button color="error" onClick={() => lock.signOutNow({ force: true })}>Sign out anyway</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

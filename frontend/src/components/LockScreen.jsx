import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { MAX_FAILS, useLock } from '../lock';

/** Full-screen PIN prompt. Nothing from the app is rendered behind it. */
export default function LockScreen() {
  const { unlock, failed, wipeAndSignOut } = useLock();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await unlock(pin);
    if (!ok) setPin('');
    setBusy(false);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Card sx={{ maxWidth: 360, width: '100%' }}>
        <CardContent>
          <form onSubmit={submit}>
            <Stack spacing={2} alignItems="center">
              <LockIcon color="primary" sx={{ fontSize: 48 }} />
              <Typography variant="h6">Team Manager is locked</Typography>
              <TextField
                name="pin" label="PIN" type="password" autoFocus value={pin} autoComplete="off"
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', style: { textAlign: 'center', letterSpacing: 8, fontSize: 22 } } }}
              />
              {failed > 0 && (
                <Alert severity="warning" sx={{ width: '100%' }}>
                  Wrong PIN. {MAX_FAILS - failed} attempt{MAX_FAILS - failed === 1 ? '' : 's'} left before you are signed out
                  and this device is cleared.
                </Alert>
              )}
              <Button type="submit" variant="contained" fullWidth size="large" disabled={busy || pin.length < 4}>Unlock</Button>
              <Button size="small" color="inherit" onClick={wipeAndSignOut}>Forgot PIN? Sign out of this device</Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { cryptoAvailable } from '../crypto';
import { useLock } from '../lock';

const digits = (v) => v.replace(/\D/g, '').slice(0, 8);

/** Set or change the app-lock PIN (4 to 8 digits). */
export default function PinDialog({ open, onClose }) {
  const { setPin: save } = useLock();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const close = () => { setPin(''); setAgain(''); setError(null); onClose(); };
  const submit = async (e) => {
    e.preventDefault();
    if (pin.length < 4) return setError('Use 4 to 8 digits');
    if (pin !== again) return setError('The two PINs do not match');
    setBusy(true);
    try {
      await save(pin);
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const input = { inputMode: 'numeric', pattern: '[0-9]*' };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <form onSubmit={submit}>
        <DialogTitle>Set an app-lock PIN</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              The PIN locks the app after you leave it idle and encrypts the notes cached on this device. It never leaves
              the device, so it cannot be recovered: if you forget it, sign out of this device and sign in again. Prefer 6 or
              more digits.
            </Typography>
            {!cryptoAvailable() && <Alert severity="warning">Encryption needs https:// or localhost; this page cannot use it.</Alert>}
            <TextField name="newPin" label="New PIN" type="password" value={pin} onChange={(e) => setPin(digits(e.target.value))} autoComplete="off" slotProps={{ htmlInput: input }} autoFocus />
            <TextField name="newPin2" label="Repeat PIN" type="password" value={again} onChange={(e) => setAgain(digits(e.target.value))} autoComplete="off" slotProps={{ htmlInput: input }} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy || !cryptoAvailable()}>Save PIN</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

import { useRef, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, List, ListItem, ListItemText,
  Radio, RadioGroup, Stack, TextField, Typography,
} from '@mui/material';
import { useSession } from '../session';
import { useLock } from '../lock';
import { useStore } from '../db/store';
import { flushNow, syncNow } from '../sync/engine';
import { useToast } from '../toast';
import {
  BackupError, backupName, decryptBackup, download, encryptedBackup, fetchServerBackup, hasData, refreshFiles,
  restoreDoc, summarize, uploadBackup, useBackupStatus,
} from '../backup';
import { dayLabel } from '../db/util';

/** Settings card: encrypted daily backups, manual download, restore from a file or from the server's copies. */
export default function BackupSection() {
  const { me } = useSession();
  const { hasPin } = useLock();
  const status = useBackupStatus();
  const toast = useToast();
  useStore(); // re-render when data changes (hasData)
  const fileInput = useRef(null);
  const [restore, setRestore] = useState(null); // { envelope, label }
  const [error, setError] = useState(null);

  const guard = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Something went wrong');
    }
  };

  const backupNow = () => guard(async () => {
    if (!(await uploadBackup(me.displayName))) throw new Error(hasData() ? 'Could not back up. Are you online?' : 'There is nothing to back up yet');
    toast('Encrypted backup saved on the server');
  });
  const downloadNow = () => guard(async () => {
    const env = await encryptedBackup(me.displayName);
    if (!env) throw new Error('Set a PIN first: backups are encrypted with it');
    download(env);
  });
  const pickFile = (e) => guard(async () => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    let envelope;
    try {
      envelope = JSON.parse(await f.text());
    } catch {
      throw new Error('That file is not a Team Manager backup');
    }
    setRestore({ envelope, label: f.name });
  });
  const fromServer = (name) => guard(async () => setRestore({ envelope: await fetchServerBackup(name), label: name }));

  return (
    <>
      <Typography variant="body2" color="text.secondary">
        Backups are JSON files encrypted with your PIN, so the file and the copy on the server are unreadable without it.
        {hasPin ? ' A backup is made automatically once a day while you use the app, and the last 14 are kept.' : ' Set a PIN above to turn them on.'}
      </Typography>
      {!hasPin && <Alert severity="info">Backups need a PIN: it is the encryption key.</Alert>}
      {hasPin && (
        <Typography variant="body2">
          {status.last ? `Last backup on the server: ${dayLabel(status.last)}` : 'No backup on the server yet.'}
        </Typography>
      )}
      {(error || status.error) && <Alert severity="error">{error || status.error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="contained" disabled={!hasPin || status.working} onClick={backupNow}>Back up now</Button>
        <Button disabled={!hasPin} onClick={downloadNow}>Download encrypted file</Button>
        <Button onClick={() => fileInput.current.click()}>Restore from file</Button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={pickFile} data-testid="restore-file" />
        <Button onClick={() => guard(async () => { await refreshFiles(); })}>Refresh list</Button>
      </Stack>
      {status.files.length > 0 && (
        <List dense disablePadding data-testid="backup-list">
          {status.files.map((f) => (
            <ListItem key={f.name} disableGutters secondaryAction={<Button size="small" onClick={() => fromServer(f.name)}>Restore</Button>}>
              <ListItemText primary={dayLabel(f.date)} secondary={`${f.name} · ${Math.max(1, Math.round(f.size / 1024))} KB`} />
            </ListItem>
          ))}
        </List>
      )}
      <RestoreDialog request={restore} onClose={() => setRestore(null)} />
    </>
  );
}

function RestoreDialog({ request, onClose }) {
  const { me } = useSession();
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState('replace');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState(null);

  const close = () => { setPin(''); setError(null); setDoc(null); setMode('replace'); onClose(); };

  const decrypt = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      setDoc(await decryptBackup(request.envelope, pin));
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'Could not read the backup');
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!navigator.onLine) throw new Error('You are offline: restoring needs the server');
      // Safety copy of what is there now, downloaded, so a restore can itself be undone.
      if (hasData()) {
        const env = await encryptedBackup(me.displayName);
        if (env) download(env, `team-backup-before-restore-${backupName().slice(12)}`);
      }
      await flushNow();
      const r = await restoreDoc(doc, mode);
      await syncNow();
      toast(`Restored ${r.restored} item${r.restored === 1 ? '' : 's'}${r.removed ? `, removed ${r.removed}` : ''}${r.skipped ? `, skipped ${r.skipped}` : ''}`);
      close();
    } catch (err) {
      setError(err.message || 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const sum = doc && summarize(doc);
  return (
    <Dialog open={!!request} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>Restore from backup</DialogTitle>
      {!doc ? (
        <form onSubmit={decrypt}>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">{request?.label}</Typography>
              <TextField name="restorePin" label="PIN used when this backup was made" type="password" value={pin} autoFocus autoComplete="off"
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={pin.length < 4}>Decrypt</Button>
          </DialogActions>
        </form>
      ) : (
        <>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Alert severity="success" data-testid="restore-summary">
                Backup from {new Date(doc.exportedAt).toLocaleString()}: {sum.members} team member{sum.members === 1 ? '' : 's'}, {sum.leaves} leave,
                {' '}{sum.allocations} allocation{sum.allocations === 1 ? '' : 's'}, {sum.notes} note{sum.notes === 1 ? '' : 's'}, {sum.holidays} custom holiday{sum.holidays === 1 ? '' : 's'}.
              </Alert>
              <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)}>
                <FormControlLabel value="replace" control={<Radio />} label="Replace: make everything match this backup (anything newer is removed)" />
                <FormControlLabel value="merge" control={<Radio />} label="Add missing: bring back what is in the backup and keep the rest" />
              </RadioGroup>
              <Typography variant="body2" color="text.secondary">A copy of your current data is downloaded first.</Typography>
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>Cancel</Button>
            <Button variant="contained" color={mode === 'replace' ? 'error' : 'primary'} onClick={run} disabled={busy}>{mode === 'replace' ? 'Replace my data' : 'Add missing'}</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

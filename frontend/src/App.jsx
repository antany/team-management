import {
  Avatar, IconButton, ListItemIcon, Menu, MenuItem,
  AppBar, BottomNavigation, BottomNavigationAction, Box, Container, Drawer, List, ListItemButton,
  ListItemText, Paper, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import PeopleIcon from '@mui/icons-material/People';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WorkIcon from '@mui/icons-material/WorkHistory';
import NotesIcon from '@mui/icons-material/EditNote';
import ReviewIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import LockIcon from '@mui/icons-material/Lock';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import GroupsIcon from '@mui/icons-material/Groups';
import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PeoplePage from './pages/PeoplePage';
import MemberPage from './pages/MemberPage';
import CalendarPage from './pages/CalendarPage';
import WorkPage from './pages/WorkPage';
import NotesPage from './pages/NotesPage';
import ReviewPage from './pages/ReviewPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import LockScreen from './components/LockScreen';
import { SyncChip } from './components/SyncStatus';
import { useSession } from './session';
import { useLock } from './lock';
import { useThemeMode } from './themeMode';
import { useDailyBackup } from './backup';

const NAV = [
  { path: '/home', label: 'Home', icon: <HomeIcon /> },
  { path: '/people', label: 'Team', icon: <PeopleIcon /> },
  { path: '/calendar', label: 'Calendar', icon: <CalendarMonthIcon /> },
  { path: '/work', label: 'Work', icon: <WorkIcon /> },
  { path: '/notes', label: 'Notes', icon: <NotesIcon /> },
];
const MORE = [
  { path: '/review', label: 'Review prep', icon: <ReviewIcon /> },
  { path: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];
const DRAWER = 248;
const MODE_ICON = { system: <BrightnessAutoIcon />, light: <LightModeIcon />, dark: <DarkModeIcon /> };

function ThemeToggle() {
  const { pref, cycle } = useThemeMode();
  return (
    <Tooltip title={`Theme: ${pref} (tap to change)`}>
      <IconButton color="inherit" aria-label={`Theme: ${pref}`} onClick={cycle}>{MODE_ICON[pref]}</IconButton>
    </Tooltip>
  );
}

function AccountMenu({ wide }) {
  const { me } = useSession();
  const { hasPin, lockNow } = useLock();
  const nav = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const go = (path) => { setAnchor(null); nav(path); };
  return (
    <>
      {hasPin && (
        <Tooltip title="Lock now">
          <IconButton color="inherit" aria-label="Lock now" onClick={() => lockNow()}><LockIcon /></IconButton>
        </Tooltip>
      )}
      <IconButton aria-label="Account menu" onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>{me.displayName.charAt(0).toUpperCase()}</Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem disabled sx={{ opacity: '1 !important' }}><ListItemText primary={me.displayName} secondary="Signed in" /></MenuItem>
        {!wide && MORE.map((m) => (
          <MenuItem key={m.path} onClick={() => go(m.path)}><ListItemIcon>{m.icon}</ListItemIcon>{m.label}</MenuItem>
        ))}
        {wide && <MenuItem onClick={() => go('/settings')}><ListItemIcon><SettingsIcon /></ListItemIcon>Settings</MenuItem>}
      </Menu>
    </>
  );
}

export default function App() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { me, ready } = useSession();
  const { phase, hasPin } = useLock();
  useDailyBackup(me?.displayName, !!me && phase === 'open' && hasPin);

  if (!me) {
    if (!ready) return null;
    return (
      <Container maxWidth="md"><LoginPage /></Container>
    );
  }
  if (phase === 'loading') return null;
  if (phase === 'locked') return <LockScreen />;

  const all = [...NAV, ...MORE];
  const current = all.find((n) => pathname.startsWith(n.path))?.path ?? '/home';
  const bottom = NAV.some((n) => n.path === current) ? current : false;

  return (
    <>
      <AppBar position="sticky" color="primary" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, fontSize: { xs: '1.02rem', sm: '1.25rem' } }}>
            <GroupsIcon /> Team Manager
          </Typography>
          <SyncChip />
          <ThemeToggle />
          <AccountMenu wide={wide} />
        </Toolbar>
      </AppBar>

      {wide && (
        <Drawer variant="permanent" sx={{ width: DRAWER, '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box' } }}>
          <Toolbar />
          <List>
            {all.map((n) => (
              <ListItemButton key={n.path} selected={current === n.path} onClick={() => nav(n.path)}>
                <ListItemIcon>{n.icon}</ListItemIcon>
                <ListItemText primary={n.label} />
              </ListItemButton>
            ))}
          </List>
        </Drawer>
      )}

      <Box sx={{ ml: wide ? `${DRAWER}px` : 0, pb: wide ? 4 : 14 }}>
        <Container maxWidth="md" sx={{ py: 2 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/login" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/people/:id" element={<MemberPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/work" element={<WorkPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/review/:id" element={<ReviewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </Container>
      </Box>

      {!wide && (
        <Paper
          elevation={0}
          sx={{
            position: 'fixed', left: 8, right: 8, bottom: 'calc(8px + env(safe-area-inset-bottom))', borderRadius: 5, overflow: 'hidden',
            border: 1, borderColor: 'divider', backdropFilter: 'blur(14px)',
            bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(13,19,37,.85)' : 'rgba(255,255,255,.85)'),
            boxShadow: (t) => `0 8px 28px ${t.palette.mode === 'dark' ? 'rgba(0,0,0,.5)' : 'rgba(57,73,171,.22)'}`,
          }}
        >
          <BottomNavigation showLabels value={bottom} onChange={(_, v) => nav(v)}>
            {NAV.map((n) => <BottomNavigationAction key={n.path} value={n.path} label={n.label} icon={n.icon} sx={{ minWidth: 0 }} />)}
          </BottomNavigation>
        </Paper>
      )}
    </>
  );
}

'use client';
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#5b8cff' },     // indigo-ish
    secondary: { main: '#14b8a6' },   // teal
    warning: { main: '#f97316' },     // coral
    success: { main: '#34c759' },
    error: { main: '#ff453a' },
    background: { default: '#0b0f1a', paper: '#121826' },
    text: { primary: '#e7ecf5', secondary: '#9aa7bd' },
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    button: { textTransform: 'none', fontWeight: 700 } },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 999 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});

export default function Providers({ children }) {
  return (<ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>);
}

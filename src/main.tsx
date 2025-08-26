import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import './index.css'
import App from './App.tsx'
import { NotificationProvider } from './components/NotificationProvider'

const theme = createTheme({
  palette: {
    primary: {
      main: '#667eea',
    },
    secondary: {
      main: '#764ba2',
    },
    background: {
      default: '#f5f7fa',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 12,
          fontWeight: 600,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </ThemeProvider>
  </StrictMode>,
)

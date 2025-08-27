import React, { useState } from 'react'
import type { ReactNode } from 'react'
import { 
  Snackbar, 
  Alert, 
  Slide
} from '@mui/material'
import type { AlertColor, SlideProps } from '@mui/material'
import { NotificationContext } from '../contexts/NotificationContext'

function SlideTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />
}

interface NotificationProviderProps {
  children: ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState<AlertColor>('info')

  const showNotification = (msg: string, sev: AlertColor = 'info') => {
    setMessage(msg)
    setSeverity(sev)
    setOpen(true)
  }

  const showSuccess = (msg: string) => showNotification(msg, 'success')
  const showError = (msg: string) => showNotification(msg, 'error')
  const showWarning = (msg: string) => showNotification(msg, 'warning')
  const showInfo = (msg: string) => showNotification(msg, 'info')

  const handleClose = (_?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return
    }
    setOpen(false)
  }

  return (
    <NotificationContext.Provider value={{
      showNotification,
      showSuccess,
      showError,
      showWarning,
      showInfo
    }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={6000}
        onClose={handleClose}
        slots={{ transition: SlideTransition }}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleClose} 
          severity={severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  )
}


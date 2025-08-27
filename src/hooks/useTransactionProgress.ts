import { useState } from 'react'

export interface TransactionStep {
  id: string
  label: string
  status: 'pending' | 'loading' | 'success' | 'error'
  txHash?: string
  error?: string
}

// Hook for managing transaction progress
export function useTransactionProgress(onComplete?: () => void) {
  const [isVisible, setIsVisible] = useState(false)
  const [steps, setSteps] = useState<TransactionStep[]>([])

  const showProgress = (initialSteps: TransactionStep[]) => {
    setSteps(initialSteps)
    setIsVisible(true)
  }

  const hideProgress = () => {
    setIsVisible(false)
    setSteps([])
  }

  const updateStep = (stepId: string, updates: Partial<TransactionStep>) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, ...updates }
        : step
    ))
  }

  const handleComplete = () => {
    if (onComplete) {
      onComplete()
    }
    setTimeout(() => {
      hideProgress()
    }, 3000) // 3秒后自动隐藏进度条
  }

  return {
    isVisible,
    steps,
    showProgress,
    hideProgress,
    updateStep,
    handleComplete
  }
}
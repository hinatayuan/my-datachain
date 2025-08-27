import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'

export interface TransactionStep {
  id: string
  label: string
  status: 'pending' | 'loading' | 'success' | 'error'
  txHash?: string
  error?: string
}

interface TransactionProgressProps {
  steps: TransactionStep[]
  onClose: () => void
  provider?: ethers.BrowserProvider | null
  onComplete?: () => void
}

export function TransactionProgress({ steps, onClose, provider, onComplete }: TransactionProgressProps) {
  const [currentSteps, setCurrentSteps] = useState<TransactionStep[]>(steps)

  // 监听交易哈希并等待确认
  const waitForTransaction = useCallback(async (txHash: string, stepId: string) => {
    if (!provider) return

    try {
      setCurrentSteps(prev => prev.map(step => 
        step.id === stepId 
          ? { ...step, status: 'loading', txHash }
          : step
      ))

      // 等待交易确认
      const receipt = await provider.waitForTransaction(txHash, 2) // 等待2个确认
      
      if (receipt && receipt.status === 1) {
        setCurrentSteps(prev => {
          const newSteps = prev.map(step => 
            step.id === stepId 
              ? { ...step, status: 'success' as const }
              : step
          )
          
          // 检查是否所有步骤都完成了
          const allCompleted = newSteps.every(s => s.status === 'success' || s.status === 'error')
          if (allCompleted && onComplete) {
            setTimeout(() => onComplete(), 1000) // 1秒后触发完成回调
          }
          
          return newSteps
        })
      } else {
        setCurrentSteps(prev => prev.map(step => 
          step.id === stepId 
            ? { ...step, status: 'error', error: '交易失败' }
            : step
        ))
      }
    } catch (error) {
      console.error('等待交易确认失败:', error)
      setCurrentSteps(prev => prev.map(step => 
        step.id === stepId 
          ? { 
              ...step, 
              status: 'error', 
              error: error instanceof Error ? error.message : '交易确认失败'
            }
          : step
      ))
    }
  }, [provider])

  // 当步骤更新时，自动监听新的交易哈希
  useEffect(() => {
    currentSteps.forEach(step => {
      if (step.txHash && step.status === 'pending') {
        waitForTransaction(step.txHash, step.id)
      }
    })
  }, [currentSteps, provider, waitForTransaction])

  // 同步外部步骤更新
  useEffect(() => {
    setCurrentSteps(steps)
  }, [steps])

  const getStepIcon = (status: TransactionStep['status']) => {
    switch (status) {
      case 'pending':
        return '⏳'
      case 'loading':
        return '🔄'
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      default:
        return '⏳'
    }
  }

  const getStatusText = (step: TransactionStep) => {
    switch (step.status) {
      case 'pending':
        return '等待中...'
      case 'loading':
        return '确认中...'
      case 'success':
        return '已完成'
      case 'error':
        return step.error || '失败'
      default:
        return '等待中...'
    }
  }

  const isAllCompleted = currentSteps.every(step => 
    step.status === 'success' || step.status === 'error'
  )

  const hasError = currentSteps.some(step => step.status === 'error')

  const currentStepIndex = currentSteps.findIndex(step => step.status === 'loading')
  const completedSteps = currentSteps.filter(step => step.status === 'success').length
  const totalSteps = currentSteps.length
  const progressPercentage = (completedSteps / totalSteps) * 100

  return (
    <div className="transaction-progress-bar">
      <div className="progress-info">
        <span className="progress-text">📋 交易进度</span>
        <span className="progress-percentage">{Math.round(progressPercentage)}%</span>
      </div>
      
      <div className="progress-track">
        <div 
          className="progress-fill"
          style={{ width: `${progressPercentage}%` }}
        />
        {currentSteps.map((step, index) => {
          const stepProgress = (index / (totalSteps - 1)) * 100
          return (
            <div
              key={step.id}
              className={`progress-step-marker ${step.status}`}
              style={{ left: `${stepProgress}%` }}
              title={`${step.label}: ${getStatusText(step)}`}
            >
              {step.status === 'loading' ? (
                <div className="loading-spinner">{getStepIcon(step.status)}</div>
              ) : (
                getStepIcon(step.status)
              )}
            </div>
          )
        })}
      </div>
      
      <div className="progress-details">
        <div className="current-step">
          {currentStepIndex >= 0 ? (
            <>正在执行: {currentSteps[currentStepIndex]?.label}</>
          ) : isAllCompleted && !hasError ? (
            <span className="success-text">🎉 所有交易已成功完成！</span>
          ) : hasError ? (
            <span className="error-text">⚠️ 部分交易执行失败</span>
          ) : (
            '准备中...'
          )}
        </div>
        
        {currentSteps.some(step => step.txHash && step.status === 'loading') && (
          <div className="current-hash">
            {(() => {
              const loadingStep = currentSteps.find(step => step.txHash && step.status === 'loading')
              return loadingStep?.txHash ? (
                <>
                  交易哈希: <code className="hash-code">
                    {loadingStep.txHash.slice(0, 10)}...{loadingStep.txHash.slice(-8)}
                  </code>
                </>
              ) : null
            })()}
          </div>
        )}
      </div>
    </div>
  )
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
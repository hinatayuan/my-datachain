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
}

export function TransactionProgress({ steps, onClose, provider }: TransactionProgressProps) {
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
        setCurrentSteps(prev => prev.map(step => 
          step.id === stepId 
            ? { ...step, status: 'success' }
            : step
        ))
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

  return (
    <div className="transaction-progress-overlay">
      <div className="transaction-progress-modal">
        <div className="progress-header">
          <h3>📋 交易进度</h3>
          {isAllCompleted && (
            <button 
              className="close-progress"
              onClick={onClose}
              title="关闭"
            >
              ✕
            </button>
          )}
        </div>

        <div className="progress-content">
          {currentSteps.map((step, index) => (
            <div key={step.id} className={`progress-step ${step.status}`}>
              <div className="step-indicator">
                <div className="step-number">
                  {step.status === 'loading' ? (
                    <div className="loading-spinner">{getStepIcon(step.status)}</div>
                  ) : (
                    getStepIcon(step.status)
                  )}
                </div>
                {index < currentSteps.length - 1 && (
                  <div className={`step-line ${
                    step.status === 'success' ? 'completed' : 
                    step.status === 'loading' ? 'active' : ''
                  }`} />
                )}
              </div>

              <div className="step-content">
                <div className="step-label">{step.label}</div>
                <div className={`step-status ${step.status}`}>
                  {getStatusText(step)}
                </div>
                {step.txHash && (
                  <div className="step-hash">
                    <span>交易哈希: </span>
                    <code className="hash-code">
                      {step.txHash.slice(0, 10)}...{step.txHash.slice(-8)}
                    </code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="progress-footer">
          {isAllCompleted && !hasError && (
            <div className="success-message">
              🎉 所有交易已成功完成！
            </div>
          )}
          {hasError && (
            <div className="error-message">
              ⚠️ 部分交易执行失败，请检查详情
            </div>
          )}
          {!isAllCompleted && (
            <div className="loading-message">
              ⏳ 正在处理交易，请勿关闭页面...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Hook for managing transaction progress
export function useTransactionProgress() {
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

  return {
    isVisible,
    steps,
    showProgress,
    hideProgress,
    updateStep
  }
}
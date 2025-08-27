import { useState } from 'react'
import { ethers } from 'ethers'
import { TransactionProgress, type TransactionStep } from './TransactionProgress'
import { useTransactionProgress } from '../hooks/useTransactionProgress'
import { useNotification } from '../hooks/useNotification'

interface Network {
  name: string
  chainId: string
  rpcUrl: string
  symbol: string
  decimals: number
}

interface Transaction {
  hash: string
  from: string
  to: string
  value: string
  data: string
  timestamp: number
  source?: 'blockchain' | 'local'
}

interface NativeTransferProps {
  account: string
  provider: ethers.BrowserProvider | null
  signer: ethers.JsonRpcSigner | null
  network: Network
  transactions: Transaction[]
  onTransactionUpdate: (transactions: Transaction[]) => void
  onBalanceUpdate: () => void
}

export function NativeTransfer({ 
  account, 
  provider, 
  signer, 
  network, 
  transactions, 
  onTransactionUpdate,
  onBalanceUpdate
}: NativeTransferProps) {
  const { showError, showSuccess, showWarning } = useNotification()
  const [toAddress, setToAddress] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [useData, setUseData] = useState<boolean>(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [searchInput, setSearchInput] = useState<string>('')
  const [isSearching, setIsSearching] = useState<boolean>(false)
  
  // 交易进度条状态
  const { isVisible, steps, showProgress, hideProgress, updateStep, handleComplete } = useTransactionProgress(() => {
    // 完成后自动刷新余额和交易记录
    onBalanceUpdate();
  })

  const getTransactionDetails = async (txHash: string): Promise<Transaction | null> => {
    try {
      console.log('正在查询交易详情:', txHash)
      
      let infuraUrl = ''
      switch (network.chainId) {
        case '0x1':
          infuraUrl = import.meta.env.VITE_ETHEREUM_RPC || ''
          break
        case '0xaa36a7':
          infuraUrl = import.meta.env.VITE_SEPOLIA_RPC || ''
          break
        case '0x5':
          infuraUrl = import.meta.env.VITE_GOERLI_RPC || ''
          break
        default:
          infuraUrl = ''
      }
      
      const rpcProvider = infuraUrl ? new ethers.JsonRpcProvider(infuraUrl) : provider!
      
      const tx = await rpcProvider.getTransaction(txHash)
      if (!tx) {
        console.log('交易未找到或未确认')
        return null
      }
      
      const receipt = await rpcProvider.getTransactionReceipt(txHash)
      if (!receipt) {
        console.log('交易尚未确认')
        return null
      }
      
      const block = await rpcProvider.getBlock(receipt.blockNumber)
      
      let dataText = ''
      if (tx.data && tx.data !== '0x') {
        try {
          dataText = ethers.toUtf8String(tx.data)
        } catch {
          dataText = tx.data
        }
      }
      
      const transaction: Transaction = {
        hash: tx.hash,
        from: tx.from || '',
        to: tx.to || '',
        value: ethers.formatEther(tx.value || 0),
        data: dataText,
        timestamp: (block?.timestamp || Date.now() / 1000) * 1000,
        source: 'blockchain'
      }
      
      console.log('交易详情查询成功:', transaction)
      return transaction
    } catch (error) {
      console.error('查询交易详情失败:', error)
      return null
    }
  }

  const sendTransaction = async () => {
    if (!signer || !toAddress || !amount) {
      showError('请填写完整信息')
      return
    }

    if (!ethers.isAddress(toAddress)) {
      showError('请输入有效的以太坊地址')
      return
    }

    try {
      setIsLoading(true)
      
      // 设置交易进度步骤
      const progressSteps: TransactionStep[] = [
        {
          id: 'validation',
          label: '验证交易参数',
          status: 'loading'
        },
        {
          id: 'submit',
          label: '提交交易到网络',
          status: 'pending'
        },
        {
          id: 'confirm',
          label: '等待区块确认',
          status: 'pending'
        }
      ]

      showProgress(progressSteps)
      
      const txRequest: ethers.TransactionRequest = {
        to: toAddress,
        value: ethers.parseEther(amount)
      }
      
      const code = await provider!.getCode(toAddress)
      const isContract = code !== '0x'
      
      console.log('地址检查:', {
        address: toAddress,
        isContract,
        code: code.length > 10 ? code.substring(0, 10) + '...' : code
      })
      
      if (useData && message.trim()) {
        const hexData = ethers.hexlify(ethers.toUtf8Bytes(message))
        
        if (isContract) {
          const confirmSend = confirm('目标地址是合约地址，发送带数据的交易可能会调用合约函数。确定要继续吗？')
          if (!confirmSend) {
            setIsLoading(false)
            return
          }
        } else {
          const confirmSend = confirm('⚠️ 即将发送带数据的交易\n\n如果目标地址是您钱包中的其他账户，MetaMask可能会阻止此交易。\n\n是否继续？')
          if (!confirmSend) {
            setIsLoading(false)
            return
          }
        }
        
        txRequest.data = hexData
        console.log('交易参数:', {
          to: toAddress,
          value: amount + ' ' + network.symbol,
          data: hexData,
          dataText: message,
          network: network.name,
          chainId: network.chainId,
          isContract
        })
      } else {
        console.log('普通转账参数:', {
          to: toAddress,
          value: amount + ' ' + network.symbol,
          network: network.name,
          chainId: network.chainId,
          isContract
        })
      }
      
      // 验证完成
      updateStep('validation', { status: 'success' })
      updateStep('submit', { status: 'loading' })

      const tx = await signer.sendTransaction(txRequest)
      console.log('交易已提交:', tx.hash)
      
      // 提交成功，开始确认
      updateStep('submit', { status: 'success', txHash: tx.hash })
      updateStep('confirm', { status: 'loading', txHash: tx.hash })

      const initialTransaction: Transaction = {
        hash: tx.hash,
        from: account,
        to: toAddress,
        value: amount,
        data: useData && message.trim() ? message : '',
        timestamp: Date.now(),
        source: 'local'
      }

      const updatedTransactions = [initialTransaction, ...transactions]
      
      // 立即更新状态和本地存储
      onTransactionUpdate(updatedTransactions)
      localStorage.setItem('datachain_transactions', JSON.stringify(updatedTransactions))
      
      // 强制触发重新渲染 - 添加调试日志
      console.log('交易记录已添加，当前记录数量:', updatedTransactions.length)
      console.log('新增交易记录:', initialTransaction)
      
      // 稍后清空表单，确保状态更新完成
      setTimeout(() => {
        setToAddress('')
        setAmount('')
        setMessage('')
      }, 100)
      
      onBalanceUpdate()
      
      showSuccess('交易已提交，哈希: ' + tx.hash + '\n记录已添加到交易列表')
      
      console.log('等待交易确认...')
      
      // 异步等待确认，不阻塞UI，确保本地记录已经显示
      setTimeout(async () => {
        try {
          // 等待交易确认
          await tx.wait()
          
          // 确认成功
          updateStep('confirm', { status: 'success' })
          console.log('交易确认成功，开始获取区块链详情')
          
          // 尝试从区块链获取详细信息并更新记录
          const blockchainTx = await getTransactionDetails(tx.hash)
          if (blockchainTx) {
            // 重新获取最新的交易列表，确保不会覆盖其他可能的更新
            const currentStoredTransactions = localStorage.getItem('datachain_transactions')
            const currentTransactions = currentStoredTransactions ? JSON.parse(currentStoredTransactions) : []
            const finalTransactions = currentTransactions.filter((t: Transaction) => t.hash !== tx.hash)
            const newTransactions = [blockchainTx, ...finalTransactions]
            
            console.log('区块链交易详情获取成功，更新记录:', blockchainTx)
            onTransactionUpdate(newTransactions)
            localStorage.setItem('datachain_transactions', JSON.stringify(newTransactions))
          } else {
            console.log('无法从区块链获取交易详情，保持本地记录')
          }
        } catch (confirmError) {
          console.error('获取确认后的交易详情失败:', confirmError)
          updateStep('confirm', { status: 'error', error: '获取交易确认失败' })
          console.log('确认失败但保持本地交易记录显示')
        }
      }, 500) // 减少等待时间到500ms
      
    } catch (error) {
      console.error('交易失败详情:', error)
      
      let errorMsg = '交易失败: '
      
      // 更新当前步骤为错误状态
      const currentStep = steps.find(s => s.status === 'loading')
      if (currentStep) {
        updateStep(currentStep.id, { status: 'error', error: errorMsg })
      }
      
      if (error instanceof Error) {
        if (error.message.includes('External transactions to internal accounts cannot include data')) {
          errorMsg = '⚠️ MetaMask检测到目标地址为"内部账户"，不允许发送带数据的交易\n\n解决方案:\n1. 关闭"启用数据留言"开关（推荐）\n2. 或者发送到其他外部地址\n3. 或者使用其他钱包（如WalletConnect）\n\n注：内部账户通常指同一钱包内的其他账户'
        } else if (error.message.includes('insufficient funds')) {
          errorMsg = '余额不足，请检查账户余额'
        } else if (error.message.includes('user rejected')) {
          errorMsg = '用户取消了交易'
        } else {
          errorMsg += error.message
        }
      } else {
        errorMsg += '未知错误'
      }
      
      showError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  // 通过txHash查询并添加交易记录
  const searchTransactionByHash = async (txHash: string) => {
    if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
      showError('请输入有效的交易哈希（0x开头的66位字符串）')
      return
    }

    setIsSearching(true)
    console.log('正在通过交易哈希查询交易详情:', txHash)

    try {
      // 检查是否已存在该交易记录
      const existingTx = transactions.find(tx => tx.hash.toLowerCase() === txHash.toLowerCase())
      if (existingTx) {
        // 直接设置搜索词高亮显示已存在的交易，不显示警告
        setSearchTerm(txHash)
        setSearchInput(txHash)
        setIsSearching(false)
        return
      }

      const transactionDetail = await getTransactionDetails(txHash)
      if (transactionDetail) {
        // 将新查询到的交易添加到记录列表的顶部
        const updatedTransactions = [transactionDetail, ...transactions]
        onTransactionUpdate(updatedTransactions)
        localStorage.setItem('datachain_transactions', JSON.stringify(updatedTransactions))
        
        // 设置搜索词以高亮显示新添加的交易
        setSearchTerm(txHash)
        setSearchInput(txHash)
        
        showSuccess(`成功查询到交易详情并添加到记录中！交易哈希: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`)
        
        console.log('交易详情已添加到记录:', transactionDetail)
      } else {
        showWarning('未找到该交易或交易尚未确认。可能原因：交易哈希错误、交易尚未确认、交易不在当前网络中或RPC连接问题')
      }
    } catch (error) {
      console.error('查询交易失败:', error)
      showError('查询交易失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setIsSearching(false)
    }
  }


  // 执行搜索
  const performSearch = () => {
    if (searchInput.startsWith('0x') && searchInput.length === 66) {
      searchTransactionByHash(searchInput)
    } else {
      setSearchTerm(searchInput)
    }
  }

  // 清除搜索
  const clearSearch = () => {
    setSearchTerm('')
    setSearchInput('')
  }

  // 安全的字符串检查函数
  const safeIncludes = (str: string | undefined | null, searchTerm: string): boolean => {
    if (!str || !searchTerm) return false
    return str.toString().toLowerCase().includes(searchTerm.toLowerCase())
  }
  
  // 过滤交易记录 - 如果没有搜索词则显示所有记录
  const filteredTransactions = searchTerm 
    ? transactions.filter(tx => 
        safeIncludes(tx.hash, searchTerm) ||
        safeIncludes(tx.from, searchTerm) ||
        safeIncludes(tx.to, searchTerm) ||
        safeIncludes(tx.data, searchTerm)
      )
    : transactions  // 没有搜索词时显示全部记录

  // 添加调试日志
  console.log('NativeTransfer组件渲染 - 总交易记录数:', transactions.length)
  console.log('NativeTransfer组件渲染 - 过滤后记录数:', filteredTransactions.length)
  console.log('NativeTransfer组件渲染 - 搜索词:', searchTerm)
  console.log('NativeTransfer组件渲染 - 原始交易记录:', transactions)

  return (
    <div className="unified-layout">
      {/* 转账表单区域 */}
      <div className="transfer-section">
        <h2>原生转账</h2>
        
        <div className="form-row">
          <input
            type="text"
            className="form-input"
            placeholder="收款账户 (0x...)"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
          />
        </div>
        
        <div className="form-row">
          <input
            type="text"
            className="form-input"
            placeholder={`转账金额 (${network.symbol})`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        
        <div className="form-row">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={useData}
              onChange={(e) => setUseData(e.target.checked)}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">启用数据留言 (MetaMask内部账户不支持)</span>
          </label>
        </div>
        
        {useData && (
          <div className="form-row">
            <textarea
              className="form-textarea"
              placeholder="数据留言框（16进制存储到区块链）"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        )}
        
        <button
          className="submit-btn"
          onClick={sendTransaction}
          disabled={isLoading || !account}
        >
          {isLoading ? '提交中...' : '提交交易'}
        </button>
      </div>

      {/* 交易进度条 */}
      {isVisible && (
        <TransactionProgress
          steps={steps}
          onClose={hideProgress}
          provider={provider}
          onComplete={handleComplete}
        />
      )}
      
      {/* 记录查询区域 */}
      <div className="records-section">
        <h2>链上交易记录</h2>
        
        <div className="search-box">
          <div className="search-input-group">
            <input
              type="text"
              className="search-input"
              placeholder="输入交易哈希(0x...)查询或关键词过滤记录"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  performSearch()
                }
              }}
            />
            <button
              className="search-btn"
              onClick={performSearch}
              disabled={isSearching}
            >
              🔍
            </button>
            {searchInput && (
              <button
                className="clear-search-btn"
                onClick={clearSearch}
              >
                ✕
              </button>
            )}
          </div>
          
          {isSearching && (
            <div style={{ padding: '10px', background: 'rgba(255, 152, 0, 0.1)', borderRadius: '8px', marginBottom: '10px', wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
              🔄 正在查询交易详情，请稍候...
            </div>
          )}
          
          {searchTerm && !isSearching && (
            <div style={{ padding: '10px', background: 'rgba(72, 187, 120, 0.1)', borderRadius: '8px', marginBottom: '10px', wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
              正在搜索:<br /> <strong style={{ wordBreak: 'break-all' }}>{searchTerm}</strong> <br /> 找到 {filteredTransactions.length} 条交易记录
            </div>
          )}
        </div>
        
        <div className="records-list">
          {filteredTransactions.length === 0 ? (
            <div className="empty-state">
              <p>暂无交易记录</p>
              <p>请先发送一笔交易，转账成功后会自动显示交易记录</p>
            </div>
          ) : (
            filteredTransactions.map((tx, index) => (
              <div key={index} className="record-item">
                <div className="record-header">
                  <div>
                    <div style={{ 
                      fontSize: '10px', 
                      color: tx.source === 'blockchain' ? '#48bb78' : '#667eea',
                      background: tx.source === 'blockchain' ? 'rgba(72, 187, 120, 0.1)' : 'rgba(102, 126, 234, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      marginBottom: '5px'
                    }}>
                      {tx.source === 'blockchain' ? '🔗 区块链' : '💾 本地'}
                    </div>
                    <div className="tx-hash">{tx.hash}</div>
                  </div>
                  <div className="timestamp">
                    {new Date(tx.timestamp).toLocaleString()}
                  </div>
                </div>
                
                <div className="record-details">
                  <p><strong>From:</strong> {tx.from}</p>
                  <p><strong>To:</strong> {tx.to}</p>
                  <p><strong>Value:</strong> {tx.value} {network.symbol}</p>
                  {tx.data && <p><strong>Data:</strong> {tx.data}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
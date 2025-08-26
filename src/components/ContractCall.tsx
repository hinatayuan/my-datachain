import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { request, gql } from "graphql-request";
import { TransactionProgress, useTransactionProgress, type TransactionStep } from './TransactionProgress';
import { useNotification } from './NotificationProvider';

interface ContractInfo {
  name: string;
  age: string;
}

interface ContractLog {
  id: string;
  transactionHash?: string;
  blockNumber?: string;
  blockTimestamp?: string;
  name?: string;
  age?: string;
}

interface ContractCallProps {
  account: string;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  contractAddress: string;
  contractABI: ethers.InterfaceAbi;
}

export function ContractCall({
  account,
  provider,
  signer,
  contractAddress,
  contractABI,
}: ContractCallProps) {
  const { showError, showSuccess, showWarning } = useNotification();
  const [contractInfo, setContractInfo] = useState<ContractInfo>({
    name: "",
    age: "",
  });
  const [isContractLoading, setIsContractLoading] = useState<boolean>(false);
  const [contractLogs, setContractLogs] = useState<ContractLog[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  
  // 交易进度条状态
  const { isVisible, steps, showProgress, hideProgress, updateStep } = useTransactionProgress();

  // 组件初始化时查询一次
  useEffect(() => {
    queryContractLogs(10);
  }, []); // 空依赖数组，只在组件挂载时执行一次

  const queryContractLogs = async (limit: number = 10) => {
    const GRAPH_URL =
      "https://api.studio.thegraph.com/query/119001/yd-graph-2/v0.0.1";

    const possibleFieldNames = [
      "instructors",
      "instructorEntities",
      "instructor",
      "events",
      "logs",
      "instructorEvents",
    ];

    let successful = false;

    for (const fieldName of possibleFieldNames) {
      try {
        const query = gql`
          query GetEvents($first: Int!) {
            ${fieldName}(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
              id
              transactionHash
              blockNumber
              blockTimestamp
              name
              age
            }
          }
        `;

        console.log(`尝试查询字段: ${fieldName}, 限制: ${limit}条`);
        const data: Record<string, unknown[]> = await request(GRAPH_URL, query, { first: limit });

        if (data[fieldName] && data[fieldName].length > 0) {
          console.log(
            `成功使用字段 ${fieldName}, 获取到 ${data[fieldName].length} 条记录:`,
            data[fieldName]
          );
          setContractLogs(data[fieldName] as ContractLog[] || []);
          successful = true;
          break;
        }
      } catch (err) {
        console.log(`字段 ${fieldName} 查询失败:`, err);
      }
    }

    if (!successful) {
      console.log("所有预设字段都查询失败，尝试基础查询");
      try {
        const basicQuery = gql`
          query BasicQuery {
            _meta {
              block {
                number
                timestamp
              }
            }
          }
        `;
        const metaData: Record<string, unknown> = await request(GRAPH_URL, basicQuery);
        console.log("子图元数据:", metaData);
        setContractLogs([]);
      } catch (metaError) {
        console.error("基础查询也失败:", metaError);
        setContractLogs([]);
      }
    }
  };

  const queryTransactionByHash = async (txHash: string) => {
    const GRAPH_URL =
      "https://api.studio.thegraph.com/query/119001/yd-graph-2/v0.0.1";

    if (!txHash || txHash.length !== 66) {
      showError("请输入有效的交易哈希 (0x开头的66位字符串)");
      return;
    }

    const possibleFieldNames = [
      "instructors",
      "instructorEntities",
      "instructor",
      "events",
      "logs",
      "instructorEvents",
    ];

    for (const fieldName of possibleFieldNames) {
      try {
        const query = gql`
          query GetTransactionByHash($txHash: String!) {
            ${fieldName}(where: {transactionHash: $txHash}) {
              id
              transactionHash
              blockNumber
              blockTimestamp
              name
              age
            }
          }
        `;

        console.log(`按交易哈希查询: ${txHash}`);
        const data: Record<string, unknown[]> = await request(GRAPH_URL, query, { txHash });

        if (data[fieldName] && data[fieldName].length > 0) {
          console.log(`找到交易信息:`, data[fieldName]);
          setContractLogs(data[fieldName] as ContractLog[]);
          showSuccess(`成功找到 ${data[fieldName].length} 条相关记录`);
          return;
        }
      } catch (err) {
        console.log(`字段 ${fieldName} 查询失败:`, err);
      }
    }

    showWarning("未找到该交易的记录，请检查交易哈希是否正确");
    setContractLogs([]);
  };

  const callContract = async () => {
    if (!signer || !contractInfo.name || !contractInfo.age) {
      showError("请填写姓名和年龄");
      return;
    }

    try {
      setIsContractLoading(true);

      // 设置合约调用进度步骤
      const progressSteps: TransactionStep[] = [
        {
          id: 'validation',
          label: '验证合约参数',
          status: 'loading'
        },
        {
          id: 'submit',
          label: '提交合约调用',
          status: 'pending'
        },
        {
          id: 'confirm',
          label: '等待交易确认',
          status: 'pending'
        },
        {
          id: 'refresh',
          label: '刷新合约日志',
          status: 'pending'
        }
      ];

      showProgress(progressSteps);

      const contract = new ethers.Contract(
        contractAddress,
        contractABI,
        signer
      );

      // 验证完成
      updateStep('validation', { status: 'success' });
      updateStep('submit', { status: 'loading' });

      const tx = await contract.setInfo(
        contractInfo.name,
        parseInt(contractInfo.age)
      );
      console.log("合约调用交易已提交:", tx.hash);

      // 提交成功，开始确认
      updateStep('submit', { status: 'success', txHash: tx.hash });
      updateStep('confirm', { status: 'loading', txHash: tx.hash });

      // 等待交易确认 - 进度条组件会自动处理waitForTransaction
      await tx.wait();
      console.log("合约调用已确认");

      // 确认成功，开始刷新日志
      updateStep('confirm', { status: 'success' });
      updateStep('refresh', { status: 'loading' });

      await queryContractLogs(10);

      // 完成所有步骤
      updateStep('refresh', { status: 'success' });

      setContractInfo({ name: "", age: "" });
    } catch (error) {
      console.error("合约调用失败:", error);
      
      // 更新当前步骤为错误状态
      const currentStep = steps.find(s => s.status === 'loading');
      if (currentStep) {
        const errorMsg = error instanceof Error ? error.message : "未知错误";
        updateStep(currentStep.id, { status: 'error', error: errorMsg });
      }
    } finally {
      setIsContractLoading(false);
    }
  };

  const queryContractInfo = async () => {
    if (!provider || !contractAddress) return;

    try {
      const contract = new ethers.Contract(
        contractAddress,
        contractABI,
        provider
      );
      const [name, age] = await contract.getInfo();
      const result = { name, age: age.toString() };
      console.log("合约当前状态:", result);
      showSuccess(`当前合约状态: 姓名: ${name}, 年龄: ${age.toString()}`);
      return result;
    } catch (error) {
      console.error("查询合约状态失败:", error);
      showError(
        "查询失败: " + (error instanceof Error ? error.message : "未知错误")
      );
      return null;
    }
  };

  // 安全的字符串检查函数
  const safeIncludes = (
    str: string | undefined | null,
    searchTerm: string
  ): boolean => {

    if (!str || !searchTerm) return false;
    return str.toString().toLowerCase().includes(searchTerm.toLowerCase());
  };

  // 过滤合约日志
  const filteredContractLogs = contractLogs.filter((log) => {
    if (!searchTerm) return true; // 如果没有搜索词，显示所有日志
    return (
      safeIncludes(log.transactionHash, searchTerm) ||
      safeIncludes(log.name, searchTerm) ||
      safeIncludes(log.age, searchTerm) ||
      safeIncludes(log.blockNumber, searchTerm)
    );
  });

  return (
    <div className="unified-layout">
      {/* 转账表单区域 */}
      <div className="transfer-section">
        <h2>合约调用</h2>
        
        <div style={{ 
          background: 'rgba(102, 126, 234, 0.1)', 
          border: '1px solid rgba(102, 126, 234, 0.2)',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <p><strong>合约地址:</strong> {contractAddress}</p>
          <p><strong>功能说明:</strong> 调用 setInfo 函数设置你的姓名和年龄</p>
        </div>
        
        <div className="form-row">
          <input
            type="text"
            className="form-input"
            placeholder="姓名 (name)"
            value={contractInfo.name}
            onChange={(e) =>
              setContractInfo((prev) => ({ ...prev, name: e.target.value }))
            }
          />
        </div>
        
        <div className="form-row">
          <input
            type="number"
            className="form-input"
            placeholder="年龄 (age)"
            value={contractInfo.age}
            onChange={(e) =>
              setContractInfo((prev) => ({ ...prev, age: e.target.value }))
            }
          />
        </div>
        
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="submit-btn"
            onClick={callContract}
            disabled={isContractLoading || !account}
            style={{ flex: '1', minWidth: '120px' }}
          >
            {isContractLoading ? "调用中..." : "调用合约"}
          </button>
          <button
            className="submit-btn"
            onClick={queryContractInfo}
            disabled={!provider}
            style={{ 
              flex: '1',
              minWidth: '120px',
              background: !provider 
                ? 'linear-gradient(135deg, #cbd5e0 0%, #a0aec0 100%)'
                : 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)'
            }}
          >
            查询当前状态
          </button>
        </div>
      </div>
      
      {/* 记录查询区域 */}
      <div className="records-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>合约调用日志</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="search-btn"
              onClick={() => queryContractLogs(10)}
              title="刷新合约日志"
              style={{ fontSize: '12px', padding: '8px 12px' }}
            >
              🔄 刷新
            </button>
            <button
              className="search-btn"
              onClick={() => queryContractLogs(50)}
              title="加载更多记录"
              style={{ fontSize: '12px', padding: '8px 12px' }}
            >
              📚 更多
            </button>
          </div>
        </div>
        
        <div className="search-box">
          <div className="search-input-group">
            <input
              type="text"
              className="search-input"
              placeholder="输入交易哈希(0x...)精确查询或输入关键词过滤"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (searchInput.startsWith("0x") && searchInput.length === 66) {
                    queryTransactionByHash(searchInput);
                    setSearchTerm("");
                  } else {
                    setSearchTerm(searchInput);
                  }
                }
              }}
            />
            <button
              className="search-btn"
              onClick={() => {
                if (searchInput.startsWith("0x") && searchInput.length === 66) {
                  queryTransactionByHash(searchInput);
                  setSearchTerm("");
                } else {
                  setSearchTerm(searchInput);
                }
              }}
            >
              {searchInput.startsWith("0x") && searchInput.length === 66 ? "🔗" : "🔍"}
            </button>
            {searchTerm && (
              <button
                className="clear-search-btn"
                onClick={() => {
                  setSearchTerm("");
                  setSearchInput("");
                }}
              >
                ✕
              </button>
            )}
          </div>
          
          {searchTerm && (
            <div style={{ padding: '10px', background: 'rgba(72, 187, 120, 0.1)', borderRadius: '8px', marginBottom: '10px' }}>
              正在搜索: <strong>{searchTerm}</strong> - 找到 {filteredContractLogs.length} 条合约日志
            </div>
          )}
        </div>
        
        <div className="records-list">
          {filteredContractLogs.length === 0 ? (
            <div className="empty-state">
              {contractLogs.length === 0 ? (
                <>
                  <p>暂无合约日志</p>
                  <p>调用合约后，日志将通过The Graph显示在这里</p>
                </>
              ) : (
                <>
                  <p>未找到匹配的日志记录</p>
                  <p>请尝试其他搜索关键词</p>
                </>
              )}
            </div>
          ) : (
            filteredContractLogs.map((log, index) => (
              <div key={index} className="record-item">
                <div className="record-header">
                  <div>
                    <div style={{ 
                      fontSize: '10px', 
                      color: '#ed8936',
                      background: 'rgba(237, 137, 54, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      marginBottom: '5px'
                    }}>
                      📊 The Graph
                    </div>
                    <div className="tx-hash">
                      {log.transactionHash || "未知交易哈希"}
                    </div>
                  </div>
                  <div className="timestamp">
                    {log.blockTimestamp
                      ? new Date(parseInt(log.blockTimestamp) * 1000).toLocaleString()
                      : "未知时间"}
                  </div>
                </div>
                
                <div className="record-details">
                  <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
                    <div style={{
                      flex: '1',
                      background: 'linear-gradient(135deg, rgba(72, 187, 120, 0.1), rgba(56, 161, 105, 0.05))',
                      border: '1px solid rgba(72, 187, 120, 0.2)',
                      borderRadius: '8px',
                      padding: '15px'
                    }}>
                      <p style={{ margin: '8px 0', fontSize: '13px' }}>
                        <strong>👤 姓名:</strong>{" "}
                        <span style={{
                          color: '#48bb78',
                          fontWeight: '700',
                          fontSize: '16px',
                          background: 'rgba(72, 187, 120, 0.1)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(72, 187, 120, 0.2)'
                        }}>
                          {log.name || "未知"}
                        </span>
                      </p>
                      <p style={{ margin: '8px 0', fontSize: '13px' }}>
                        <strong>🎂 年龄:</strong>{" "}
                        <span style={{
                          color: '#48bb78',
                          fontWeight: '700',
                          fontSize: '16px',
                          background: 'rgba(72, 187, 120, 0.1)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(72, 187, 120, 0.2)'
                        }}>
                          {log.age || "未知"}
                        </span>
                      </p>
                    </div>
                    <div style={{
                      flex: '1',
                      background: 'linear-gradient(135deg, rgba(66, 153, 225, 0.1), rgba(49, 130, 206, 0.05))',
                      border: '1px solid rgba(66, 153, 225, 0.2)',
                      borderRadius: '8px',
                      padding: '15px'
                    }}>
                      <p style={{ margin: '8px 0', fontSize: '13px' }}>
                        <strong>📍 交易哈希:</strong>{" "}
                        <code style={{
                          fontFamily: "'Courier New', monospace",
                          fontSize: '12px',
                          background: 'rgba(102, 126, 234, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          color: '#667eea',
                          wordBreak: 'break-all'
                        }}>
                          {log.transactionHash || "未知哈希"}
                        </code>
                      </p>
                      <p style={{ margin: '8px 0', fontSize: '13px' }}>
                        <strong>🔗 区块号:</strong>{" "}
                        <span style={{
                          color: '#4299e1',
                          fontWeight: '600',
                          fontFamily: "'Courier New', monospace",
                          background: 'rgba(66, 153, 225, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          #{log.blockNumber || "未知"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 交易进度条 */}
      {isVisible && (
        <TransactionProgress
          steps={steps}
          onClose={hideProgress}
          provider={provider}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  TransactionProgress,
  useTransactionProgress,
  type TransactionStep,
} from "./TransactionProgress";
import { useNotification } from "./NotificationProvider";

interface Network {
  name: string;
  chainId: string;
  rpcUrl: string;
  symbol: string;
  decimals: number;
}

interface TokenInfo {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
}

interface USDTRecord {
  hash: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  timestamp: number;
  status: "pending" | "confirmed" | "failed";
}

interface USDTTransferProps {
  account: string;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  network: Network;
  onBalanceUpdate: () => void;
}

export function USDTTransfer({
  account,
  provider,
  signer,
  network,
  onBalanceUpdate,
}: USDTTransferProps) {
  const { showError, showSuccess, showWarning } = useNotification();
  const [toAddress, setToAddress] = useState<string>("");
  const [tokenAmount, setTokenAmount] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [selectedToken, setSelectedToken] = useState<string>("USDT");
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  // const [showSwapModal, setShowSwapModal] = useState<boolean>(false)
  // const [swapEthAmount, setSwapEthAmount] = useState<string>('')
  // const [swapTokenAmount, setSwapTokenAmount] = useState<string>('')
  const [usdtRecords, setUsdtRecords] = useState<USDTRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [isLoadingRecords, setIsLoadingRecords] = useState<boolean>(false);
  const [isSearchingTxHash, setIsSearchingTxHash] = useState<boolean>(false);

  // 交易进度条状态
  const { isVisible, steps, showProgress, hideProgress, updateStep, handleComplete } =
    useTransactionProgress(() => {
      // 完成后自动刷新链上记录
      loadTokenRecordsFromChain();
    });

  // 代币信息配置
  const TOKEN_INFO: { [chainId: string]: { [symbol: string]: TokenInfo } } = {
    "0xaa36a7": {
      // Sepolia
      USDT: {
        name: "Tether USD",
        symbol: "USDT",
        address: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
        decimals: 6,
      },
      USDC: {
        name: "USD Coin",
        symbol: "USDC",
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        decimals: 6,
      },
    },
    "0x1": {
      // Ethereum Mainnet
      USDT: {
        name: "Tether USD",
        symbol: "USDT",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        decimals: 6,
      },
      USDC: {
        name: "USD Coin",
        symbol: "USDC",
        address: "0xA0b86a33E6441cf2A5d3fB4A52C8B8C9A4DE0e6d",
        decimals: 6,
      },
    },
  };

  // ERC20 ABI (包含approve功能和Transfer事件)
  const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ];

  // 备用：从本地存储加载记录
  const loadUSDTRecordsFromLocal = () => {
    const saved = localStorage.getItem("datachain_usdt_records");
    if (saved) {
      const localRecords = JSON.parse(saved) as USDTRecord[];
      // 只显示当前钱包地址相关的记录
      const userRecords = localRecords.filter(
        (record) =>
          record.from.toLowerCase() === account.toLowerCase() ||
          record.to.toLowerCase() === account.toLowerCase()
      );
      setUsdtRecords(userRecords);
    }
  };

  // 从链上查询代币转账记录
  const loadTokenRecordsFromChain = useCallback(async () => {
    if (!provider || !account) return;

    setIsLoadingRecords(true);
    const allRecords: USDTRecord[] = [];

    try {
      // 查询每个支持的代币的转账记录
      for (const tokenSymbol of Object.keys(
        TOKEN_INFO[network.chainId] || {}
      )) {
        const tokenInfo = TOKEN_INFO[network.chainId][tokenSymbol];
        if (!tokenInfo) continue;

        const contract = new ethers.Contract(
          tokenInfo.address,
          ERC20_ABI,
          provider
        );

        // 查询最近的区块范围（避免查询过多区块导致性能问题）
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 10000); // 查询最近10000个区块

        try {
          // 查询发出的转账
          const sentFilter = contract.filters.Transfer(account, null);
          const sentLogs = await contract.queryFilter(
            sentFilter,
            fromBlock,
            currentBlock
          );

          // 查询收到的转账
          const receivedFilter = contract.filters.Transfer(null, account);
          const receivedLogs = await contract.queryFilter(
            receivedFilter,
            fromBlock,
            currentBlock
          );

          // 合并并处理所有日志
          const allLogs = [...sentLogs, ...receivedLogs];

          for (const log of allLogs) {
            // 类型转换为EventLog以访问args属性
            if (!("args" in log) || !log.args) continue;

            const block = await provider.getBlock(log.blockNumber);
            const args = log.args as readonly [string, string, bigint];
            const amount = ethers.formatUnits(
              args[2] || 0n,
              tokenInfo.decimals
            );

            const record: USDTRecord = {
              hash: log.transactionHash,
              from: args[0] || "",
              to: args[1] || "",
              amount: amount,
              token: tokenSymbol,
              timestamp: block ? block.timestamp * 1000 : Date.now(),
              status: "confirmed",
            };

            // 避免重复记录
            if (
              !allRecords.find(
                (r) => r.hash === record.hash && r.token === record.token
              )
            ) {
              allRecords.push(record);
            }
          }
        } catch (tokenError) {
          console.warn(`查询 ${tokenSymbol} 转账记录失败:`, tokenError);
        }
      }

      // 按时间排序（最新的在前面）
      allRecords.sort((a, b) => b.timestamp - a.timestamp);
      setUsdtRecords(allRecords);
    } catch (error) {
      console.error("查询链上记录失败:", error);
      // 如果链上查询失败，回退到本地存储
      loadUSDTRecordsFromLocal();
    } finally {
      setIsLoadingRecords(false);
    }
  }, [provider, account, network.chainId, ERC20_ABI, TOKEN_INFO, loadUSDTRecordsFromLocal]);

  useEffect(() => {
    if (account && provider) {
      loadTokenRecordsFromChain();
    }
  }, [account, provider, network.chainId, loadTokenRecordsFromChain]);

  // 保存到本地存储（作为备份）
  const saveUSDTRecordsToLocal = (records: USDTRecord[]) => {
    const existingRecords = localStorage.getItem("datachain_usdt_records");
    const allRecords = existingRecords ? JSON.parse(existingRecords) : [];

    // 合并新记录和已有记录，避免重复
    for (const record of records) {
      if (
        !allRecords.find(
          (r: USDTRecord) => r.hash === record.hash && r.token === record.token
        )
      ) {
        allRecords.push(record);
      }
    }

    localStorage.setItem("datachain_usdt_records", JSON.stringify(allRecords));
  };

  const getTokenContract = (tokenSymbol: string = selectedToken) => {
    const tokenInfo = TOKEN_INFO[network.chainId]?.[tokenSymbol];
    if (!tokenInfo || !signer) return null;
    return new ethers.Contract(tokenInfo.address, ERC20_ABI, signer);
  };

  const getCurrentTokenInfo = () => {
    return TOKEN_INFO[network.chainId]?.[selectedToken];
  };

  // 检查代币余额
  const checkTokenBalance = useCallback(async () => {
    const tokenContract = getTokenContract();
    if (!tokenContract || !account) {
      setTokenBalance("0");
      return "0";
    }

    try {
      const balance = await tokenContract.balanceOf(account);
      const tokenInfo = getCurrentTokenInfo();
      const formattedBalance = ethers.formatUnits(
        balance,
        tokenInfo?.decimals || 18
      );
      setTokenBalance(formattedBalance);
      return formattedBalance;
    } catch (error) {
      console.error("查询代币余额失败:", error);
      setTokenBalance("0");
      return "0";
    }
  }, [
    account,
    selectedToken,
    provider,
    network.chainId,
    getCurrentTokenInfo,
    getTokenContract,
  ]);

  // 模拟ETH兑换功能
  // ETH兑换功能（暂不实现）
  // const swapETHToToken = async () => {
  //   showWarning('兑换功能开发中')
  //   await checkTokenBalance()
  // }

  // Approve功能
  const approveToken = async () => {
    if (!signer || !tokenAmount) {
      showError("请填写转账数量");
      return;
    }

    const tokenContract = getTokenContract();
    if (!tokenContract) {
      showError(`当前网络 ${network.name} 暂不支持${selectedToken}`);
      return;
    }

    try {
      setIsApproving(true);

      // 设置Approve进度步骤
      const progressSteps: TransactionStep[] = [
        {
          id: "validation",
          label: "验证Approve参数",
          status: "loading",
        },
        {
          id: "submit",
          label: "提交Approve交易",
          status: "pending",
        },
        {
          id: "confirm",
          label: "等待Approve确认",
          status: "pending",
        },
      ];

      showProgress(progressSteps);

      const tokenInfo = getCurrentTokenInfo();
      const amountInWei = ethers.parseUnits(
        tokenAmount,
        tokenInfo?.decimals || 18
      );

      // 验证完成
      updateStep("validation", { status: "success" });
      updateStep("submit", { status: "loading" });

      // 这里可以approve给一个智能合约或者自己
      const tx = await tokenContract.approve(account, amountInWei);

      // 提交成功，开始确认
      updateStep("submit", { status: "success", txHash: tx.hash });
      updateStep("confirm", { status: "loading", txHash: tx.hash });

      // 等待交易确认 - 进度条组件会自动处理waitForTransaction
      await tx.wait();

      // 确认成功
      updateStep("confirm", { status: "success" });
    } catch (error) {
      console.error("Approve失败:", error);

      // 更新当前步骤为错误状态
      const currentStep = steps.find((s) => s.status === "loading");
      if (currentStep) {
        const errorMsg = error instanceof Error ? error.message : "未知错误";
        updateStep(currentStep.id, { status: "error", error: errorMsg });
      }
    } finally {
      setIsApproving(false);
    }
  };

  const transferToken = async () => {
    if (!signer || !toAddress || !tokenAmount) {
      showError("请填写完整信息");
      return;
    }

    if (!ethers.isAddress(toAddress)) {
      showError("请输入有效的以太坊地址");
      return;
    }

    const tokenContract = getTokenContract();
    if (!tokenContract) {
      showError(`当前网络 ${network.name} 暂不支持${selectedToken}转账`);
      return;
    }

    try {
      setIsLoading(true);

      // 设置转账进度步骤
      const progressSteps: TransactionStep[] = [
        {
          id: "validation",
          label: "验证转账参数",
          status: "loading",
        },
        {
          id: "submit",
          label: "提交转账交易",
          status: "pending",
        },
        {
          id: "confirm",
          label: "等待交易确认",
          status: "pending",
        },
        {
          id: "refresh",
          label: "刷新链上记录",
          status: "pending",
        },
      ];

      showProgress(progressSteps);

      const tokenInfo = getCurrentTokenInfo();
      const amountInWei = ethers.parseUnits(
        tokenAmount,
        tokenInfo?.decimals || 18
      );

      console.log(`${selectedToken}转账参数:`, {
        to: toAddress,
        amount: tokenAmount + ` ${selectedToken}`,
        amountInWei: amountInWei.toString(),
        network: network.name,
        contractAddress: tokenInfo?.address,
      });

      // 验证完成
      updateStep("validation", { status: "success" });
      updateStep("submit", { status: "loading" });

      const tx = await tokenContract.transfer(toAddress, amountInWei);
      console.log(`${selectedToken}转账已提交:`, tx.hash);

      // 提交成功，开始确认
      updateStep("submit", { status: "success", txHash: tx.hash });
      updateStep("confirm", { status: "loading", txHash: tx.hash });

      // 立即显示待确认的记录
      const pendingRecord: USDTRecord = {
        hash: tx.hash,
        from: account,
        to: toAddress,
        amount: tokenAmount,
        token: selectedToken,
        timestamp: Date.now(),
        status: "pending",
      };

      const updatedRecords = [pendingRecord, ...usdtRecords];
      setUsdtRecords(updatedRecords);
      saveUSDTRecordsToLocal([pendingRecord]);

      // 等待交易确认 - 进度条组件会自动处理waitForTransaction
      await tx.wait();
      console.log(`${selectedToken}转账已确认`);

      // 确认成功，开始刷新链上记录
      updateStep("confirm", { status: "success" });
      updateStep("refresh", { status: "loading" });

      // 交易确认后，重新从链上查询最新记录
      setTimeout(() => {
        loadTokenRecordsFromChain();
        // 完成所有步骤
        updateStep("refresh", { status: "success" });
      }, 2000); // 等待2秒让区块链同步

      setToAddress("");
      setTokenAmount("");
      setMessage("");

      await onBalanceUpdate();
      await checkTokenBalance();
    } catch (error) {
      console.error(`${selectedToken}转账失败:`, error);

      // 更新当前步骤为错误状态
      const currentStep = steps.find((s) => s.status === "loading");
      if (currentStep) {
        const errorMsg = error instanceof Error ? error.message : "未知错误";
        updateStep(currentStep.id, { status: "error", error: errorMsg });
      }

      // 更新失败状态
      const failedRecords = usdtRecords.map((record) =>
        record.status === "pending" && record.from === account
          ? { ...record, status: "failed" as const }
          : record
      );
      setUsdtRecords(failedRecords);

      let errorMsg = `${selectedToken}转账失败: `;
      if (error instanceof Error) {
        if (
          error.message.includes("insufficient funds") ||
          error.message.includes("transfer amount exceeds balance")
        ) {
          errorMsg = `${selectedToken}余额不足，请检查您的${selectedToken}余额`;
        } else if (error.message.includes("user rejected")) {
          errorMsg = "用户取消了交易";
        } else {
          errorMsg += error.message;
        }
      } else {
        errorMsg += "未知错误";
      }

      showError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始化时检查余额
  useEffect(() => {
    if (account && provider) {
      checkTokenBalance();
    }
  }, [account, provider, selectedToken, checkTokenBalance]);

  // 通过txHash查询代币交易详情
  const searchTokenTransactionByHash = async (txHash: string) => {
    if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
      showError("请输入有效的交易哈希（0x开头的66位字符串）");
      return;
    }

    if (!provider) {
      showError("请先连接钱包");
      return;
    }

    setIsSearchingTxHash(true);
    console.log("正在通过交易哈希查询代币交易详情:", txHash);

    try {
      // 检查是否已存在该交易记录
      const existingRecord = usdtRecords.find(
        (record) => record.hash.toLowerCase() === txHash.toLowerCase()
      );
      if (existingRecord) {
        showError("该代币交易记录已存在");
        setSearchTerm(txHash);
        setSearchInput(txHash);
        setIsSearchingTxHash(false);
        return;
      }

      // 获取交易详情
      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        showWarning(" 未找到该交易或交易尚未确认");
        setIsSearchingTxHash(false);
        return;
      }

      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        showWarning(" 交易尚未确认");
        setIsSearchingTxHash(false);
        return;
      }

      // 解析交易日志以确定是否为代币转账
      let tokenRecord: USDTRecord | null = null;

      // 遍历所有支持的代币合约
      for (const [tokenSymbol, tokenInfo] of Object.entries(
        TOKEN_INFO[network.chainId] || {}
      )) {
        if (tx.to?.toLowerCase() === tokenInfo.address.toLowerCase()) {
          // 这是一个代币合约交易
          const contract = new ethers.Contract(
            tokenInfo.address,
            ERC20_ABI,
            provider
          );

          // 解析Transfer事件日志
          const transferLogs = receipt.logs.filter((log) => {
            try {
              const parsedLog = contract.interface.parseLog({
                topics: log.topics as string[],
                data: log.data,
              });
              return parsedLog && parsedLog.name === "Transfer";
            } catch {
              return false;
            }
          });

          if (transferLogs.length > 0) {
            const transferLog = transferLogs[0];
            const parsedLog = contract.interface.parseLog({
              topics: transferLog.topics as string[],
              data: transferLog.data,
            });

            if (parsedLog) {
              const [from, to, amount] = parsedLog.args;
              const block = await provider.getBlock(receipt.blockNumber);

              tokenRecord = {
                hash: txHash,
                from: from,
                to: to,
                amount: ethers.formatUnits(amount, tokenInfo.decimals),
                token: tokenSymbol,
                timestamp: block ? block.timestamp * 1000 : Date.now(),
                status: receipt.status === 1 ? "confirmed" : "failed",
              };
              break;
            }
          }
        }
      }

      if (tokenRecord) {
        // 将新查询到的交易添加到记录列表的顶部
        const updatedRecords = [tokenRecord, ...usdtRecords];
        setUsdtRecords(updatedRecords);
        saveUSDTRecordsToLocal([tokenRecord]);

        // 设置搜索词以高亮显示新添加的交易
        setSearchTerm(txHash);
        setSearchInput(txHash);

        showSuccess(
          `成功查询到代币交易详情并添加到记录中！交易哈希: ${txHash.slice(
            0,
            10
          )}...${txHash.slice(-8)}`
        );

        console.log("代币交易详情已添加到记录:", tokenRecord);
      } else {
        showWarning(
          " 该交易不是支持的代币转账交易\n\n请确认：\n1. 交易是否为代币转账（而非ETH转账）\n2. 代币是否在当前网络的支持列表中\n3. 交易是否已确认"
        );
      }
    } catch (error) {
      console.error("查询代币交易失败:", error);
      showError(
        "❌ 查询代币交易失败\n\n" +
          (error instanceof Error ? error.message : "未知错误")
      );
    } finally {
      setIsSearchingTxHash(false);
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

  // 过滤代币记录
  const filteredUSDTRecords = usdtRecords.filter((record) => {
    if (!searchTerm) return true;
    return (
      safeIncludes(record.hash, searchTerm) ||
      safeIncludes(record.from, searchTerm) ||
      safeIncludes(record.to, searchTerm) ||
      safeIncludes(record.amount, searchTerm) ||
      safeIncludes(record.token, searchTerm)
    );
  });

  const supportedTokens = TOKEN_INFO[network.chainId] || {};
  const currentTokenInfo = getCurrentTokenInfo();
  const hasBalance = parseFloat(tokenBalance) > 0;

  return (
    <div className="unified-layout">
      {/* 转账表单区域 */}
      <div className="transfer-section">
        <h2>代币转账</h2>

        {currentTokenInfo ? (
          <>
            <div
              style={{
                background: "rgba(102, 126, 234, 0.1)",
                border: "1px solid rgba(102, 126, 234, 0.2)",
                borderRadius: "8px",
                padding: "15px",
                marginBottom: "20px",
              }}
            >
              <p>
                <strong>合约地址:</strong> {currentTokenInfo.address}
              </p>
              <p>
                <strong>支持代币:</strong>{" "}
                {Object.keys(supportedTokens).join(", ")}
              </p>
            </div>

            <div className="form-row">
              <input
                type="text"
                className="form-input"
                placeholder="转账地址 (0x...)"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
              />
            </div>

            <div className="form-row">
              <input
                type="text"
                className="form-input"
                placeholder="转账金额"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
              />
            </div>

            <div className="form-row">
              <label
                style={{
                  display: "block",
                  marginBottom: "10px",
                  color: "#4a5568",
                  fontSize: "14px",
                  fontWeight: "600",
                }}
              >
                选择代币:
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginBottom: "15px",
                }}
              >
                {Object.keys(supportedTokens).map((tokenSymbol) => (
                  <button
                    key={tokenSymbol}
                    className={
                      selectedToken === tokenSymbol
                        ? "submit-btn"
                        : "form-input"
                    }
                    style={{
                      padding: "10px 16px",
                      minWidth: "80px",
                      cursor: "pointer",
                      background:
                        selectedToken === tokenSymbol
                          ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                          : "rgba(255, 255, 255, 0.8)",
                      color:
                        selectedToken === tokenSymbol ? "white" : "#4a5568",
                      border:
                        selectedToken === tokenSymbol
                          ? "none"
                          : "2px solid rgba(102, 126, 234, 0.2)",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "500",
                      transition: "all 0.3s ease",
                    }}
                    onClick={() => setSelectedToken(tokenSymbol)}
                  >
                    {tokenSymbol}
                  </button>
                ))}
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  background: hasBalance
                    ? "rgba(72, 187, 120, 0.1)"
                    : "rgba(245, 101, 101, 0.1)",
                  color: hasBalance ? "#48bb78" : "#f56565",
                  border: hasBalance
                    ? "1px solid rgba(72, 187, 120, 0.2)"
                    : "1px solid rgba(245, 101, 101, 0.2)",
                }}
              >
                余额: {tokenBalance} {selectedToken}
                {!hasBalance && (
                  <button
                    style={{
                      marginLeft: "12px",
                      padding: "4px 12px",
                      background:
                        "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      showWarning(
                        "兑换功能开发中\n\n请通过其他方式获取 " +
                          selectedToken +
                          " 代币"
                      )
                    }
                  >
                    兑换
                  </button>
                )}
              </div>
            </div>

            <div className="form-row">
              <textarea
                className="form-textarea"
                placeholder="转账信息文本框"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                className="submit-btn"
                style={{
                  flex: "1",
                  background:
                    isApproving || !account || !tokenAmount
                      ? "linear-gradient(135deg, #cbd5e0 0%, #a0aec0 100%)"
                      : "linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)",
                }}
                onClick={approveToken}
                disabled={isApproving || !account || !tokenAmount}
              >
                {isApproving ? "Approve中..." : "Approve"}
              </button>
              <button
                className="submit-btn"
                style={{ flex: "2" }}
                onClick={transferToken}
                disabled={isLoading || !account || !toAddress || !tokenAmount}
              >
                {isLoading ? "发起交易中..." : "发起交易"}
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              color: "#f56565",
              fontWeight: "600",
              padding: "12px 16px",
              background: "rgba(245, 101, 101, 0.1)",
              border: "1px solid rgba(245, 101, 101, 0.2)",
              borderRadius: "8px",
            }}
          >
            ⚠️ 当前网络 {network.name} 暂不支持代币转账
          </div>
        )}
      </div>

      {/* 记录查询区域 */}
      <div className="records-section">
        <h2>代币交易记录</h2>

        <div className="search-box">
          <div className="search-input-group">
            <input
              type="text"
              className="search-input"
              placeholder="输入交易哈希(0x...)查询或关键词过滤记录"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (
                    searchInput.startsWith("0x") &&
                    searchInput.length === 66
                  ) {
                    searchTokenTransactionByHash(searchInput);
                  } else {
                    setSearchTerm(searchInput);
                  }
                }
              }}
              disabled={isSearchingTxHash}
            />
            <button
              className="search-btn"
              onClick={() => {
                if (searchInput.startsWith("0x") && searchInput.length === 66) {
                  searchTokenTransactionByHash(searchInput);
                } else {
                  setSearchTerm(searchInput);
                }
              }}
              disabled={isSearchingTxHash}
            >
              {isSearchingTxHash
                ? "🔄"
                : searchInput.startsWith("0x") && searchInput.length === 66
                ? "🔗"
                : "🔍"}
            </button>
            {(searchTerm || isSearchingTxHash) && (
              <button
                className="clear-search-btn"
                onClick={() => {
                  setSearchTerm("");
                  setSearchInput("");
                }}
                disabled={isSearchingTxHash}
              >
                ✕
              </button>
            )}
          </div>

          {isSearchingTxHash && (
            <div
              style={{
                padding: "10px",
                background: "rgba(255, 152, 0, 0.1)",
                borderRadius: "8px",
                marginBottom: "10px",
              }}
            >
              🔄 正在查询代币交易详情，请稍候...
            </div>
          )}

          {searchTerm && !isSearchingTxHash && (
            <div
              style={{
                padding: "10px",
                background: "rgba(72, 187, 120, 0.1)",
                borderRadius: "8px",
                marginBottom: "10px",
              }}
            >
              正在搜索: <strong>{searchTerm}</strong> - 找到{" "}
              {filteredUSDTRecords.length} 条代币记录
            </div>
          )}
        </div>

        <div className="records-list">
          {isLoadingRecords ? (
            <div className="empty-state">
              <p>🔄 正在从链上查询交易记录...</p>
              <p>请稍候，这可能需要几秒钟时间</p>
            </div>
          ) : filteredUSDTRecords.length === 0 ? (
            <div className="empty-state">
              {usdtRecords.length === 0 ? (
                <>
                  <p>暂无链上交易记录</p>
                  <p>完成代币转账后，记录将自动从区块链上获取</p>
                </>
              ) : (
                <>
                  <p>未找到匹配的记录</p>
                  <p>请尝试其他搜索关键词</p>
                </>
              )}
            </div>
          ) : (
            filteredUSDTRecords.map((record, index) => (
              <div key={index} className="record-item">
                <div className="record-header">
                  <div>
                    <div
                      style={{
                        fontSize: "10px",
                        color:
                          record.status === "confirmed"
                            ? "#48bb78"
                            : record.status === "failed"
                            ? "#f56565"
                            : "#ed8936",
                        background:
                          record.status === "confirmed"
                            ? "rgba(72, 187, 120, 0.1)"
                            : record.status === "failed"
                            ? "rgba(245, 101, 101, 0.1)"
                            : "rgba(237, 137, 54, 0.1)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        marginBottom: "5px",
                      }}
                    >
                      {record.status === "confirmed"
                        ? "✅ 已确认"
                        : record.status === "failed"
                        ? "❌ 失败"
                        : "🔄 待确认"}
                    </div>
                    <div className="tx-hash">{record.hash}</div>
                  </div>
                  <div className="timestamp">
                    {new Date(record.timestamp).toLocaleString()}
                  </div>
                </div>

                <div className="record-details">
                  <p>
                    <strong>From:</strong> {record.from}
                  </p>
                  <p>
                    <strong>To:</strong> {record.to}
                  </p>
                  <p>
                    <strong>Amount:</strong> {record.amount} {record.token}
                  </p>
                  <p>
                    <strong>Token:</strong> {record.token}
                  </p>
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
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}

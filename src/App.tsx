import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import "./App.css";
import InfoContractABI from "../InfoContract.json";
import { NativeTransfer } from "./components/NativeTransfer";
import { ContractCall } from "./components/ContractCall";
import { USDTTransfer } from "./components/USDTTransfer";
import { useNotification } from "./components/NotificationProvider";

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  data: string;
  timestamp: number;
  source?: "blockchain" | "local";
}

interface Network {
  name: string;
  chainId: string;
  rpcUrl: string;
  symbol: string;
  decimals: number;
}

interface WalletAccount {
  address: string;
  balance?: string;
}

function App() {
  const { showError } = useNotification();
  const [account, setAccount] = useState<string>("");
  const [allAccounts, setAllAccounts] = useState<WalletAccount[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [showWalletDropdown, setShowWalletDropdown] = useState<boolean>(false);
  const [network, setNetwork] = useState<Network>({
    name: "Ethereum",
    chainId: "0x1",
    rpcUrl: "",
    symbol: "ETH",
    decimals: 18,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<string>("0");
  const [contractAddress] = useState<string>(
    import.meta.env.VITE_CONTRACT_ADDRESS || "0x843F2a4Dce76F8adC235f4D8B1775338f8318CA7"
  );
  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);

  const networks = useMemo(() => [
    {
      name: "Ethereum",
      chainId: "0x1",
      rpcUrl: import.meta.env.VITE_ETHEREUM_RPC || "https://mainnet.infura.io/v3/YOUR_KEY",
      symbol: "ETH",
      decimals: 18,
    },
    {
      name: "Sepolia",
      chainId: "0xaa36a7",
      rpcUrl: import.meta.env.VITE_SEPOLIA_RPC || "https://sepolia.infura.io/v3/YOUR_KEY",
      symbol: "ETH",
      decimals: 18,
    },
    {
      name: "Goerli",
      chainId: "0x5",
      rpcUrl: import.meta.env.VITE_GOERLI_RPC || "https://goerli.infura.io/v3/YOUR_KEY",
      symbol: "ETH",
      decimals: 18,
    },
    {
      name: "Polygon",
      chainId: "0x89",
      rpcUrl: import.meta.env.VITE_POLYGON_RPC || "https://polygon-rpc.com/",
      symbol: "MATIC",
      decimals: 18,
    },
    {
      name: "BSC",
      chainId: "0x38",
      rpcUrl: import.meta.env.VITE_BSC_RPC || "https://bsc-dataseed1.binance.org/",
      symbol: "BNB",
      decimals: 18,
    },
    {
      name: "Arbitrum",
      chainId: "0xa4b1",
      rpcUrl: import.meta.env.VITE_ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc",
      symbol: "ETH",
      decimals: 18,
    },
    {
      name: "Optimism",
      chainId: "0xa",
      rpcUrl: import.meta.env.VITE_OPTIMISM_RPC || "https://mainnet.optimism.io",
      symbol: "ETH",
      decimals: 18,
    },
    {
      name: "Avalanche",
      chainId: "0xa86a",
      rpcUrl: import.meta.env.VITE_AVALANCHE_RPC || "https://api.avax.network/ext/bc/C/rpc",
      symbol: "AVAX",
      decimals: 18,
    },
  ], []);

  const updateBalance = useCallback(async () => {
    if (!provider || !account) return;

    try {
      const balance = await provider.getBalance(account);
      setBalance(ethers.formatEther(balance));
    } catch (error) {
      console.error("获取余额失败:", error);
    }
  }, [provider, account]);

  const getAllAccountsAndBalances = useCallback(async () => {
    if (!provider || !window.ethereum) return;

    try {
      // 首先尝试获取所有可用账户（这通常只返回当前连接的账户）
      const connectedAccounts = await window.ethereum.request({
        method: 'eth_accounts'
      }) as string[];
      
      if (!connectedAccounts || connectedAccounts.length === 0) {
        setAllAccounts([]);
        return;
      }

      // 对于每个连接的账户，获取余额
      const accountsWithBalances: WalletAccount[] = await Promise.all(
        connectedAccounts.map(async (address) => {
          try {
            const balance = await provider.getBalance(address);
            return {
              address,
              balance: ethers.formatEther(balance)
            };
          } catch (error) {
            console.error(`获取账户 ${address} 余额失败:`, error);
            return {
              address,
              balance: "0"
            };
          }
        })
      );
      
      console.log("获取到的所有账户:", accountsWithBalances);
      setAllAccounts(accountsWithBalances);

      // 如果当前account不在列表中，更新为第一个账户
      if (connectedAccounts.length > 0 && !connectedAccounts.includes(account)) {
        setAccount(connectedAccounts[0]);
      }
    } catch (error) {
      console.error("获取账户列表失败:", error);
      setAllAccounts([]);
    }
  }, [provider, account]);

  const checkWalletConnection = useCallback(async () => {
    try {
      if (typeof window.ethereum !== "undefined") {
        const newProvider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await window.ethereum.request({
          method: 'eth_accounts'
        }) as string[];
        
        if (accounts && accounts.length > 0) {
          const newSigner = await newProvider.getSigner();
          setProvider(newProvider);
          setSigner(newSigner);
          setAccount(accounts[0]);

          const networkInfo = await newProvider.getNetwork();
          console.log("检测到已连接钱包，当前网络信息:", {
            chainId: networkInfo.chainId.toString(),
            chainIdHex: `0x${networkInfo.chainId.toString(16)}`,
            name: networkInfo.name,
          });

          const currentNetwork = networks.find(
            (net) => net.chainId === `0x${networkInfo.chainId.toString(16)}`
          ) || {
            name: `Chain ${networkInfo.chainId}`,
            chainId: `0x${networkInfo.chainId.toString(16)}`,
            rpcUrl: "",
            symbol: "ETH",
            decimals: 18,
          };

          console.log("自动匹配的网络配置:", currentNetwork);
          setNetwork(currentNetwork);

          // 获取所有账户将通过useEffect自动触发
        }
      }
    } catch (error) {
      console.error("检查钱包连接状态失败:", error);
    }
  }, [networks]);

  const loadTransactions = () => {
    const saved = localStorage.getItem("datachain_transactions");
    if (saved) {
      setTransactions(JSON.parse(saved));
    }
  };

  useEffect(() => {
    loadTransactions();
    checkWalletConnection();
  }, [checkWalletConnection]);

  useEffect(() => {
    if (provider && account) {
      updateBalance();
    }
  }, [provider, account, network, updateBalance]);

  // 单独的effect来处理账户列表更新，避免无限循环
  useEffect(() => {
    if (provider) {
      getAllAccountsAndBalances();
    }
  }, [provider, network, getAllAccountsAndBalances]);

  useEffect(() => {
    if (typeof window.ethereum !== "undefined") {
      const handleAccountsChanged = (accounts: string[]) => {
        console.log("账户变化事件:", accounts);
        if (accounts.length === 0) {
          setProvider(null);
          setSigner(null);
          setAccount("");
          setAllAccounts([]);
          setBalance("0");
          setShowWalletDropdown(false);
        } else {
          // 重新检查连接状态并更新账户列表
          checkWalletConnection();
        }
      };

      const handleChainChanged = () => {
        checkWalletConnection();
      };

      window.ethereum!.on("accountsChanged", handleAccountsChanged);
      window.ethereum!.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum!.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum!.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, [checkWalletConnection]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showWalletDropdown && !(event.target as Element).closest('.wallet-container')) {
        setShowWalletDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showWalletDropdown]);

  const connectWallet = async () => {
    try {
      if (typeof window.ethereum !== "undefined") {
        const newProvider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await newProvider.send("eth_requestAccounts", []);
        const newSigner = await newProvider.getSigner();

        setProvider(newProvider);
        setSigner(newSigner);
        setAccount(accounts[0]);

        const networkInfo = await newProvider.getNetwork();
        console.log("当前网络信息:", {
          chainId: networkInfo.chainId.toString(),
          chainIdHex: `0x${networkInfo.chainId.toString(16)}`,
          name: networkInfo.name,
        });

        const currentNetwork = networks.find(
          (net) => net.chainId === `0x${networkInfo.chainId.toString(16)}`
        ) || {
          name: `Chain ${networkInfo.chainId}`,
          chainId: `0x${networkInfo.chainId.toString(16)}`,
          rpcUrl: "",
          symbol: "ETH",
          decimals: 18,
        };

        console.log("匹配到的网络配置:", currentNetwork);
        setNetwork(currentNetwork);

        // 获取所有账户将通过useEffect自动触发
      } else {
        showError("请安装 MetaMask!");
      }
    } catch (error) {
      console.error("连接钱包失败:", error);
    }
  };

  const switchNetwork = async (targetNetwork: Network) => {
    try {
      if (provider && window.ethereum) {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetNetwork.chainId }],
        });
        setNetwork(targetNetwork);
      }
    } catch (error) {
      console.error("切换网络失败:", error);
    }
  };

  const switchAccount = async (targetAddress: string) => {
    try {
      if (provider && targetAddress !== account) {
        // 直接切换到目标账户
        const newSigner = await provider.getSigner(targetAddress);
        setSigner(newSigner);
        setAccount(targetAddress);
        setShowWalletDropdown(false);
        
        // 更新余额
        const balance = await provider.getBalance(targetAddress);
        setBalance(ethers.formatEther(balance));
      }
    } catch (error) {
      console.error("切换账户失败:", error);
      showError("切换账户失败，请重试");
    }
  };

  // 添加请求新账户连接的功能
  const requestNewAccount = async () => {
    try {
      if (window.ethereum) {
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }]
        });
        setShowWalletDropdown(false);
        // 重新获取账户列表
        await checkWalletConnection();
      }
    } catch (error) {
      console.error("请求新账户失败:", error);
      showError("请求新账户失败，请重试");
    }
  };

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setAccount("");
    setAllAccounts([]);
    setBalance("0");
    setShowWalletDropdown(false);
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>数据上链系统</h1>
        <div className="header-controls">
          <select 
            className="network-select"
            value={network.name}
            onChange={(e) => {
              const selected = networks.find((n) => n.name === e.target.value);
              if (selected) switchNetwork(selected);
            }}
          >
            {networks.map((net) => (
              <option key={net.chainId} value={net.name}>
                {net.name}
              </option>
            ))}
          </select>

          {account ? (
            <div className="wallet-container">
              <div 
                className="wallet-info" 
                onClick={() => setShowWalletDropdown(!showWalletDropdown)}
              >
                <div className="avatar">
                  {account.slice(2, 4).toUpperCase()}
                </div>
                <div className="wallet-details">
                  <div className="address">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </div>
                  <div className="balance">
                    {parseFloat(balance).toFixed(4)} {network.symbol}
                  </div>
                </div>
                <div className="dropdown-arrow">
                  {showWalletDropdown ? '▲' : '▼'}
                </div>
              </div>
              
              {showWalletDropdown && (
                <div className="wallet-dropdown">
                  <div className="dropdown-header">
                    选择账户
                  </div>
                  {allAccounts.length === 0 ? (
                    <div className="dropdown-item">
                      <span style={{ color: '#718096' }}>正在加载账户...</span>
                    </div>
                  ) : (
                    allAccounts.map((walletAccount) => (
                    <div
                      key={walletAccount.address}
                      className={`account-item ${walletAccount.address === account ? 'active' : ''}`}
                      onClick={() => switchAccount(walletAccount.address)}
                    >
                      <div className="account-info">
                        <div className="account-avatar">
                          {walletAccount.address.slice(2, 4).toUpperCase()}
                        </div>
                        <div className="account-details">
                          <div className="account-address">
                            {walletAccount.address.slice(0, 6)}...{walletAccount.address.slice(-4)}
                          </div>
                          <div className="account-balance">
                            {parseFloat(walletAccount.balance || "0").toFixed(4)} {network.symbol}
                          </div>
                        </div>
                      </div>
                      {walletAccount.address === account && (
                        <div className="current-indicator">✓</div>
                      )}
                    </div>
                    ))
                  )}
                  {allAccounts.length > 0 && (
                    <>
                      <div className="dropdown-separator"></div>
                      <div className="dropdown-item connect-other" onClick={requestNewAccount}>
                        连接其他账户
                      </div>
                    </>
                  )}
                  <div className="dropdown-separator"></div>
                  <div className="dropdown-item disconnect" onClick={disconnectWallet}>
                    退出钱包
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button className="connect-btn" onClick={connectWallet}>
              连接钱包
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="main">
        <div className="transaction-form">
          <div className="form-tabs">
            <button 
              className={`tab ${activeTab === 0 ? 'active' : ''}`}
              onClick={() => setActiveTab(0)}
            >
              原生转账
            </button>
            <button 
              className={`tab ${activeTab === 1 ? 'active' : ''}`}
              onClick={() => setActiveTab(1)}
            >
              合约调用
            </button>
            <button 
              className={`tab ${activeTab === 2 ? 'active' : ''}`}
              onClick={() => setActiveTab(2)}
            >
              代币转账
            </button>
          </div>
          
          <div className="form-content">
            {activeTab === 0 && (
              <NativeTransfer
                account={account}
                provider={provider}
                signer={signer}
                network={network}
                transactions={transactions}
                onTransactionUpdate={setTransactions}
                onBalanceUpdate={updateBalance}
              />
            )}
            {activeTab === 1 && (
              <ContractCall
                account={account}
                provider={provider}
                signer={signer}
                contractAddress={contractAddress}
                contractABI={InfoContractABI.abi}
              />
            )}
            {activeTab === 2 && (
              <USDTTransfer
                account={account}
                provider={provider}
                signer={signer}
                network={network}
                onBalanceUpdate={updateBalance}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
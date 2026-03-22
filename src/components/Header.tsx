'use client'

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Menu, Coins, Leaf, Search, Bell, User, ChevronDown, LogIn } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, IProvider, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { createUser, getUnreadNotifications, markNotificationAsRead, getUserByEmail, getUserBalance } from "@/utils/db/actions";

interface Notification {
  id: number;
  type: string;
  message: string;
}

const clientId = "BIlpsS9agL9imE-04biot32zXDf8P0gAeTzpXVr8iYFUhA-0NMI5ZyBgGUSufAxmJeukxet1JLrQznjjVzYhdTg";

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0xaa36a7",
  rpcTarget: "https://eth-sepolia.g.alchemy.com/v2/Oc_ddJVUHkmB4wt6vK79k",
  displayName: "Ethereum Sepolia Testnet",
  blockExplorerUrl: "https://sepolia.etherscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
};

interface HeaderProps {
  onMenuClick: () => void;
  totalEarnings: number;
}

export default function Header({ onMenuClick, totalEarnings }: HeaderProps) {
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [provider, setProvider] = useState<IProvider | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [balance, setBalance] = useState(0);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const initializingRef = useRef(false); // ✅ Prevents double-init in React Strict Mode

  const handleSuccessfulLogin = async (authInstance: Web3Auth) => {
    const user = await authInstance.getUserInfo();
    setUserInfo(user);
    setLoggedIn(true);

    if (user.email) {
      localStorage.setItem('userEmail', user.email);
      try {
        await createUser(user.email, user.name || 'Anonymous User');
      } catch (error) {
        console.error("Error creating user (it might already exist):", error);
      }
    }
  };

  useEffect(() => {
    const initAuth = async () => {
  if (initializingRef.current) return;
  initializingRef.current = true;

  try {
    const privateKeyProvider = new EthereumPrivateKeyProvider({
      config: { chainConfig },
    });

    const auth = new Web3Auth({
      clientId,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
      privateKeyProvider,
    });

    await auth.initModal(); // ✅ Back to initModal() for modal@9.7.0

    setWeb3auth(auth);
    setProvider(auth.provider);

    if (auth.connected) {
      await handleSuccessfulLogin(auth);
    }
  } catch (error) {
    console.error("Error initializing Web3Auth:", error);
  } finally {
    setLoading(false);
  }
};

    initAuth();
  }, []);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (userInfo && userInfo.email) {
        const user = await getUserByEmail(userInfo.email);
        if (user) {
          const unreadNotifications = await getUnreadNotifications(user.id);
          setNotifications(unreadNotifications);
        }
      }
    };

    if (loggedIn) {
      fetchNotifications();
      const notificationInterval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(notificationInterval);
    }
  }, [userInfo, loggedIn]);

  useEffect(() => {
    const fetchUserBalance = async () => {
      if (userInfo && userInfo.email) {
        const user = await getUserByEmail(userInfo.email);
        if (user) {
          const userBalance = await getUserBalance(user.id);
          setBalance(userBalance);
        }
      }
    };

    const handleBalanceUpdate = async () => {
      if (userInfo && userInfo.email) {
        const user = await getUserByEmail(userInfo.email);
        if (user) {
          const userBalance = await getUserBalance(user.id);
          setBalance(userBalance);
        }
      }
    };

    if (loggedIn) {
      fetchUserBalance();
      window.addEventListener('balanceUpdated', handleBalanceUpdate);
      return () => {
        window.removeEventListener('balanceUpdated', handleBalanceUpdate);
      };
    }

  }, [userInfo, loggedIn]);

  const login = async () => {
    if (!web3auth) {
      console.log("web3auth not initialized yet");
      return;
    }
    try {
      const web3authProvider = await web3auth.connect();
      setProvider(web3authProvider);
      await handleSuccessfulLogin(web3auth);
    } catch (error) {
      console.error("Error during login:", error);
    }
  };

  const logout = async () => {
    if (!web3auth) {
      console.log("web3auth not initialized yet");
      return;
    }
    try {
      await web3auth.logout();
      setProvider(null);
      setLoggedIn(false);
      setUserInfo(null);
      localStorage.removeItem('userEmail');

      // ✅ Safe to clear Web3Auth session only AFTER logout
      Object.keys(localStorage)
        .filter(key => key.startsWith('Web3Auth') || key.startsWith('openlogin'))
        .forEach(key => localStorage.removeItem(key));

    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  const handleNotificationClick = async (notificationId: number) => {
    await markNotificationAsRead(notificationId);
    setNotifications(prevNotifications =>
      prevNotifications.filter(notification => notification.id !== notificationId)
    );
  };

  if (loading && !loggedIn) {
    return (
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 flex items-center justify-center h-14">
        <span className="text-sm text-gray-500">Initializing...</span>
      </div>
    );
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="mr-2 md:mr-4" onClick={onMenuClick}>
            <Menu className="h-6 w-6" />
          </Button>
          <Link href="/" className="flex items-center">
            <Leaf className="h-6 w-6 md:h-8 md:w-8 text-green-500 mr-1 md:mr-2" />
            <div className="flex flex-col">
              <span className="font-bold text-base md:text-lg text-gray-800">Zero2Hero</span>
              <span className="text-[8px] md:text-[10px] text-gray-500 -mt-1">ETHOnline24</span>
            </div>
          </Link>
        </div>

        {!isMobile && (
          <div className="flex-1 max-w-xl mx-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                className="w-full px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        )}

        <div className="flex items-center">
          {isMobile && (
            <Button variant="ghost" size="icon" className="mr-2">
              <Search className="h-5 w-5" />
            </Button>
          )}

          {loggedIn && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="mr-2 relative">
                    <Bell className="h-5 w-5" />
                    {notifications.length > 0 && (
                      <Badge className="absolute -top-1 -right-1 px-1 min-w-[1.2rem] h-5">
                        {notifications.length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <DropdownMenuItem
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification.id)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{notification.type}</span>
                          <span className="text-sm text-gray-500">{notification.message}</span>
                        </div>
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem>No new notifications</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="mr-2 md:mr-4 flex items-center bg-gray-100 rounded-full px-2 md:px-3 py-1">
                <Coins className="h-4 w-4 md:h-5 md:w-5 mr-1 text-green-500" />
                <span className="font-semibold text-sm md:text-base text-gray-800">
                  {balance.toFixed(2)}
                </span>
              </div>
            </>
          )}

          {!loggedIn ? (
            <Button
              onClick={login}
              disabled={loading || !web3auth} // ✅ Disabled until web3auth is fully ready
              className="bg-green-600 hover:bg-green-700 text-white text-sm md:text-base"
            >
              Login
              <LogIn className="ml-1 md:ml-2 h-4 w-4 md:h-5 md:w-5" />
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center p-2 rounded-full">
                  <User className="h-5 w-5" />
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  {userInfo ? userInfo.name : "User"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
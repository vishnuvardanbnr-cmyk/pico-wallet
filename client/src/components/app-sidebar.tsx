import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  Layers, 
  Settings, 
  Shield,
  Lock,
  Unlock,
  BookOpen,
  Coins,
  Link2,
  Cpu,
  Laptop,
  Smartphone,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet-context";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Send / Receive",
    url: "/transfer",
    icon: ArrowLeftRight,
  },
  {
    title: "Chains & Tokens",
    url: "/chains",
    icon: Layers,
    softWalletOnly: true,
  },
  {
    title: "Manage Crypto",
    url: "/manage-crypto",
    icon: Coins,
  },
  {
    title: "DApps",
    url: "/dapps",
    icon: Link2,
    softWalletOnly: true,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
  {
    title: "Setup Guide",
    url: "/setup",
    icon: BookOpen,
  },
  {
    title: "Mobile Bridge",
    url: "/bridge",
    icon: Smartphone,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { isConnected, isUnlocked, hardwareState, wallets, setShowPinModal, setPinAction, lockWallet, walletMode, setWalletMode, currentModeHasWallet, isAnyWalletGroupUnlocked } = useWallet();
  const hasWallet = currentModeHasWallet;
  
  // For soft wallet: show locked if no wallet groups are currently unlocked
  // This indicates PIN is required for wallet access even though session is active
  const showAsLocked = walletMode === "soft_wallet" && isUnlocked && !isAnyWalletGroupUnlocked();

  const handleUnlock = () => {
    if (!hasWallet) {
      setPinAction("setup");
    } else {
      setPinAction("unlock");
    }
    setShowPinModal(true);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold">VaultKey</span>
            <span className="text-xs text-muted-foreground">Crypto Wallet</span>
          </div>
        </div>

        {/* Wallet Mode Toggle */}
        <div className="mt-3 flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setWalletMode("hard_wallet")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium transition-colors ${
              walletMode === "hard_wallet" 
                ? "bg-primary text-primary-foreground" 
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
            data-testid="button-mode-hard-wallet"
          >
            <Cpu className="h-3.5 w-3.5" />
            Hard Wallet
          </button>
          <button
            onClick={() => setWalletMode("soft_wallet")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium transition-colors ${
              walletMode === "soft_wallet" 
                ? "bg-primary text-primary-foreground" 
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
            data-testid="button-mode-soft-wallet"
          >
            <Laptop className="h-3.5 w-3.5" />
            Soft Wallet
          </button>
        </div>

        {/* Status Display - Only show device status for hard wallet mode */}
        <div className="mt-3 flex items-center justify-between rounded-lg bg-sidebar-accent/50 p-3">
          <div className="flex items-center gap-2">
            {walletMode === "soft_wallet" ? (
              hasWallet ? (
                isUnlocked ? (
                  <>
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-medium">Active</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Locked</span>
                  </>
                )
              ) : (
                <>
                  <Laptop className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Not Set Up</span>
                </>
              )
            ) : (
              hasWallet ? (
                isUnlocked ? (
                  <>
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Locked</span>
                  </>
                )
              ) : (
                <>
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span className="text-sm text-muted-foreground">No Device</span>
                </>
              )
            )}
          </div>
          {hasWallet && !isUnlocked && (
            <Button size="sm" variant="ghost" onClick={handleUnlock} data-testid="button-sidebar-unlock">
              <Unlock className="h-4 w-4" />
            </Button>
          )}
          {hasWallet && isUnlocked && (
            <Button size="sm" variant="ghost" onClick={lockWallet} data-testid="button-sidebar-lock">
              {/* Show locked icon if no wallet groups are unlocked (PIN required for access) */}
              {showAsLocked ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems
                .filter((item) => {
                  // Hide soft wallet only items in hard wallet mode
                  if (item.softWalletOnly && walletMode === "hard_wallet") return false;
                  return true;
                })
                .map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url));
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      className={isActive ? "bg-sidebar-accent" : ""}
                    >
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          <span>Secured by hardware encryption</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

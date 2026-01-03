import { useState } from "react";
import { useLocation, Link } from "wouter";
import { 
  Wallet, 
  Shield,
  LayoutDashboard, 
  Settings, 
  Coins,
  Link2,
  Layers,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/lib/wallet-context";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

export function MobileFooter() {
  const [location] = useLocation();
  const { walletMode, setWalletMode } = useWallet();

  const softWalletNavItems: NavItem[] = [
    { label: "Chains", href: "/", icon: <Layers className="h-5 w-5" /> },
    { label: "DApps", href: "/dapps", icon: <Link2 className="h-5 w-5" /> },
    { label: "Settings", href: "/settings", icon: <Settings className="h-5 w-5" /> },
  ];

  const hardWalletNavItems: NavItem[] = [
    { label: "Dashboard", href: "/", icon: <LayoutDashboard className="h-5 w-5" /> },
    { label: "Accounts", href: "/chains", icon: <Users className="h-5 w-5" /> },
    { label: "Settings", href: "/settings", icon: <Settings className="h-5 w-5" /> },
    { label: "Manage", href: "/manage-crypto", icon: <Coins className="h-5 w-5" /> },
  ];

  const navItems = walletMode === "soft_wallet" ? softWalletNavItems : hardWalletNavItems;

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  const isDAppsPage = location.startsWith("/dapps") || location.startsWith("/dapp-browser");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      {!isDAppsPage && (
        <div className="flex items-center justify-center gap-2 border-b border-border/50 px-4 py-2">
          <Button
            variant={walletMode === "hard_wallet" ? "default" : "outline"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setWalletMode("hard_wallet")}
            data-testid="button-hard-wallet-mode"
          >
            <Shield className="h-4 w-4" />
            Hard Wallet
          </Button>
          <Button
            variant={walletMode === "soft_wallet" ? "default" : "outline"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setWalletMode("soft_wallet")}
            data-testid="button-soft-wallet-mode"
          >
            <Wallet className="h-4 w-4" />
            Soft Wallet
          </Button>
        </div>
      )}

      <nav className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-4 py-2 text-xs transition-colors",
              isActive(item.href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover-elevate"
            )}
            data-testid={`nav-${item.label.toLowerCase()}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

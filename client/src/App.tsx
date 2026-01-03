import { Switch, Route, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Shield } from "lucide-react";
import { ThemeProvider } from "@/lib/theme-context";
import { WalletProvider } from "@/lib/wallet-context";
import { AppSidebar } from "@/components/app-sidebar";
import { HardwareStatus } from "@/components/hardware-status";
import { PinModal } from "@/components/pin-modal";
import { MobileFooter } from "@/components/mobile-footer";

import Dashboard from "@/pages/dashboard";
import Transfer from "@/pages/transfer";
import Chains from "@/pages/chains";
import Settings from "@/pages/settings";
import SetupGuide from "@/pages/setup-guide";
import ManageCrypto from "@/pages/manage-crypto";
import DApps from "@/pages/dapps";
import DAppBrowser from "@/pages/dapp-browser";
import TokenDetail from "@/pages/token-detail";
import TransactionDetail from "@/pages/transaction-detail";
import Bridge from "@/pages/bridge";
import NotFound from "@/pages/not-found";

function ScrollToTop() {
  const [location] = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  
  useEffect(() => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo(0, 0);
    }
    window.scrollTo(0, 0);
  }, [location]);
  
  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/wallet/:chainId/token/:tokenId" component={TokenDetail} />
        <Route path="/transaction" component={TransactionDetail} />
        <Route path="/transfer" component={Transfer} />
        <Route path="/chains" component={Chains} />
        <Route path="/settings" component={Settings} />
        <Route path="/setup" component={SetupGuide} />
        <Route path="/manage-crypto" component={ManageCrypto} />
        <Route path="/dapps" component={DApps} />
        <Route path="/dapp-browser" component={DAppBrowser} />
        <Route path="/bridge" component={Bridge} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <WalletProvider>
          <TooltipProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-1 flex-col overflow-hidden">
                  <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-4">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span className="font-semibold text-lg">VaultKey</span>
                    </div>
                    <HardwareStatus />
                  </header>
                  <main className="flex-1 overflow-auto pb-28 md:pb-0">
                    <Router />
                  </main>
                </div>
              </div>
              <MobileFooter />
            </SidebarProvider>
            <PinModal />
            <Toaster />
          </TooltipProvider>
        </WalletProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

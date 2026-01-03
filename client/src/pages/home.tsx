import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Home() {
  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-8 bg-background"
      data-testid="welcome-screen"
    >
      <div className="flex flex-col items-center text-center animate-fade-in">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-primary" />
          <span 
            className="text-2xl sm:text-3xl font-semibold tracking-wide text-foreground"
            data-testid="text-brand-name"
          >
            VAULT KEY
          </span>
        </div>
        
        <h1 
          className="text-5xl sm:text-6xl md:text-7xl font-bold text-foreground mb-6"
          data-testid="text-welcome"
        >
          Welcome
        </h1>
        
        <p 
          className="text-lg sm:text-xl text-muted-foreground mb-12"
          data-testid="text-tagline"
        >
          Secure Hardware Wallet
        </p>

        <Link href="/wallet">
          <Button size="lg" className="px-8" data-testid="button-get-started">
            View Addresses
          </Button>
        </Link>
      </div>
    </div>
  );
}

import { Bitcoin, Coins } from "lucide-react";
import { 
  SiEthereum, 
  SiBinance, 
  SiPolygon,
  SiSolana,
  SiLitecoin,
  SiDogecoin,
  SiRipple,
  SiCardano,
  SiPolkadot,
  SiTether,
} from "react-icons/si";

interface ChainIconProps {
  symbol: string;
  iconColor?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-5 w-5",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

// Chain brand colors
const CHAIN_COLORS: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#627EEA",
  BNB: "#F3BA2F",
  MATIC: "#8247E5",
  SOL: "#14F195",
  AVAX: "#E84142",
  ARB: "#12AAFF",
  XRP: "#23292F",
  DOGE: "#C2A633",
  ADA: "#0033AD",
  TRX: "#FF0013",
  DOT: "#E6007A",
  LTC: "#345D9D",
  BCH: "#8DC351",
  USDT: "#26A17B",
  USDC: "#2775CA",
  ATOM: "#2E3148",
  OSMO: "#750BBB",
  OP: "#FF0420",
};

// SVG icons for chains without react-icons support
function AvaxIcon({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 19.5h6.5L12 13l3.5 6.5H22L12 2z"/>
    </svg>
  );
}

function ArbIcon({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L3 21h4.5l4.5-9 4.5 9H21L12 2zm0 7l2.5 5h-5L12 9z"/>
    </svg>
  );
}

function TronIcon({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L3 8.5v7L12 22l9-6.5v-7L12 2zm0 2.5l6 4.3-6 8.2-6-8.2 6-4.3z"/>
    </svg>
  );
}

function BchIcon({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5v1.5h-2v-1.5c-1.5-.3-2.5-1.1-2.8-2.3l1.5-.5c.2.8.9 1.3 1.8 1.3.7 0 1.5-.3 1.5-1 0-.6-.5-.9-1.5-1.2-1.5-.4-3-1-3-2.8 0-1.3 1-2.3 2.5-2.5V6h2v1.5c1.2.2 2.1.9 2.5 2l-1.5.5c-.2-.6-.7-1-1.5-1-.7 0-1.2.3-1.2.8 0 .5.4.8 1.5 1.1 1.5.4 3 1 3 2.9 0 1.5-1.2 2.5-2.8 2.7z"/>
    </svg>
  );
}

function CosmosIcon({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="3"/>
      <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(60 12 12)"/>
      <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(120 12 12)"/>
    </svg>
  );
}

function OptimismIcon({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10"/>
    </svg>
  );
}

export function ChainIcon({ symbol, iconColor, className = "", size = "md" }: ChainIconProps) {
  const sizeClass = sizeClasses[size];
  const upperSymbol = symbol.toUpperCase();
  const color = iconColor || CHAIN_COLORS[upperSymbol] || "#6B7280";

  const iconMap: Record<string, JSX.Element> = {
    BTC: <Bitcoin className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.BTC }} />,
    ETH: <SiEthereum className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.ETH }} />,
    BNB: <SiBinance className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.BNB }} />,
    MATIC: <SiPolygon className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.MATIC }} />,
    SOL: <SiSolana className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.SOL }} />,
    LTC: <SiLitecoin className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.LTC }} />,
    DOGE: <SiDogecoin className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.DOGE }} />,
    XRP: <SiRipple className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.XRP }} />,
    ADA: <SiCardano className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.ADA }} />,
    DOT: <SiPolkadot className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.DOT }} />,
    USDT: <SiTether className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.USDT }} />,
    AVAX: <AvaxIcon className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.AVAX }} />,
    ARB: <ArbIcon className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.ARB }} />,
    TRX: <TronIcon className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.TRX }} />,
    BCH: <BchIcon className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.BCH }} />,
    ATOM: <CosmosIcon className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.ATOM }} />,
    OSMO: <CosmosIcon className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.OSMO }} />,
    OP: <OptimismIcon className={`${sizeClass} ${className}`} style={{ color: CHAIN_COLORS.OP }} />,
  };

  if (iconMap[upperSymbol]) {
    return iconMap[upperSymbol];
  }

  // Fallback to colored circle with first letter
  return (
    <div 
      className={`flex items-center justify-center rounded-full ${sizeClass} ${className}`}
      style={{ backgroundColor: color }}
    >
      <span className="text-white font-bold text-xs">{upperSymbol.slice(0, 2)}</span>
    </div>
  );
}

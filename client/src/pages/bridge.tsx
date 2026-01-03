import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Monitor, Wifi, WifiOff, Loader2, Check, Copy, QrCode } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { QRCodeSVG } from "qrcode.react";

export default function Bridge() {
  const [, setLocation] = useLocation();
  const { walletMode } = useWallet();
  const [sessionId, setSessionId] = useState<string>("");
  const [inputSessionId, setInputSessionId] = useState("");
  const [role, setRole] = useState<"desktop" | "mobile" | null>(null);
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const [error, setError] = useState<string | null>(null);

  const createSession = async () => {
    setConnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/bridge/create", { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to create bridge session");
      }
      const data = await response.json();
      setSessionId(data.sessionId);
      setRole("desktop");
      connectWebSocket(data.sessionId, "desktop");
    } catch (err: any) {
      console.error("Failed to create session:", err);
      setError(err.message || "Failed to create session. Please try again.");
      setConnecting(false);
    }
  };

  const joinSession = () => {
    if (!inputSessionId.trim()) return;
    setConnecting(true);
    setError(null);
    setSessionId(inputSessionId.toUpperCase());
    setRole("mobile");
    connectWebSocket(inputSessionId.toUpperCase(), "mobile");
  };

  const connectWebSocket = (sid: string, r: "desktop" | "mobile") => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/bridge?sessionId=${sid}&role=${r}`);
    
    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "desktop_connected" || message.type === "mobile_connected") {
          setPeerConnected(true);
        } else if (message.type === "desktop_disconnected" || message.type === "mobile_disconnected") {
          setPeerConnected(false);
        } else if (message.type === "connected") {
          setConnected(true);
        }
        
        // Handle Pico commands from mobile
        if (r === "desktop" && message.from === "mobile" && message.type === "pico_command") {
          handlePicoCommand(message, ws);
        }
        
        // Handle Pico responses on mobile
        if (r === "mobile" && message.from === "desktop" && message.type === "pico_response") {
          window.dispatchEvent(new CustomEvent("bridge_pico_response", { detail: message }));
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setPeerConnected(false);
    };

    ws.onerror = () => {
      setConnecting(false);
      setError("Failed to connect. Please check your network and try again.");
    };

    wsRef.current = ws;
  };

  const handlePicoCommand = async (message: any, ws: WebSocket) => {
    // Forward command to Pico via the local hardware wallet connection
    // This requires the desktop to have the Pico connected
    try {
      const { piWallet } = await import("@/lib/pi-wallet");
      let response: any;
      
      switch (message.command) {
        case "ping":
          response = await piWallet.ping();
          break;
        case "getStatus":
          response = await piWallet.getStatus();
          break;
        case "unlock":
          response = await piWallet.unlock(message.pin);
          break;
        case "sendCommand":
          response = await piWallet.sendCommand(message.cmd, message.params);
          break;
        default:
          response = { error: "Unknown command" };
      }
      
      ws.send(JSON.stringify({
        type: "pico_response",
        requestId: message.requestId,
        response
      }));
    } catch (error: any) {
      ws.send(JSON.stringify({
        type: "pico_response",
        requestId: message.requestId,
        error: error.message
      }));
    }
  };

  const copySessionId = () => {
    navigator.clipboard.writeText(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bridgeUrl = `${window.location.origin}/bridge?join=${sessionId}`;

  // Check URL for join parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get("join");
    if (joinId) {
      setInputSessionId(joinId);
    }
  }, []);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Mobile Bridge</h1>
          <p className="text-muted-foreground">
            Connect your mobile device to access your Pico hardware wallet
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!connected ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  Desktop (Host)
                </CardTitle>
                <CardDescription>
                  Connect your Pico to this computer and create a session
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={createSession} 
                  disabled={connecting}
                  className="w-full"
                  data-testid="button-create-session"
                >
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Create Bridge Session
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Mobile (Client)
                </CardTitle>
                <CardDescription>
                  Enter the session code from your desktop
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Session Code (e.g., ABC123)"
                  value={inputSessionId}
                  onChange={(e) => setInputSessionId(e.target.value.toUpperCase())}
                  maxLength={6}
                  data-testid="input-session-code"
                />
                <Button 
                  onClick={joinSession} 
                  disabled={connecting || !inputSessionId.trim()}
                  className="w-full"
                  data-testid="button-join-session"
                >
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Join Session
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {role === "desktop" ? <Monitor className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
                  {role === "desktop" ? "Desktop Bridge Active" : "Mobile Connected"}
                </span>
                <Badge variant={peerConnected ? "default" : "secondary"}>
                  {peerConnected ? (
                    <><Wifi className="h-3 w-3 mr-1" /> Paired</>
                  ) : (
                    <><WifiOff className="h-3 w-3 mr-1" /> Waiting</>
                  )}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {role === "desktop" && (
                <>
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-muted-foreground">Session Code:</span>
                      <code className="text-2xl font-mono font-bold tracking-widest" data-testid="text-session-code">
                        {sessionId}
                      </code>
                      <Button size="icon" variant="ghost" onClick={copySessionId} data-testid="button-copy-code">
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    
                    <div className="flex justify-center">
                      <div className="bg-white p-4 rounded-lg">
                        <QRCodeSVG value={bridgeUrl} size={180} />
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      Scan this QR code with your mobile device or enter the code manually
                    </p>
                  </div>

                  {peerConnected ? (
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                      <Check className="h-5 w-5" />
                      <span>Mobile device connected! You can now use the wallet on your phone.</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Waiting for mobile device to connect...</span>
                    </div>
                  )}
                </>
              )}

              {role === "mobile" && (
                <div className="text-center space-y-4">
                  {peerConnected ? (
                    <>
                      <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                        <Check className="h-5 w-5" />
                        <span>Connected to desktop!</span>
                      </div>
                      <Button onClick={() => setLocation("/")} data-testid="button-go-dashboard">
                        Go to Dashboard
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Waiting for desktop connection...</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>1.</strong> On your desktop/laptop, connect your Raspberry Pi Pico via USB
            </p>
            <p>
              <strong>2.</strong> Create a bridge session on the desktop
            </p>
            <p>
              <strong>3.</strong> Scan the QR code or enter the session code on your mobile device
            </p>
            <p>
              <strong>4.</strong> Your mobile app will communicate with the Pico through the desktop
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

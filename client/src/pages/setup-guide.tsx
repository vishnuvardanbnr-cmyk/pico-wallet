import { useState } from "react";
import { 
  Terminal, 
  Usb, 
  Shield, 
  CheckCircle2, 
  Copy, 
  ChevronRight,
  AlertTriangle,
  Cpu,
  Wifi,
  Lock,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const { toast } = useToast();
  
  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Copied",
      description: "Command copied to clipboard",
    });
  };
  
  return (
    <div className="relative group">
      <pre className="bg-muted rounded-md p-4 overflow-x-auto text-sm font-mono">
        <code>{code}</code>
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copyCode}
        data-testid="button-copy-code"
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function StepCard({ 
  step, 
  title, 
  description, 
  children 
}: { 
  step: number; 
  title: string; 
  description: string; 
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            {step}
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function SetupGuide() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BackButton />
          <h1 className="text-3xl font-bold">Hardware Wallet Setup Guide</h1>
        </div>
        <p className="text-muted-foreground">
          Build your own hardware wallet with Raspberry Pi Pico H ($8) or Raspberry Pi 4 ($50)
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Cpu className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="hardware" data-testid="tab-hardware">
            <Usb className="mr-2 h-4 w-4" />
            Hardware
          </TabsTrigger>
          <TabsTrigger value="pico" data-testid="tab-pico">
            <Cpu className="mr-2 h-4 w-4" />
            Pico Setup
          </TabsTrigger>
          <TabsTrigger value="setup" data-testid="tab-setup">
            <Terminal className="mr-2 h-4 w-4" />
            Pi 4 Setup
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h2 className="text-xl font-semibold mb-4">What You Get</h2>
                  <ul className="space-y-3">
                    {[
                      "Air-gapped key storage on dedicated hardware",
                      "BIP39/BIP44 standard seed phrase generation",
                      "Multi-chain support (ETH, BSC, Polygon, custom)",
                      "PIN-protected access with lockout protection",
                      "USB connection to web app for signing",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                        <span className="text-sm">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-4">How It Works</h2>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">1</Badge>
                      <span>Pi stores encrypted seed phrase</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mx-4" />
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">2</Badge>
                      <span>Web app sends transaction to sign</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mx-4" />
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">3</Badge>
                      <span>Pi signs with your PIN confirmation</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mx-4" />
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">4</Badge>
                      <span>Signature returned, transaction broadcast</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Important Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-foreground font-medium">Seed phrase:</span>
                  Write it down on paper. Never store digitally.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground font-medium">PIN:</span>
                  Required for every transaction. 5 failed attempts = 5 min lockout.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground font-medium">Physical security:</span>
                  Keep your Pi in a safe place. If stolen, PIN still protects the wallet.
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardware">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Required Components</CardTitle>
              <CardDescription>Total cost: approximately $50</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 font-medium">Component</th>
                      <th className="text-left py-3 font-medium">Description</th>
                      <th className="text-right py-3 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-3 font-medium">Raspberry Pi 4</td>
                      <td className="py-3 text-muted-foreground">Any RAM size (1GB works fine)</td>
                      <td className="py-3 text-right">$35-75</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 font-medium">MicroSD Card</td>
                      <td className="py-3 text-muted-foreground">32GB minimum, Class 10</td>
                      <td className="py-3 text-right">$8</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 font-medium">USB-C Cable</td>
                      <td className="py-3 text-muted-foreground">Data + power capable</td>
                      <td className="py-3 text-right">$5</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-bold">Total</td>
                      <td className="py-3"></td>
                      <td className="py-3 text-right font-bold">~$50</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Optional Upgrades</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <Badge variant="secondary">Case</Badge>
                  <span>Aluminum case with heatsink for better cooling ($10-15)</span>
                </li>
                <li className="flex items-start gap-3">
                  <Badge variant="secondary">Power</Badge>
                  <span>Official Pi 4 power supply if not using USB-C from computer ($8)</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="mt-6 border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="default">Recommended</Badge>
                Raspberry Pi Pico H - Budget Option
              </CardTitle>
              <CardDescription>The simplest and cheapest hardware wallet solution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 font-medium">Component</th>
                      <th className="text-left py-3 font-medium">Description</th>
                      <th className="text-right py-3 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-3 font-medium">Raspberry Pi Pico H</td>
                      <td className="py-3 text-muted-foreground">With pre-soldered headers</td>
                      <td className="py-3 text-right">$5</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3 font-medium">Micro USB Cable</td>
                      <td className="py-3 text-muted-foreground">Data cable (not charge-only)</td>
                      <td className="py-3 text-right">$3</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-bold">Total</td>
                      <td className="py-3"></td>
                      <td className="py-3 text-right font-bold text-green-600">~$8</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                The Pico H is the recommended choice for beginners. No SD card, no OS installation - just plug and play!
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pico">
          <Card className="mb-6 border-green-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Easiest Setup - Just 3 Steps
              </CardTitle>
              <CardDescription>Get your hardware wallet running in under 5 minutes</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The Raspberry Pi Pico H is a microcontroller that runs MicroPython. It's the simplest 
                way to create a hardware wallet - no operating system, no SD card, no network.
              </p>
            </CardContent>
          </Card>

          <StepCard
            step={1}
            title="Install MicroPython on your Pico"
            description="Flash the MicroPython firmware"
          >
            <ol className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <Badge variant="outline">A</Badge>
                <div>
                  <p className="mb-2">Download MicroPython from <a href="https://micropython.org/download/RPI_PICO/" target="_blank" rel="noopener" className="text-primary underline">micropython.org</a></p>
                  <p className="text-muted-foreground">Get the latest .uf2 file for Raspberry Pi Pico</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">B</Badge>
                <div>
                  <p>Hold the BOOTSEL button on your Pico and plug it into USB</p>
                  <p className="text-muted-foreground">The Pico will appear as a USB drive called "RPI-RP2"</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">C</Badge>
                <div>
                  <p>Drag and drop the .uf2 file onto the RPI-RP2 drive</p>
                  <p className="text-muted-foreground">The Pico will reboot automatically with MicroPython installed</p>
                </div>
              </li>
            </ol>
          </StepCard>

          <StepCard
            step={2}
            title="Upload the Wallet Firmware"
            description="Copy the wallet code to your Pico"
          >
            <ol className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <Badge variant="outline">A</Badge>
                <div>
                  <p className="mb-2">Download and install <a href="https://thonny.org/" target="_blank" rel="noopener" className="text-primary underline">Thonny IDE</a></p>
                  <p className="text-muted-foreground">Free Python IDE that works great with Pico</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">B</Badge>
                <div>
                  <p>In Thonny, go to Tools, then Options, then Interpreter</p>
                  <p className="text-muted-foreground">Select "MicroPython (Raspberry Pi Pico)" and your port</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">C</Badge>
                <div>
                  <p>Open the file <code className="bg-muted px-1 rounded">pico_wallet/main.py</code> from this project</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">D</Badge>
                <div>
                  <p>Save it to the Pico as <code className="bg-muted px-1 rounded">main.py</code></p>
                  <p className="text-muted-foreground">File, then Save As, then select "Raspberry Pi Pico", name it main.py</p>
                </div>
              </li>
            </ol>
          </StepCard>

          <StepCard
            step={3}
            title="Connect to SecureVault"
            description="Use your new hardware wallet"
          >
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <Badge variant="outline">1</Badge>
                <span>Make sure your Pico is connected via USB (you can close Thonny now)</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">2</Badge>
                <span>Open SecureVault in Chrome or Edge (Web Serial requires these browsers)</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">3</Badge>
                <span>Go to Dashboard and click "Create Wallet"</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">4</Badge>
                <span>Select the "Raspberry Pi" tab</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">5</Badge>
                <span>Click "Connect Raspberry Pi" and select your Pico from the list</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">6</Badge>
                <span>Set your 4-6 digit PIN</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">7</Badge>
                <span className="font-semibold">Write down your 24-word seed phrase on paper!</span>
              </li>
            </ol>
          </StepCard>

          <Card className="border-amber-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Troubleshooting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-foreground font-medium">Pico not detected:</span>
                  Make sure Thonny is closed - only one app can use the serial port at a time
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground font-medium">Web Serial not available:</span>
                  Use Chrome or Edge browser, Firefox doesn't support Web Serial API
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground font-medium">Connection timeout:</span>
                  Unplug and replug the Pico, then try again
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup">
          <StepCard
            step={1}
            title="Flash Raspberry Pi OS"
            description="Download and install the operating system"
          >
            <ol className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <Badge variant="outline">A</Badge>
                <div>
                  <p className="mb-2">Download <a href="https://www.raspberrypi.com/software/" target="_blank" rel="noopener" className="text-primary underline">Raspberry Pi Imager</a></p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">B</Badge>
                <div>
                  <p>Select "Raspberry Pi OS Lite (64-bit)" - no desktop needed</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">C</Badge>
                <div>
                  <p className="mb-2">Click the gear icon to configure:</p>
                  <ul className="list-disc list-inside text-muted-foreground ml-2">
                    <li>Enable SSH</li>
                    <li>Set username: <code className="bg-muted px-1 rounded">pi</code></li>
                    <li>Set a strong password</li>
                    <li>Configure WiFi (optional, for initial setup only)</li>
                  </ul>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">D</Badge>
                <div>
                  <p>Flash to your MicroSD card</p>
                </div>
              </li>
            </ol>
          </StepCard>

          <StepCard
            step={2}
            title="Copy Wallet Files"
            description="Transfer the wallet software to your Pi"
          >
            <p className="text-sm text-muted-foreground mb-4">
              From your computer, run this command to copy the wallet files:
            </p>
            <CodeBlock code="scp -r raspberry_pi_wallet/ pi@raspberrypi.local:~/" />
            <p className="text-sm text-muted-foreground mt-4">
              If <code className="bg-muted px-1 rounded">raspberrypi.local</code> doesn't work, use the Pi's IP address.
            </p>
          </StepCard>

          <StepCard
            step={3}
            title="Run Setup Script"
            description="Install dependencies and configure USB mode"
          >
            <p className="text-sm text-muted-foreground mb-4">
              SSH into your Pi and run the setup:
            </p>
            <CodeBlock code={`ssh pi@raspberrypi.local
cd raspberry_pi_wallet
chmod +x setup_pi.sh
./setup_pi.sh`} />
            <p className="text-sm text-muted-foreground mt-4">
              The script will install Python packages and configure USB gadget mode. Reboot when prompted.
            </p>
          </StepCard>

          <StepCard
            step={4}
            title="Start the Wallet"
            description="Launch the wallet service"
          >
            <p className="text-sm text-muted-foreground mb-4">
              After reboot, start the wallet manually:
            </p>
            <CodeBlock code={`source ~/wallet_env/bin/activate
cd ~/raspberry_pi_wallet
python main.py`} />
            <p className="text-sm text-muted-foreground mt-4 mb-4">
              Or enable auto-start on boot:
            </p>
            <CodeBlock code={`sudo systemctl enable pi-wallet
sudo systemctl start pi-wallet`} />
          </StepCard>

          <StepCard
            step={5}
            title="Connect to Web App"
            description="Link your Pi wallet to SecureVault"
          >
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <Badge variant="outline">1</Badge>
                <span>Connect Pi to your computer via USB-C (use the USB-C port, not micro-USB power)</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">2</Badge>
                <span>Open SecureVault web app in your browser</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">3</Badge>
                <span>Go to Dashboard and click "Create Wallet"</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">4</Badge>
                <span>Select the "Raspberry Pi" tab</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">5</Badge>
                <span>Click "Connect Raspberry Pi" and allow USB access</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">6</Badge>
                <span>Set your 4-6 digit PIN</span>
              </li>
              <li className="flex items-start gap-3">
                <Badge variant="outline">7</Badge>
                <span className="font-semibold">Write down your 24-word seed phrase on paper!</span>
              </li>
            </ol>
          </StepCard>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  What's Protected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Private keys never leave the Pi</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Seed phrase encrypted with your PIN</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Every transaction requires PIN confirmation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Lockout after 5 failed PIN attempts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Auto-lock after 5 minutes of inactivity</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="h-5 w-5" />
                  Extra Security Steps
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-primary mt-0.5" />
                    <span>Disable WiFi after initial setup for air-gap</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-primary mt-0.5" />
                    <span>Disable Bluetooth in /boot/config.txt</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-primary mt-0.5" />
                    <span>Store Pi in a secure location</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-primary mt-0.5" />
                    <span>Keep backup of seed phrase in fireproof safe</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Limitations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-foreground">No physical button:</span>
                  Unlike commercial hardware wallets, confirmation is via PIN only
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground">No display:</span>
                  You cannot verify transaction details on the Pi itself
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground">SD card theft:</span>
                  If someone steals the SD card, they still need your PIN to access funds
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground">Not FIDO certified:</span>
                  This is a DIY solution, not a certified security device
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Disabling WiFi/Bluetooth (Recommended)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                After initial setup, disable wireless for maximum security:
              </p>
              <CodeBlock code={`# Add to /boot/config.txt
dtoverlay=disable-wifi
dtoverlay=disable-bt`} />
              <p className="text-sm text-muted-foreground mt-4">
                Then reboot. Your Pi will only communicate via USB.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

type PicoCommand = {
  action: string;
  pin?: string;
  seed?: string;
  message?: string;
};

type PicoResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  has_wallet?: boolean;
  unlocked?: boolean;
  locked_out?: boolean;
  lockout_remaining?: number;
  seed?: string;
  signature?: string;
  pong?: boolean;
};

class PicoSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private writer: WritableStreamDefaultWriter<string> | null = null;
  private connected: boolean = false;
  private responseBuffer: string = "";
  
  async connect(): Promise<boolean> {
    try {
      if (!("serial" in navigator)) {
        throw new Error("Web Serial API not supported. Use Chrome or Edge browser.");
      }
      
      // Request port - Pico vendor ID 0x2E8A
      this.port = await (navigator.serial as any).requestPort({
        filters: [{ usbVendorId: 0x2E8A }]
      });
      
      await this.port.open({ baudRate: 115200 });
      
      const textDecoder = new TextDecoderStream();
      const textEncoder = new TextEncoderStream();
      
      this.port.readable?.pipeTo(textDecoder.writable);
      textEncoder.readable.pipeTo(this.port.writable!);
      
      this.reader = textDecoder.readable.getReader();
      this.writer = textEncoder.writable.getWriter();
      
      this.connected = true;
      
      // Start reading in background
      this.readLoop();
      
      // Wait a moment for connection to stabilize
      await this.delay(500);
      
      // Send a ping to verify connection
      const pingResult = await this.sendCommand({ action: "ping" });
      if (pingResult.pong) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Failed to connect to Pico:", error);
      this.connected = false;
      throw error;
    }
  }
  
  async disconnect(): Promise<void> {
    this.connected = false;
    
    if (this.reader) {
      await this.reader.cancel();
      this.reader = null;
    }
    
    if (this.writer) {
      await this.writer.close();
      this.writer = null;
    }
    
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
  }
  
  isConnected(): boolean {
    return this.connected && this.port !== null;
  }
  
  private async readLoop(): Promise<void> {
    while (this.connected && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.responseBuffer += value;
        }
      } catch {
        break;
      }
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async sendCommand(command: PicoCommand): Promise<PicoResponse> {
    if (!this.connected || !this.writer) {
      throw new Error("Not connected to Pico");
    }
    
    // Clear response buffer
    this.responseBuffer = "";
    
    // Send command as JSON
    const cmdString = JSON.stringify(command) + "\r\n";
    await this.writer.write(cmdString);
    
    // Wait for response (with timeout)
    const timeout = 5000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Look for complete JSON response in buffer
      const lines = this.responseBuffer.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const response = JSON.parse(trimmed) as PicoResponse;
            this.responseBuffer = "";
            return response;
          } catch {
            // Not valid JSON, continue waiting
          }
        }
      }
      await this.delay(50);
    }
    
    throw new Error("Timeout waiting for Pico response");
  }
  
  async getStatus(): Promise<PicoResponse> {
    return this.sendCommand({ action: "status" });
  }
  
  async setup(pin: string, seed: string): Promise<PicoResponse> {
    return this.sendCommand({ action: "setup", pin, seed });
  }
  
  async unlock(pin: string): Promise<PicoResponse> {
    return this.sendCommand({ action: "unlock", pin });
  }
  
  async lock(): Promise<PicoResponse> {
    return this.sendCommand({ action: "lock" });
  }
  
  async sign(message: string, pin: string): Promise<PicoResponse> {
    return this.sendCommand({ action: "sign", message, pin });
  }
  
  async getSeed(pin: string): Promise<PicoResponse> {
    return this.sendCommand({ action: "get_seed", pin });
  }
  
  async reset(pin: string): Promise<PicoResponse> {
    return this.sendCommand({ action: "reset", pin });
  }
}

// Singleton instance
export const picoSerial = new PicoSerial();

// Helper to check if Web Serial is supported
export function isWebSerialSupported(): boolean {
  return "serial" in navigator;
}

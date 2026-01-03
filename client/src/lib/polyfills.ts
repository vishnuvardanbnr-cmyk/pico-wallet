import { Buffer } from "buffer/";
import process from "process/browser";

if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
  (window as any).global = window;
  (window as any).process = process;
  (globalThis as any).Buffer = Buffer;
}

export { Buffer };

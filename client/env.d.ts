/** Injected at build time by Vite `define` (see vite.config.ts). */
declare const __SERVER_URL__: string;

interface Window {
  /** Test instrumentation read by the Playwright screenshot gate. */
  __tankclash?: {
    connected: boolean;
    players: number;
    fps: number;
    phase: string;
  };
}

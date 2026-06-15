/** Injected at build time by Vite `define` (see vite.config.ts). */
declare const __SERVER_URL__: string;

interface Window {
  /** Test instrumentation read by the Playwright screenshot gate. */
  __tankclash?: {
    connected: boolean;
    /** Fighter count (non-spectator players). */
    players: number;
    fps: number;
    phase: string;
    /** Current app screen: "browser" or "room". */
    screen: string;
    /** True when the local client is watching, not fighting. */
    watching: boolean;
    /** True when the local client is the room host. */
    isHost: boolean;
    /** Remaining pre-match countdown (s). */
    countdown: number;
    /** X of the first non-local tank — lets tests detect a frozen (paused) world. */
    enemyX: number;
    paused: boolean;
  };
}

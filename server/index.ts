import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import rateLimit from "express-rate-limit";
import { TankClashRoom } from "./rooms/TankClashRoom";

const port = Number(process.env.PORT) || 2567;
const dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 100 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

// Allow the dev client (different port) and remote builds to read the JSON API.
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (!isProd) res.header("Access-Control-Allow-Origin", "*");
  else if (origin && ALLOWED_ORIGINS.includes(origin)) res.header("Access-Control-Allow-Origin", origin);
  next();
});

// Health check endpoint (used by the Docker HEALTHCHECK).
app.get("/api/rooms", (_req, res) => {
  res.json({ ok: true });
});

// Room browser feed: open rooms with their matchmaking metadata.
app.get("/api/lobby", async (_req, res) => {
  try {
    const rooms = await matchMaker.query({ name: "tankclash" });
    res.json(
      rooms.map((r) => ({ roomId: r.roomId, clients: r.clients, maxClients: r.maxClients, metadata: r.metadata })),
    );
  } catch {
    res.json([]);
  }
});

// Serve the built client when present (single-container deployments).
app.use(express.static(path.join(dirname, "../public")));
app.use(express.static(path.join(dirname, "../../public")));

const httpServer = createServer(app);

const verifyClient = (info: any, next: (result: boolean, code?: number, name?: string) => void) => {
  if (!isProd) return next(true);
  const origin = info.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) return next(true);
  next(false, 403, "Forbidden origin");
};

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer, verifyClient }),
});

gameServer.define("tankclash", TankClashRoom);

gameServer.listen(port).then(() => {
  console.log(`TankClash server listening on :${port}`);
});

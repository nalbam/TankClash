import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { TankClashRoom } from "./rooms/TankClashRoom";

const port = Number(process.env.PORT) || 2567;
const dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Allow the dev client (different port) and remote builds to read the JSON API.
app.use("/api", (_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
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

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("tankclash", TankClashRoom);

gameServer.listen(port).then(() => {
  console.log(`TankClash server listening on :${port}`);
});

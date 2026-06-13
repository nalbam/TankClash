import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { TankClashRoom } from "./rooms/TankClashRoom";

const port = Number(process.env.PORT) || 2567;
const dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Health check endpoint (used by the Docker HEALTHCHECK).
app.get("/api/rooms", (_req, res) => {
  res.json({ ok: true });
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

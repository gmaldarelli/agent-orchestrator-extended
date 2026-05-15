/**
 * Direct WebSocket terminal server.
 * Hosts the multiplexed /mux WebSocket endpoint for all terminal connections.
 */

import { createServer, type Server } from "node:http";
import type { WebSocketServer } from "ws";
import { isWindows } from "@aoagents/ao-core";
import { findTmux } from "./tmux-utils.js";
import { createMuxWebSocket } from "./mux-websocket.js";

export interface DirectTerminalServer {
  server: Server;
  shutdown: (drainMs?: number) => void;
}

type MuxWebSocketServer = WebSocketServer & {
  shutdownMuxResources?: () => void;
};

/**
 * Create the direct terminal WebSocket server.
 * Separated from listen() so tests can control lifecycle.
 */
export function createDirectTerminalServer(tmuxPath?: string | null): DirectTerminalServer {
  const TMUX = tmuxPath ?? findTmux();

  let muxWss: MuxWebSocketServer | null = null;

  const metrics = {
    totalConnections: 0,
    totalDisconnects: 0,
    totalErrors: 0,
  };

  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          clients: muxWss?.clients.size ?? 0,
          metrics,
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  muxWss = createMuxWebSocket(TMUX);

  if (muxWss) {
    muxWss.on("connection", (ws) => {
      metrics.totalConnections++;
      ws.on("close", () => {
        metrics.totalDisconnects++;
      });
      ws.on("error", () => {
        metrics.totalErrors++;
      });
    });
  }

  // Manual upgrade routing — ws library doesn't support multiple WebSocketServer
  // instances with different `path` options on the same HTTP server.
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "ws://localhost").pathname;

    if (pathname === "/mux" && muxWss) {
      const activeMuxWss = muxWss;
      activeMuxWss.handleUpgrade(request, socket, head, (ws) => {
        activeMuxWss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  function shutdown(drainMs = 0) {
    muxWss?.shutdownMuxResources?.();

    const closeMuxClients = () => {
      if (!muxWss) return;
      for (const client of muxWss.clients) {
        client.close(1001, "server shutdown");
      }
      muxWss.close();
    };

    if (drainMs > 0) {
      const drainTimer = setTimeout(closeMuxClients, drainMs);
      drainTimer.unref();
    } else {
      closeMuxClients();
    }
    server.close();
  }

  return { server, shutdown };
}

// --- Run as standalone script ---
// Only start the server when executed directly (not imported by tests)
const isMainModule =
  process.argv[1]?.endsWith("direct-terminal-ws.ts") ||
  process.argv[1]?.endsWith("direct-terminal-ws.js");

if (isMainModule) {
  const PORT = parseInt(process.env.DIRECT_TERMINAL_PORT ?? "14801", 10);

  // On Windows, findTmux() returns null — mux-websocket.ts handles this by
  // using named pipe relay to PTY hosts instead of tmux attach.
  const TMUX = findTmux();
  if (TMUX) {
    console.log(`[DirectTerminal] Using tmux: ${TMUX}`);
  } else if (isWindows()) {
    console.log(`[DirectTerminal] Windows mode — using named pipe relay to PTY hosts`);
  } else {
    console.log(`[DirectTerminal] No tmux available — terminal relay may be limited`);
  }

  const { server, shutdown } = createDirectTerminalServer(TMUX);

  server.listen(PORT, () => {
    console.log(`[DirectTerminal] WebSocket server listening on port ${PORT}`);
  });

  let shuttingDown = false;

  function handleShutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[DirectTerminal] Received ${signal}, shutting down...`);
    shutdown(1_000);
    const forceExitTimer = setTimeout(() => {
      console.warn(
        "[DirectTerminal] Shutdown cleanup still pending after timeout; exiting cleanly",
      );
      process.exit(0);
    }, 5000);
    forceExitTimer.unref();
  }

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

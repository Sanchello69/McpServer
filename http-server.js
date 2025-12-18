#!/usr/bin/env node

import express from "express";
import { spawn } from "child_process";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Store active MCP server process and session
let mcpProcess = null;
let sessionId = null;

// Start MCP server process
function startMcpServer() {
  if (mcpProcess) {
    return;
  }

  mcpProcess = spawn("node", ["index.js"], {
    cwd: import.meta.dirname,
  });

  mcpProcess.stderr.on("data", (data) => {
    console.log("[MCP Server]", data.toString());
  });

  mcpProcess.on("close", (code) => {
    console.log(`MCP server process exited with code ${code}`);
    mcpProcess = null;
  });

  console.log("MCP server process started");
}

// Send request to MCP server and get response
async function sendToMcp(request) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess) {
      reject(new Error("MCP server not running"));
      return;
    }

    let responseData = "";

    const dataHandler = (data) => {
      responseData += data.toString();

      // Try to parse complete JSON response
      try {
        const lines = responseData.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            const parsed = JSON.parse(line);
            mcpProcess.stdout.removeListener("data", dataHandler);
            resolve(parsed);
            return;
          }
        }
      } catch (e) {
        // Not complete yet, continue listening
      }
    };

    mcpProcess.stdout.on("data", dataHandler);

    // Send request
    mcpProcess.stdin.write(JSON.stringify(request) + "\n");

    // Timeout after 30 seconds
    setTimeout(() => {
      mcpProcess.stdout.removeListener("data", dataHandler);
      reject(new Error("Request timeout"));
    }, 30000);
  });
}

// Initialize MCP connection
app.post("/mcp/initialize", async (req, res) => {
  try {
    startMcpServer();

    const response = await sendToMcp({
      jsonrpc: "2.0",
      id: req.body.id || "init-1",
      method: "initialize",
      params: req.body.params || {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "MyAiModelsBot",
          version: "1.0.0",
        },
      },
    });

    sessionId = "session-" + Date.now();
    res.json(response);
  } catch (error) {
    console.error("Initialize error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -32603,
        message: error.message,
      },
    });
  }
});

// List available tools
app.post("/mcp/tools/list", async (req, res) => {
  try {
    const response = await sendToMcp({
      jsonrpc: "2.0",
      id: req.body.id || "list-tools-1",
      method: "tools/list",
      params: req.body.params || {},
    });

    res.json(response);
  } catch (error) {
    console.error("List tools error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -32603,
        message: error.message,
      },
    });
  }
});

// Call a tool
app.post("/mcp/tools/call", async (req, res) => {
  try {
    const response = await sendToMcp({
      jsonrpc: "2.0",
      id: req.body.id || "call-tool-1",
      method: "tools/call",
      params: req.body.params,
    });

    res.json(response);
  } catch (error) {
    console.error("Call tool error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -32603,
        message: error.message,
      },
    });
  }
});

// Get Bitcoin price (convenience endpoint)
app.get("/bitcoin/price", async (req, res) => {
  try {
    const response = await sendToMcp({
      jsonrpc: "2.0",
      id: "get-bitcoin-" + Date.now(),
      method: "tools/call",
      params: {
        name: "get_asset_by_id",
        arguments: {
          id: "bitcoin",
        },
      },
    });

    if (response.error) {
      res.status(500).json({ error: response.error.message });
      return;
    }

    // Parse the response
    const result = response.result;
    if (result && result.content && result.content[0]) {
      const data = JSON.parse(result.content[0].text);
      res.json({
        price: parseFloat(data.data.priceUsd),
        timestamp: Date.now(),
      });
    } else {
      res.status(500).json({ error: "Invalid response format" });
    }
  } catch (error) {
    console.error("Get Bitcoin price error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mcpServerRunning: mcpProcess !== null,
    sessionId,
  });
});

// Cleanup on exit
process.on("SIGINT", () => {
  if (mcpProcess) {
    mcpProcess.kill();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`HTTP wrapper server running on http://localhost:${PORT}`);
  console.log("Starting MCP server...");
  startMcpServer();
});

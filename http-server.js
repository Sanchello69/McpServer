#!/usr/bin/env node

import express from "express";
import { spawn } from "child_process";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Store active MCP server processes and sessions
let coinCapProcess = null;
let fileServerProcess = null;
let mobileServerProcess = null;
let sessionId = null;

// Start CoinCap MCP server process
function startCoinCapServer() {
  if (coinCapProcess) {
    return;
  }

  coinCapProcess = spawn("node", ["index.js"], {
    cwd: import.meta.dirname,
  });

  coinCapProcess.stderr.on("data", (data) => {
    console.log("[CoinCap Server]", data.toString());
  });

  coinCapProcess.on("close", (code) => {
    console.log(`CoinCap server process exited with code ${code}`);
    coinCapProcess = null;
  });

  console.log("CoinCap MCP server process started");
}

// Start File MCP server process
function startFileServer() {
  if (fileServerProcess) {
    return;
  }

  fileServerProcess = spawn("node", ["file-server.js"], {
    cwd: import.meta.dirname,
  });

  fileServerProcess.stderr.on("data", (data) => {
    console.log("[File Server]", data.toString());
  });

  fileServerProcess.on("close", (code) => {
    console.log(`File server process exited with code ${code}`);
    fileServerProcess = null;
  });

  console.log("File MCP server process started");
}

// Start Mobile MCP server process
function startMobileServer() {
  if (mobileServerProcess) {
    return;
  }

  mobileServerProcess = spawn("node", ["mobile-mcp-server/lib/index.js"], {
    cwd: import.meta.dirname,
  });

  mobileServerProcess.stderr.on("data", (data) => {
    console.log("[Mobile Server]", data.toString());
  });

  mobileServerProcess.on("close", (code) => {
    console.log(`Mobile server process exited with code ${code}`);
    mobileServerProcess = null;
  });

  console.log("Mobile MCP server process started");
}

// Send request to specific MCP server and get response
async function sendToMcp(mcpProcess, serverName, request) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess) {
      reject(new Error(`${serverName} not running`));
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

// Initialize CoinCap MCP connection
app.post("/mcp/coincap/initialize", async (req, res) => {
  try {
    startCoinCapServer();

    const response = await sendToMcp(coinCapProcess, "CoinCap", {
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

// Initialize File MCP connection
app.post("/mcp/file/initialize", async (req, res) => {
  try {
    startFileServer();

    const response = await sendToMcp(fileServerProcess, "File", {
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

// List available tools from CoinCap server
app.post("/mcp/coincap/tools/list", async (req, res) => {
  try {
    const response = await sendToMcp(coinCapProcess, "CoinCap", {
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

// List available tools from File server
app.post("/mcp/file/tools/list", async (req, res) => {
  try {
    const response = await sendToMcp(fileServerProcess, "File", {
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

// Call a tool on CoinCap server
app.post("/mcp/coincap/tools/call", async (req, res) => {
  try {
    const response = await sendToMcp(coinCapProcess, "CoinCap", {
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

// Call a tool on File server
app.post("/mcp/file/tools/call", async (req, res) => {
  try {
    const response = await sendToMcp(fileServerProcess, "File", {
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

// Initialize Mobile MCP connection
app.post("/mcp/mobile/initialize", async (req, res) => {
  try {
    startMobileServer();

    const response = await sendToMcp(mobileServerProcess, "Mobile", {
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

// List available tools from Mobile server
app.post("/mcp/mobile/tools/list", async (req, res) => {
  try {
    const response = await sendToMcp(mobileServerProcess, "Mobile", {
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

// Call a tool on Mobile server
app.post("/mcp/mobile/tools/call", async (req, res) => {
  try {
    const response = await sendToMcp(mobileServerProcess, "Mobile", {
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
    const response = await sendToMcp(coinCapProcess, "CoinCap", {
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
    coinCapServerRunning: coinCapProcess !== null,
    fileServerRunning: fileServerProcess !== null,
    mobileServerRunning: mobileServerProcess !== null,
    sessionId,
  });
});

// Cleanup on exit
process.on("SIGINT", () => {
  if (coinCapProcess) {
    coinCapProcess.kill();
  }
  if (fileServerProcess) {
    fileServerProcess.kill();
  }
  if (mobileServerProcess) {
    mobileServerProcess.kill();
  }
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP wrapper server running on http://0.0.0.0:${PORT}`);
  console.log(`Accessible from local network at http://192.168.1.12:${PORT}`);
  console.log("Starting MCP servers...");
  startCoinCapServer();
  startFileServer();
  startMobileServer();
});

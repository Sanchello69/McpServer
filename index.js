#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import https from "https";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, ".env") });

const COINCAP_API_BASE = "https://rest.coincap.io/v3";
const COINCAP_API_KEY = process.env.COINCAP_API_KEY;

class CoinCapServer {
  constructor() {
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: true,
      keepAlive: true,
    });

    this.server = new Server(
      {
        name: "coincap-mcp-server",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_assets",
          description: "Get a list of cryptocurrency assets with their current prices and market data. You can optionally filter by search term, limit results, or offset for pagination.",
          inputSchema: {
            type: "object",
            properties: {
              search: {
                type: "string",
                description: "Search by asset id (name) or symbol",
              },
              limit: {
                type: "number",
                description: "Max number of results to return (default: 100)",
              },
              offset: {
                type: "number",
                description: "Offset for pagination (default: 0)",
              },
            },
          },
        },
        {
          name: "get_asset_by_id",
          description: "Get detailed information about a specific cryptocurrency asset by its ID (e.g., 'bitcoin', 'ethereum', 'cardano')",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Asset ID (e.g., 'bitcoin', 'ethereum', 'cardano')",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "get_rates",
          description: "Get a list of all exchange rates for various currencies and cryptocurrencies",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "get_rate_by_id",
          description: "Get exchange rate for a specific currency by its ID (e.g., 'bitcoin', 'united-states-dollar', 'euro')",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Rate ID (e.g., 'bitcoin', 'united-states-dollar', 'euro')",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "get_markets",
          description: "Get market data for a specific cryptocurrency, showing all exchange markets where it trades",
          inputSchema: {
            type: "object",
            properties: {
              baseId: {
                type: "string",
                description: "Base asset ID (e.g., 'bitcoin', 'ethereum')",
              },
              limit: {
                type: "number",
                description: "Max number of results (default: 100)",
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_assets":
            return await this.getAssets(args);
          case "get_asset_by_id":
            return await this.getAssetById(args);
          case "get_rates":
            return await this.getRates(args);
          case "get_rate_by_id":
            return await this.getRateById(args);
          case "get_markets":
            return await this.getMarkets(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async makeRequest(endpoint, params = {}) {
    const url = new URL(`${COINCAP_API_BASE}${endpoint}`);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
      }
    });

    const headers = {
      "Accept": "application/json",
      "User-Agent": "coincap-mcp-server/2.0.0",
    };

    if (COINCAP_API_KEY) {
      headers["Authorization"] = `Bearer ${COINCAP_API_KEY}`;
    } else {
      throw new Error("COINCAP_API_KEY is required for CoinCap API v3. Please set it in your .env file.");
    }

    const response = await fetch(url.toString(), {
      headers,
      agent: this.httpsAgent,
    });

    if (!response.ok) {
      let errorMessage = `CoinCap API v3 error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.message || errorData.error) {
          errorMessage += ` - ${errorData.message || errorData.error}`;
        }
      } catch (e) {
        // Если не удалось распарсить JSON, используем стандартное сообщение
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  }

  async getAssets(args) {
    const data = await this.makeRequest("/assets", {
      search: args.search,
      limit: args.limit,
      offset: args.offset,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getAssetById(args) {
    if (!args.id) {
      throw new Error("Asset ID is required");
    }

    const data = await this.makeRequest(`/assets/${args.id}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getRates(args) {
    const data = await this.makeRequest("/rates");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getRateById(args) {
    if (!args.id) {
      throw new Error("Rate ID is required");
    }

    const data = await this.makeRequest(`/rates/${args.id}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getMarkets(args) {
    const data = await this.makeRequest("/markets", {
      baseId: args.baseId,
      limit: args.limit,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("CoinCap MCP server running on stdio");
  }
}

const server = new CoinCapServer();
server.run();

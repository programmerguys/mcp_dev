#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BrowserMonitor } from './browser-monitor.js';
import type { ConsoleLog, NetworkRequest } from './types.js';

interface RequestHandlerExtra {
  [key: string]: unknown;
}

const browserSchema = z
  .object({
    browserType: z.enum(['chrome', 'edge']).optional(),
    port: z.number().optional(),
  })
  .strict();

const consoleSchema = z
  .object({
    limit: z.number().optional(),
    level: z.enum(['log', 'info', 'warn', 'error']).optional(),
  })
  .strict();

const networkSchema = z
  .object({
    limit: z.number().optional(),
    type: z.enum(['xhr', 'fetch', 'all']).optional(),
  })
  .strict();

const elementsSchema = z
  .object({
    selector: z.string().optional(),
    includeChildren: z.boolean().optional(),
  })
  .strict();

const requestSchema = z
  .object({
    requestId: z.string(),
    includeResponse: z.boolean().optional(),
  })
  .strict();

class ConsoleNetworkMonitorServer {
  private server: McpServer;
  private consoleLogs: ConsoleLog[];
  private networkRequests: NetworkRequest[];
  private browserMonitor: BrowserMonitor;

  constructor() {
    this.server = new McpServer({
      name: 'console-network-monitor',
      version: '1.0.0',
    });

    this.consoleLogs = [];
    this.networkRequests = [];
    this.browserMonitor = new BrowserMonitor();

    this.browserMonitor.setConsoleCallback((level, message) => {
      this.addConsoleLog(level, message);
    });

    this.browserMonitor.setNetworkCallback((request) => {
      this.addNetworkRequest(request);
    });

    this.setupHandlers();

    process.on('SIGINT', async () => {
      await this.browserMonitor.disconnect();
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.server.tool(
      'connect_browser',
      'Connect to a browser instance',
      async (extra: RequestHandlerExtra) => {
        const validatedArgs = browserSchema.parse(extra);
        try {
          await this.browserMonitor.connect(validatedArgs);
          return {
            content: [
              {
                type: 'text',
                text: 'Successfully connected to browser',
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Failed to connect to browser: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    this.server.tool(
      'monitor_console',
      'Monitor browser console logs',
      async (extra: RequestHandlerExtra) => {
        const validatedArgs = consoleSchema.parse(extra);
        const limit = validatedArgs.limit || 10;
        const level = validatedArgs.level;

        let logs = this.consoleLogs;
        if (level) {
          logs = logs.filter((log) => log.level === level);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(logs.slice(-limit), null, 2),
            },
          ],
        };
      },
    );

    this.server.tool(
      'monitor_network',
      'Monitor network requests',
      async (extra: RequestHandlerExtra) => {
        const validatedArgs = networkSchema.parse(extra);
        const limit = validatedArgs.limit || 10;
        const type = validatedArgs.type || 'all';

        let requests = this.networkRequests;
        if (type !== 'all') {
          requests = requests.filter((req) => req.type === type);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(requests.slice(-limit), null, 2),
            },
          ],
        };
      },
    );

    this.server.tool(
      'get_page_elements',
      'Get page elements by selector',
      async (extra: RequestHandlerExtra) => {
        const validatedArgs = elementsSchema.parse(extra);
        try {
          const elements = await this.browserMonitor.getPageElements(
            validatedArgs.selector,
            validatedArgs.includeChildren,
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(elements, null, 2),
              },
            ],
          };
        } catch (error) {
          throw new Error(
            `Failed to get page elements: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    this.server.tool(
      'get_request_details',
      'Get details of a specific request',
      async (extra: RequestHandlerExtra) => {
        const validatedArgs = requestSchema.parse(extra);
        const request = this.networkRequests.find((req) => req.id === validatedArgs.requestId);

        if (!request) {
          throw new Error(`Request with ID ${validatedArgs.requestId} not found`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(request, null, 2),
            },
          ],
        };
      },
    );
  }

  private addConsoleLog(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    this.consoleLogs.push({ timestamp, level, message });
  }

  private addNetworkRequest(request: NetworkRequest): void {
    const timestamp = new Date().toISOString();
    const id = request.id || Math.random().toString(36).substr(2, 9);
    this.networkRequests.push({
      ...request,
      id,
      timestamp,
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Console and Network Monitor MCP server is running.');
  }
}

new ConsoleNetworkMonitorServer().start().catch(console.error);

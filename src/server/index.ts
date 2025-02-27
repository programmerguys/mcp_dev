#!/usr/bin/env node

import { EventEmitter } from 'node:events';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { Readable } from 'node:stream';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import type { NetworkRequest, RequestFilter } from '../types/index.js';
import { BrowserMonitor } from './browser-monitor.js';

interface NetworkEvent {
  type: 'request';
  data: NetworkRequest;
}

class BrowserMonitorServer {
  private server: McpServer;
  private browserMonitor: BrowserMonitor;
  private eventEmitter: EventEmitter;
  private transport: SSEServerTransport | null;

  constructor() {
    this.server = new McpServer({
      name: 'browser-monitor',
      version: '1.0.0',
      description: '浏览器监控工具，支持网络请求实时监控和分析',
    });

    this.eventEmitter = new EventEmitter();
    this.browserMonitor = new BrowserMonitor();
    this.transport = null;

    // 设置网络请求回调
    this.browserMonitor.setNetworkCallback((request) => {
      this.eventEmitter.emit('network_request', request);
    });

    // 设置各种工具和资源
    this.setupTools();
    this.setupResources();
    this.setupEventHandlers();

    // 设置进程退出处理
    this.setupProcessHandlers();
  }

  private setupTools(): void {
    console.log('设置 MCP 工具...');

    // 开始监控网络请求
    this.server.tool(
      'start_monitoring',
      {
        port: z.number().optional().default(9222),
        urlPattern: z.string().optional(),
        types: z.array(z.string()).optional(),
      },
      async (params) => {
        console.log('执行 start_monitoring 工具，参数:', params);
        try {
          await this.browserMonitor.connect({ port: params.port });
          console.log('成功连接到浏览器');

          // 设置过滤器
          const filter: RequestFilter = {
            urlPattern: params.urlPattern ?? null,
            types: params.types ?? null,
          };

          if (Object.keys(filter).length > 0) {
            console.log('设置请求过滤器:', filter);
            this.browserMonitor.setRequestFilter(filter);
          }

          return {
            content: [
              {
                type: 'text',
                text: '监控已启动，开始接收网络请求数据',
              },
            ],
          };
        } catch (error) {
          console.error('start_monitoring 工具执行失败:', error);
          throw new Error(
            `监控启动失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // 停止监控
    this.server.tool('stop_monitoring', {}, async () => {
      console.log('执行 stop_monitoring 工具');
      try {
        await this.browserMonitor.disconnect();
        console.log('成功断开浏览器连接');
        return {
          content: [
            {
              type: 'text',
              text: '监控已停止',
            },
          ],
        };
      } catch (error) {
        console.error('stop_monitoring 工具执行失败:', error);
        throw new Error(`停止监控失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    console.log('MCP 工具设置完成');
  }

  private setupResources(): void {
    console.log('设置 MCP 资源...');

    // 实时网络请求流
    this.server.resource('network_stream', 'monitor://network/stream', () => {
      console.log('访问 network_stream 资源');
      return new Promise((resolve) => {
        const requests: NetworkRequest[] = [];

        // 收集最近的请求
        const listener = (request: NetworkRequest) => {
          console.log('收到新的网络请求:', {
            id: request.id,
            method: request.method,
            url: request.url,
            type: request.type,
          });
          requests.push(request);
          // 保持最近 100 条记录
          if (requests.length > 100) {
            requests.shift();
          }
        };

        this.eventEmitter.on('network_request', listener);

        // 返回初始数据
        console.log('返回初始请求数据');
        resolve({
          contents: [
            {
              uri: 'monitor://network/stream',
              text: JSON.stringify({ requests }, null, 2),
            },
          ],
        });

        // 当有新请求时，通过 SSE 推送
        this.eventEmitter.on('network_request', (request: NetworkRequest) => {
          console.log('推送新的网络请求事件');
          const event: NetworkEvent = {
            type: 'request',
            data: request,
          };
          if (this.transport) {
            this.transport.send({
              jsonrpc: '2.0',
              method: 'network_update',
              params: {
                event: event.type,
                data: event.data,
              },
            });
          }
        });
      });
    });

    console.log('MCP 资源设置完成');
  }

  private setupEventHandlers(): void {
    // 处理客户端断开连接
    this.eventEmitter.on('client_disconnect', async () => {
      await this.browserMonitor.disconnect();
    });
  }

  private setupProcessHandlers(): void {
    process.on('SIGINT', async () => {
      await this.browserMonitor.disconnect();
      await this.server.close();
      process.exit(0);
    });
  }

  private async handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      console.log('收到 POST 请求:', {
        url: req.url,
        method: req.method,
        headers: req.headers,
      });

      if (this.transport) {
        console.log('找到活动的 SSE 传输，处理 POST 消息');
        console.log('原始请求头:', JSON.stringify(req.headers, null, 2));

        // 创建一个可重用的请求体缓冲区
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => {
          console.log('接收到数据块，大小:', chunk.length);
          chunks.push(Buffer.from(chunk));
        });

        await new Promise((resolve, reject) => {
          req.on('end', () => {
            console.log('请求数据接收完成');
            resolve(null);
          });
          req.on('error', (error) => {
            console.error('请求数据接收错误:', error);
            reject(error);
          });
        });

        const body = Buffer.concat(chunks);
        console.log('POST 请求体:', body.toString());
        console.log('请求体大小:', body.length);

        // 创建一个完整的可读流实现
        const readable = new Readable({
          read() {}, // 空实现，因为我们已经有了所有数据
        });

        // 添加数据并结束流
        readable.push(body);
        readable.push(null);

        // 创建一个完整的事件发射器实现
        const streamEvents = new EventEmitter();
        const originalOn = readable.on.bind(readable);
        const originalRemoveListener = readable.removeListener.bind(readable);

        // 替换原始请求的流，同时保留原始请求的其他属性
        const modifiedReq = Object.assign({}, req, {
          headers: req.headers, // 确保保留原始请求头
          url: req.url, // 保留原始 URL
          method: req.method, // 保留原始方法
          read: readable.read.bind(readable),
          pipe: readable.pipe.bind(readable),
          unpipe: readable.unpipe.bind(readable),
          pause: readable.pause.bind(readable),
          resume: readable.resume.bind(readable),
          // 实现完整的事件监听器接口
          on: (event: string, listener: (...args: unknown[]) => void) => {
            streamEvents.on(event, listener);
            originalOn(event, listener);
            return modifiedReq;
          },
          removeListener: (event: string, listener: (...args: unknown[]) => void) => {
            streamEvents.removeListener(event, listener);
            originalRemoveListener(event, listener);
            return modifiedReq;
          },
          emit: streamEvents.emit.bind(streamEvents),
        });

        console.log('修改后的请求头:', JSON.stringify(modifiedReq.headers, null, 2));

        try {
          console.log('开始处理 POST 消息...');
          await this.transport.handlePostMessage(modifiedReq, res);
          console.log('POST 消息处理完成');
        } catch (error) {
          console.error('transport.handlePostMessage 失败:', error);
          throw error;
        }
      } else {
        console.log('没有找到活动的 SSE 传输');
        res.writeHead(503);
        res.end('No active SSE connection');
      }
    } catch (error) {
      console.error('处理 POST 请求失败:', error);
      if (res.headersSent) {
        console.log('响应头已发送，直接结束响应');
        res.end();
      } else {
        console.log('发送错误响应');
        res.writeHead(500);
        res.end(error instanceof Error ? error.message : String(error));
      }
    }
  }

  private handleSSE(_req: IncomingMessage, res: ServerResponse): void {
    try {
      console.log('处理新的 SSE 连接请求');

      // 创建新的传输实例
      this.transport = new SSEServerTransport('/sse', res);
      console.log('创建了新的 SSE 传输实例');

      // 监听连接关闭
      res.on('close', () => {
        console.log('SSE 连接关闭');
        this.transport = null;
        this.eventEmitter.emit('client_disconnect');
      });

      // 连接到 MCP 服务器
      console.log('正在连接到 MCP 服务器...');
      this.server
        .connect(this.transport)
        .then(() => {
          console.log('成功连接到 MCP 服务器');
        })
        .catch((error) => {
          console.error('MCP 服务器连接失败:', error);
          this.transport = null;
          this.eventEmitter.emit('client_disconnect');
        });

      console.log('SSE 连接设置完成');
    } catch (error) {
      console.error('SSE 连接处理失败:', error);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    }
  }

  async start(): Promise<void> {
    try {
      // 创建 HTTP 服务器
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        console.log(`收到${req.method}请求:`, req.url);

        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // 处理预检请求
        if (req.method === 'OPTIONS') {
          console.log('处理 OPTIONS 预检请求');
          res.writeHead(204);
          res.end();
          return;
        }

        // 解析 URL 和查询参数
        const urlParts = req.url?.split('?')[0];
        console.log('解析后的路径:', urlParts);

        // 根据请求方法和路径处理请求
        if (urlParts === '/sse') {
          if (req.method === 'GET') {
            console.log('处理 SSE GET 请求');
            this.handleSSE(req, res);
          } else if (req.method === 'POST') {
            console.log('处理 SSE POST 请求');
            this.handlePost(req, res).catch((error) => {
              console.error('POST 请求处理失败:', error);
              if (!res.headersSent) {
                res.writeHead(500);
              }
              res.end();
            });
          } else {
            console.log('不支持的请求方法:', req.method);
            res.writeHead(405);
            res.end();
          }
        } else {
          console.log('未知的请求路径:', urlParts);
          res.writeHead(404);
          res.end();
        }
      });

      // 启动 HTTP 服务器
      server.listen(8765, () => {
        console.log('浏览器监控服务已启动，监听端口: 8765');
      });

      // 监听服务器错误
      server.on('error', (error) => {
        console.error('服务器错误:', error);
      });
    } catch (error) {
      console.error('服务启动失败:', error);
      process.exit(1);
    }
  }
}

// 启动服务器
new BrowserMonitorServer().start().catch(console.error);

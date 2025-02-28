#!/usr/bin/env node

/**
 * 浏览器监控服务器
 * 提供基于 MCP (Model Context Protocol) 的浏览器监控服务
 * 
 * 主要功能：
 * 1. 提供 SSE 实时通信 - 支持服务器推送事件
 * 2. 处理网络请求监控 - 实时捕获和分析网络请求
 * 3. 提供 HTTP API 接口 - RESTful API支持
 * 4. 管理浏览器连接 - 多页面监控支持
 * 
 * 技术特点：
 * - 使用 SSE 实现实时通信
 * - 支持 CORS 跨域请求
 * - 支持请求过滤和统计
 * - 优雅的错误处理
 * - 完整的生命周期管理
 * 
 * 使用示例：
 * ```typescript
 * const server = new BrowserMonitorServer();
 * await server.start();
 * ```
 */

import { EventEmitter } from 'node:events';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { Readable } from 'node:stream';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import type { NetworkRequest, RequestFilter } from '../types/index.js';
import { BrowserMonitor } from './browser-monitor.js';

/** 
 * 网络事件接口
 * 定义网络请求事件的数据结构
 */
interface NetworkEvent {
  type: 'request';     // 事件类型，目前只支持 'request'
  data: NetworkRequest; // 请求数据对象
}

/**
 * 浏览器监控服务器类
 * 负责管理浏览器监控实例和处理客户端请求
 * 
 * 主要职责：
 * 1. 管理 MCP 服务器实例
 * 2. 处理 SSE 连接
 * 3. 管理浏览器监控实例
 * 4. 处理网络请求事件
 * 5. 提供 HTTP API
 */
class BrowserMonitorServer {
  private server: McpServer;                    // MCP服务器实例
  private browserMonitor: BrowserMonitor;       // 浏览器监控实例
  private eventEmitter: EventEmitter;           // 事件发射器
  private transport: SSEServerTransport | null; // SSE传输实例

  /**
   * 构造函数
   * 初始化服务器和监控实例
   * 
   * 执行步骤：
   * 1. 创建 MCP 服务器
   * 2. 初始化事件发射器
   * 3. 创建浏览器监控实例
   * 4. 设置网络请求回调
   * 5. 初始化各个组件
   */
  constructor() {
    // 创建MCP服务器
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

    // 初始化各个组件
    this.setupTools();
    this.setupResources();
    this.setupEventHandlers();
    this.setupProcessHandlers();
  }

  /**
   * 设置MCP工具
   * 配置可供客户端调用的工具命令
   * 
   * 支持的工具：
   * 1. start_monitoring - 启动监控
   * 2. stop_monitoring - 停止监控
   */
  private setupTools(): void {
    console.log('设置 MCP 工具...');

    // 启动监控工具
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

          // 设置请求过滤器
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

    // 停止监控工具
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

  /**
   * 设置MCP资源
   * 配置可供客户端访问的资源
   * 
   * 支持的资源：
   * 1. network_stream - 网络请求流，提供实时请求数据
   */
  private setupResources(): void {
    console.log('设置 MCP 资源...');

    // 实时网络请求流资源
    this.server.resource('network_stream', 'monitor://network/stream', () => {
      console.log('访问 network_stream 资源');
      return new Promise((resolve) => {
        const requests: NetworkRequest[] = [];

        // 监听并收集网络请求
        const listener = (request: NetworkRequest) => {
          console.log('收到新的网络请求:', {
            id: request.id,
            method: request.method,
            url: request.url,
            type: request.type,
          });
          requests.push(request);
          // 限制缓存大小
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

        // 通过SSE推送新请求
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

  /**
   * 设置事件处理器
   * 处理客户端连接和断开事件
   * 
   * 支持的事件：
   * - client_disconnect: 客户端断开连接时触发
   */
  private setupEventHandlers(): void {
    // 处理客户端断开连接
    this.eventEmitter.on('client_disconnect', async () => {
      await this.browserMonitor.disconnect();
    });
  }

  /**
   * 设置进程处理器
   * 处理进程退出等系统事件
   * 
   * 支持的信号：
   * - SIGINT: 进程中断信号（Ctrl+C）
   */
  private setupProcessHandlers(): void {
    process.on('SIGINT', async () => {
      await this.browserMonitor.disconnect();
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * 处理POST请求
   * 处理客户端发送的POST请求数据
   * 
   * @param req - HTTP请求对象
   * @param res - HTTP响应对象
   * @throws 如果请求处理失败
   */
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

        // 收集请求体数据
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => {
          console.log('接收到数据块，大小:', chunk.length);
          chunks.push(Buffer.from(chunk));
        });

        // 等待数据接收完成
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

        // 创建可读流
        const readable = new Readable({
          read() {}, // 空实现，因为数据已经完整接收
        });

        // 写入数据并结束流
        readable.push(body);
        readable.push(null);

        // 创建事件发射器
        const streamEvents = new EventEmitter();
        const originalOn = readable.on.bind(readable);
        const originalRemoveListener = readable.removeListener.bind(readable);

        // 构造修改后的请求对象
        const modifiedReq = Object.assign({}, req, {
          headers: req.headers,    // 保留原始请求头
          url: req.url,           // 保留原始URL
          method: req.method,     // 保留原始方法
          read: readable.read.bind(readable),
          pipe: readable.pipe.bind(readable),
          unpipe: readable.unpipe.bind(readable),
          pause: readable.pause.bind(readable),
          resume: readable.resume.bind(readable),
          // 实现事件监听接口
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

  /**
   * 处理SSE连接请求
   * 建立和管理SSE长连接
   * 
   * @param req - HTTP请求对象
   * @param res - HTTP响应对象
   */
  private handleSSE(_req: IncomingMessage, res: ServerResponse): void {
    try {
      console.log('处理新的 SSE 连接请求');

      // 创建SSE传输实例
      this.transport = new SSEServerTransport('/sse', res);
      console.log('创建了新的 SSE 传输实例');

      // 监听连接关闭
      res.on('close', () => {
        console.log('SSE 连接关闭');
        this.transport = null;
        this.eventEmitter.emit('client_disconnect');
      });

      // 连接到MCP服务器
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

  /**
   * 启动服务器
   * 开始监听HTTP请求并处理客户端连接
   * 
   * 功能：
   * 1. 创建HTTP服务器
   * 2. 配置CORS
   * 3. 处理SSE和POST请求
   * 4. 监听服务器错误
   * 
   * @throws 如果服务器启动失败
   */
  async start(): Promise<void> {
    try {
      // 创建HTTP服务器
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        console.log(`收到${req.method}请求:`, req.url);

        // 设置CORS头
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

        // 解析URL
        const urlParts = req.url?.split('?')[0];
        console.log('解析后的路径:', urlParts);

        // 根据路径处理请求
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

      // 启动服务器
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

// 启动服务器实例
new BrowserMonitorServer().start().catch(console.error);

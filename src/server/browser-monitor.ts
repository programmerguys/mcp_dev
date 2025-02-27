import CDP from 'chrome-remote-interface';
import type { Client, Options } from 'chrome-remote-interface';
import type { Browser } from 'puppeteer-core';
import { RequestDatabase, type RequestQuery } from '../core/database.js';
import type { BrowserOptions, NetworkRequest, PageElement, RequestFilter } from '../types/index.js';

type ConsoleCallback = (level: string, message: string) => void;
type NetworkCallback = (request: NetworkRequest) => void;

interface CDPTarget {
  id: string;
  type: string;
  title?: string;
  url: string;
}

interface ConsoleAPICalledParams {
  type: string;
  args: Array<{
    value?: string;
    description?: string;
  }>;
}

interface RequestWillBeSentEvent {
  requestId: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  type: string;
}

interface ResponseReceivedEvent {
  requestId: string;
  response: {
    status: number;
    headers: Record<string, string>;
  };
}

interface LoadingFinishedEvent {
  requestId: string;
  encodedDataLength: number;
}

interface LoadingFailedEvent {
  requestId: string;
  errorText: string;
}

interface BaseDOMNode {
  nodeId: number;
  nodeName: string;
  attributes?: string[];
}

interface DOMNode extends BaseDOMNode {
  nodeType: number;
  localName: string;
  nodeValue: string;
  childNodeCount?: number;
  children?: BaseDOMNode[];
}

interface PerformanceMetrics {
  metrics: Array<{
    name: string;
    value: number;
  }>;
}

interface DOMDocument {
  root: Partial<DOMNode>;
}

interface ResourceTreeFrame {
  id: string;
  url: string;
  securityOrigin?: string;
  mimeType?: string;
}

interface ResourceTreeResource {
  url: string;
  type: string;
  mimeType: string;
}

interface ResourceTree {
  frameTree: {
    frame: ResourceTreeFrame;
    resources: ResourceTreeResource[];
  };
}

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  size?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
}

interface NetworkDomain {
  enable(): Promise<void>;
  requestWillBeSent(handler: (params: RequestWillBeSentEvent) => void): void;
  responseReceived(handler: (params: ResponseReceivedEvent) => void): void;
  loadingFinished(handler: (params: LoadingFinishedEvent) => void): void;
  loadingFailed(handler: (params: LoadingFailedEvent) => void): void;
  getResponseBody(params: { requestId: string }): Promise<{ body: string }>;
}

interface PageDomain {
  enable(): Promise<void>;
  reload(): Promise<void>;
  getResourceTree(): Promise<ResourceTree>;
  captureScreenshot(params: { format: string }): Promise<{ data: string }>;
}

export class BrowserMonitor {
  private client: Client | null;
  private browser: Browser | null;
  private consoleCallback: ConsoleCallback | null;
  private networkCallback: NetworkCallback | null;
  private connected: boolean;
  private networkRequests: Map<string, NetworkRequest>;
  private requestDb: RequestDatabase;
  private requestFilter: RequestFilter;

  constructor(dbPath?: string) {
    this.client = null;
    this.browser = null;
    this.consoleCallback = null;
    this.networkCallback = null;
    this.connected = false;
    this.networkRequests = new Map();
    this.requestDb = new RequestDatabase(dbPath);
    this.requestFilter = {
      urlPattern: null,
      types: null,
    };
  }

  setConsoleCallback(callback: ConsoleCallback): void {
    this.consoleCallback = callback;
  }

  setNetworkCallback(callback: NetworkCallback): void {
    this.networkCallback = callback;
  }

  setRequestFilter(filter: Partial<RequestFilter>): void {
    this.requestFilter = {
      urlPattern: filter.urlPattern ?? null,
      types: filter.types ?? null,
    };
  }

  private shouldProcessRequest(request: NetworkRequest): boolean {
    if (!this.requestFilter.urlPattern && !this.requestFilter.types) {
      return true;
    }

    if (this.requestFilter.urlPattern) {
      try {
        return new RegExp(this.requestFilter.urlPattern).test(request.url);
      } catch (error) {
        console.warn('Invalid URL pattern:', error);
        return false;
      }
    }

    if (this.requestFilter.types) {
      return this.requestFilter.types.includes(request.type);
    }

    return true;
  }

  // 获取所有活跃的网络请求
  async getActiveNetworkRequests(): Promise<NetworkRequest[]> {
    return Array.from(this.networkRequests.values());
  }

  // 获取页面性能指标
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.Performance.getMetrics();
  }

  // 获取DOM树
  async getDOMDocument(): Promise<DOMDocument> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.DOM.getDocument();
  }

  // 获取页面资源树
  async getResourceTree(): Promise<ResourceTree> {
    if (!this.client) throw new Error('Not connected');
    const page = this.client.Page as unknown as PageDomain;
    return await page.getResourceTree();
  }

  // 截取页面截图
  async captureScreenshot(format: 'png' | 'jpeg' = 'png'): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    const page = this.client.Page as unknown as PageDomain;
    const result = await page.captureScreenshot({ format });
    return result.data;
  }

  // 获取所有Cookie
  async getAllCookies(): Promise<{ cookies: Cookie[] }> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.Network.getAllCookies();
  }

  async connect({ port = 9222 }: Partial<BrowserOptions> = {}): Promise<void> {
    try {
      console.log(`尝试连接到浏览器，端口: ${port}`);

      const list = (CDP as unknown as { List: (options: Options) => Promise<CDPTarget[]> }).List;
      const targets = await list({ port });
      console.log('可用的调试目标:', targets);

      // 筛选出所有普通网页（排除 DevTools 页面和 worker）
      const pageTargets = targets.filter(
        (t: CDPTarget) =>
          t.type === 'page' && !t.url.startsWith('devtools://') && !t.title?.startsWith('DevTools'),
      );

      if (pageTargets.length === 0) {
        throw new Error('没有找到可用的页面目标');
      }

      // 连接到所有页面
      console.log('找到以下可监控的页面:');
      for (const target of pageTargets) {
        console.log(`- ${target.title} (${target.url})`);
      }

      // 选择第一个页面作为主连接（为了保持兼容性）
      const mainTarget = pageTargets[0];
      console.log(`\n选择主连接页面: ${mainTarget.title}`);

      this.client = await CDP({
        port,
        target: mainTarget.id,
      });

      this.connected = true;

      const { Network, Console, DOM, Page, Runtime, Performance } = this.client;
      const page = Page as unknown as PageDomain;

      console.log('正在启用必要的域...');
      await Promise.all([
        Network.enable(),
        Console.enable(),
        DOM.enable(),
        page.enable(),
        Runtime.enable(),
        Performance.enable(),
      ]);

      // 为其他页面创建额外的 CDP 连接
      for (let i = 1; i < pageTargets.length; i++) {
        const target = pageTargets[i];
        console.log(`\n连接到额外页面: ${target.title}`);

        try {
          const additionalClient = await CDP({
            port,
            target: target.id,
          });

          // 为额外页面启用网络监控
          const { Network } = additionalClient;
          await Network.enable();

          // 设置网络请求监听
          this.setupNetworkListeners(Network, `[${target.title}] `);
        } catch (error) {
          console.error(`连接到页面 ${target.title} 失败:`, error);
        }
      }

      // 设置主连接的网络请求监听
      this.setupNetworkListeners(Network);

      // 设置控制台监听
      Runtime.consoleAPICalled((params: ConsoleAPICalledParams) => {
        console.log('收到控制台消息:', params);
        if (this.consoleCallback) {
          const message = params.args.map((arg) => arg.value || arg.description).join(' ');
          this.consoleCallback(params.type, message);
        }
      });

      console.log('所有域已启用');
    } catch (err) {
      console.error('连接到浏览器时出错:', err);
      throw err;
    }
  }

  private setupNetworkListeners(Network: NetworkDomain, prefix = ''): void {
    Network.requestWillBeSent((params: RequestWillBeSentEvent) => {
      const requestId = prefix + params.requestId;
      const request: NetworkRequest = {
        id: requestId,
        timestamp: new Date().toISOString(),
        method: params.request.method,
        url: params.request.url,
        headers: params.request.headers,
        type: params.type,
        status: 0,
        responseHeaders: {},
        responseSize: 0,
        error: '',
      };

      this.networkRequests.set(requestId, request);
    });

    Network.responseReceived((params: ResponseReceivedEvent) => {
      const requestId = prefix + params.requestId;
      const request = this.networkRequests.get(requestId);
      if (request) {
        request.status = params.response.status;
        request.responseHeaders = params.response.headers;

        if (this.shouldProcessRequest(request) && this.networkCallback) {
          this.networkCallback(request);
        }
      }
    });

    Network.loadingFinished((params: LoadingFinishedEvent) => {
      const requestId = prefix + params.requestId;
      const request = this.networkRequests.get(requestId);
      if (request) {
        request.responseSize = params.encodedDataLength;

        if (this.shouldProcessRequest(request) && this.networkCallback) {
          this.networkCallback(request);
        }
      }
    });

    Network.loadingFailed((params: LoadingFailedEvent) => {
      const requestId = prefix + params.requestId;
      const request = this.networkRequests.get(requestId);
      if (request) {
        request.error = params.errorText || '未知错误';

        if (this.shouldProcessRequest(request) && this.networkCallback) {
          this.networkCallback(request);
        }
      }
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  async getPageElements(selector = '*', includeChildren = true): Promise<PageElement[]> {
    if (!this.connected || !this.client) {
      throw new Error('未连接到浏览器');
    }

    try {
      console.log(`正在查找元素: ${selector}`);
      const { DOM } = this.client;

      const { root } = await DOM.getDocument();
      console.log('获取到根节点:', root.nodeId);

      const { nodeIds } = await DOM.querySelectorAll({
        nodeId: root.nodeId,
        selector,
      });
      console.log(`找到 ${nodeIds.length} 个匹配的元素`);

      const elements: PageElement[] = [];

      for (const nodeId of nodeIds) {
        const { node } = await DOM.describeNode({ nodeId, depth: includeChildren ? 1 : 0 });
        const id = node.attributes?.find(
          (_: string, i: number) => node.attributes?.[i - 1] === 'id',
        );
        const className = node.attributes?.find(
          (_: string, i: number) => node.attributes?.[i - 1] === 'class',
        );

        elements.push({
          tag: node.nodeName.toLowerCase(),
          id,
          class: className,
          children: node.children?.map((child: BaseDOMNode) => {
            const childId = child.attributes?.find(
              (_: string, i: number) => child.attributes?.[i - 1] === 'id',
            );
            const childClass = child.attributes?.find(
              (_: string, i: number) => child.attributes?.[i - 1] === 'class',
            );
            return {
              tag: child.nodeName.toLowerCase(),
              id: childId,
              class: childClass,
            };
          }),
        });
      }

      return elements;
    } catch (error) {
      console.error('获取页面元素失败:', error);
      throw error;
    }
  }

  // 添加刷新页面的公共方法
  async reloadPage(): Promise<void> {
    if (!this.connected || !this.client) {
      throw new Error('未连接到浏览器');
    }
    const page = this.client.Page as unknown as PageDomain;
    await page.reload();
  }

  // 添加新的查询方法
  async queryRequests(query: RequestQuery): Promise<NetworkRequest[]> {
    return this.requestDb.queryRequests(query);
  }

  async getRequestStats(): Promise<{
    totalCount: number;
    typeStats: Record<string, number>;
    statusStats: Record<string, number>;
  }> {
    return this.requestDb.getRequestStats();
  }

  async clearOldRequests(days: number): Promise<number> {
    return this.requestDb.clearOldRequests(days);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.connected = false;
    this.networkRequests.clear();
    this.requestDb.close();
  }

  // 添加公共方法用于保存请求
  async saveRequest(request: NetworkRequest): Promise<void> {
    await this.requestDb.saveRequest(request);
  }
}

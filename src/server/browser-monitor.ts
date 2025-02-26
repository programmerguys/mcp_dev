import CDP from 'chrome-remote-interface';
import type { Client, Options } from 'chrome-remote-interface';
import type { Browser } from 'puppeteer-core';
import type { BrowserOptions, NetworkRequest, PageElement } from './types.js';

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

export class BrowserMonitor {
  private client: Client | null;
  private browser: Browser | null;
  private consoleCallback: ConsoleCallback | null;
  private networkCallback: NetworkCallback | null;
  private connected: boolean;
  private networkRequests: Map<string, NetworkRequest>;

  constructor() {
    this.client = null;
    this.browser = null;
    this.consoleCallback = null;
    this.networkCallback = null;
    this.connected = false;
    this.networkRequests = new Map();
  }

  setConsoleCallback(callback: ConsoleCallback): void {
    this.consoleCallback = callback;
  }

  setNetworkCallback(callback: NetworkCallback): void {
    this.networkCallback = callback;
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
    return await this.client.Page.getResourceTree();
  }

  // 截取页面截图
  async captureScreenshot(format: 'png' | 'jpeg' = 'png'): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.Page.captureScreenshot({ format });
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

      if (targets.length === 0) {
        throw new Error('没有找到可用的调试目标');
      }

      const target = targets.find(
        (t: CDPTarget) =>
          t.type === 'page' && !t.url.startsWith('devtools://') && !t.title?.startsWith('DevTools'),
      );

      if (!target) {
        throw new Error('没有找到可用的页面目标');
      }

      console.log('正在连接到目标:', {
        id: target.id,
        title: target.title,
        url: target.url,
      });

      this.client = await CDP({
        port,
        target: target.id,
      });

      this.connected = true;

      const { Network, Console, DOM, Page, Runtime, Performance } = this.client;

      console.log('正在启用必要的域...');
      await Promise.all([
        Network.enable(),
        Console.enable(),
        DOM.enable(),
        Page.enable(),
        Runtime.enable(),
        Performance.enable(),
      ]);
      console.log('域已启用');

      Runtime.consoleAPICalled((params: ConsoleAPICalledParams) => {
        console.log('收到控制台消息:', params);
        if (this.consoleCallback) {
          const message = params.args.map((arg) => arg.value || arg.description).join(' ');
          this.consoleCallback(params.type, message);
        }
      });

      Network.requestWillBeSent(({ requestId, request, type }: RequestWillBeSentEvent) => {
        console.log('检测到网络请求:', requestId);
        const networkRequest: NetworkRequest = {
          id: requestId,
          type: type.toLowerCase(),
          method: request.method,
          url: request.url,
          headers: request.headers,
          timestamp: new Date().toISOString(),
        };
        this.networkRequests.set(requestId, networkRequest);
        if (this.networkCallback) {
          this.networkCallback(networkRequest);
        }
      });

      Network.responseReceived(async ({ requestId, response }: ResponseReceivedEvent) => {
        console.log('收到网络响应:', requestId);
        if (this.networkCallback) {
          try {
            const responseBody = await Network.getResponseBody({ requestId });
            const networkRequest = this.networkRequests.get(requestId);
            if (networkRequest) {
              const updatedRequest: NetworkRequest = {
                ...networkRequest,
                type: 'response',
                status: response.status,
                headers: response.headers,
                body: responseBody.body,
                timestamp: new Date().toISOString(),
              };
              this.networkRequests.set(requestId, updatedRequest);
              this.networkCallback(updatedRequest);
            }
          } catch (error) {
            console.error('获取响应体失败:', error);
          }
        }
      });

      console.log('成功连接到浏览器并设置了所有监听器');
    } catch (err) {
      console.error('连接到浏览器时出错:', err);
      throw err;
    }
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
  }
}

/**
 * 浏览器监控核心模块
 * 基于 Chrome DevTools Protocol 实现浏览器调试和监控功能
 * 主要功能：
 * 1. 网络请求监控
 * 2. 控制台日志捕获
 * 3. DOM 操作
 * 4. 页面性能指标采集
 * 5. Cookie 管理
 */

import CDP from 'chrome-remote-interface';
import type { Client, Options } from 'chrome-remote-interface';
import type { Browser } from 'puppeteer-core';
import { RequestDatabase, type RequestQuery } from '../core/database.js';
import type { BrowserOptions, NetworkRequest, PageElement, RequestFilter } from '../types/index.js';

/** 控制台日志回调函数类型 */
type ConsoleCallback = (level: string, message: string) => void;
/** 网络请求回调函数类型 */
type NetworkCallback = (request: NetworkRequest) => void;

/** Chrome 调试目标接口 */
interface CDPTarget {
  id: string;          // 目标ID
  type: string;        // 目标类型
  title?: string;      // 页面标题
  url: string;         // 页面URL
}

/** 控制台API调用参数接口 */
interface ConsoleAPICalledParams {
  type: string;        // 日志类型
  args: Array<{        // 日志参数
    value?: string;    // 参数值
    description?: string; // 参数描述
  }>;
}

/** 网络请求发送事件接口 */
interface RequestWillBeSentEvent {
  requestId: string;   // 请求ID
  request: {
    method: string;    // 请求方法
    url: string;       // 请求URL
    headers: Record<string, string>; // 请求头
  };
  type: string;        // 请求类型
}

/** 网络响应接收事件接口 */
interface ResponseReceivedEvent {
  requestId: string;   // 请求ID
  response: {
    status: number;    // 响应状态码
    headers: Record<string, string>; // 响应头
  };
}

/** 加载完成事件接口 */
interface LoadingFinishedEvent {
  requestId: string;   // 请求ID
  encodedDataLength: number; // 编码后数据长度
}

/** 加载失败事件接口 */
interface LoadingFailedEvent {
  requestId: string;   // 请求ID
  errorText: string;   // 错误信息
}

/** DOM节点基础接口 */
interface BaseDOMNode {
  nodeId: number;      // 节点唯一标识
  nodeName: string;    // 节点名称
  attributes?: string[]; // 节点属性列表
}

/** DOM节点完整接口 */
interface DOMNode extends BaseDOMNode {
  nodeType: number;    // 节点类型（1=元素，3=文本，等）
  localName: string;   // 本地名称（小写标签名）
  nodeValue: string;   // 节点值
  childNodeCount?: number; // 子节点数量
  children?: BaseDOMNode[]; // 子节点列表
}

/** 性能指标接口 */
interface PerformanceMetrics {
  metrics: Array<{
    name: string;      // 指标名称
    value: number;     // 指标值
  }>;
}

/** DOM文档接口 */
interface DOMDocument {
  root: Partial<DOMNode>; // 文档根节点
}

/** 资源树框架接口 */
interface ResourceTreeFrame {
  id: string;          // 框架ID
  url: string;         // 框架URL
  securityOrigin?: string; // 安全源
  mimeType?: string;   // MIME类型
}

/** 资源树资源接口 */
interface ResourceTreeResource {
  url: string;         // 资源URL
  type: string;        // 资源类型
  mimeType: string;    // MIME类型
}

/** 资源树接口 */
interface ResourceTree {
  frameTree: {
    frame: ResourceTreeFrame;    // 主框架
    resources: ResourceTreeResource[]; // 资源列表
  };
}

/** Cookie接口 */
interface Cookie {
  name: string;        // Cookie名称
  value: string;       // Cookie值
  domain: string;      // 所属域名
  path?: string;       // 路径
  expires?: number;    // 过期时间
  size?: number;       // 大小
  httpOnly?: boolean;  // 是否仅HTTP访问
  secure?: boolean;    // 是否安全Cookie
  session?: boolean;   // 是否会话Cookie
}

/** 网络域接口 */
interface NetworkDomain {
  /** 启用网络监控 */
  enable(): Promise<void>;
  /** 监听请求发送事件 */
  requestWillBeSent(handler: (params: RequestWillBeSentEvent) => void): void;
  /** 监听响应接收事件 */
  responseReceived(handler: (params: ResponseReceivedEvent) => void): void;
  /** 监听加载完成事件 */
  loadingFinished(handler: (params: LoadingFinishedEvent) => void): void;
  /** 监听加载失败事件 */
  loadingFailed(handler: (params: LoadingFailedEvent) => void): void;
  /** 获取响应体内容 */
  getResponseBody(params: { requestId: string }): Promise<{ body: string }>;
}

/** 页面域接口 */
interface PageDomain {
  /** 启用页面监控 */
  enable(): Promise<void>;
  /** 刷新页面 */
  reload(): Promise<void>;
  /** 获取资源树 */
  getResourceTree(): Promise<ResourceTree>;
  /** 截取页面截图 */
  captureScreenshot(params: { format: string }): Promise<{ data: string }>;
}

/**
 * 浏览器监控类
 * 负责与浏览器建立连接并进行各种监控操作
 * 
 * 主要功能：
 * 1. 网络请求监控 - 实时捕获和分析网络请求
 * 2. 控制台日志 - 监控浏览器控制台输出
 * 3. DOM操作 - 查询和操作页面DOM元素
 * 4. 性能监控 - 收集页面性能指标
 * 5. Cookie管理 - 读取和管理浏览器Cookie
 * 6. 截图功能 - 捕获页面截图
 * 7. 资源监控 - 跟踪页面资源加载
 * 
 * 使用示例：
 * ```typescript
 * const monitor = new BrowserMonitor();
 * await monitor.connect();
 * monitor.setNetworkCallback((request) => {
 *   console.log('收到请求:', request);
 * });
 * ```
 */
export class BrowserMonitor {
  private client: Client | null;               // CDP客户端
  private browser: Browser | null;             // 浏览器实例
  private consoleCallback: ConsoleCallback | null;  // 控制台回调
  private networkCallback: NetworkCallback | null;  // 网络请求回调
  private connected: boolean;                  // 连接状态
  private networkRequests: Map<string, NetworkRequest>;  // 网络请求缓存
  private requestDb: RequestDatabase;          // 请求数据库
  private requestFilter: RequestFilter;         // 请求过滤器

  /**
   * 构造函数
   * @param dbPath 数据库路径，可选，默认使用内存数据库
   */
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

  /**
   * 设置控制台日志回调
   * @param callback 回调函数，接收日志级别和消息
   */
  setConsoleCallback(callback: ConsoleCallback): void {
    this.consoleCallback = callback;
  }

  /**
   * 设置网络请求回调
   * @param callback 回调函数，接收网络请求对象
   */
  setNetworkCallback(callback: NetworkCallback): void {
    this.networkCallback = callback;
  }

  /**
   * 设置请求过滤器
   * @param filter 过滤器配置，包含URL模式和请求类型
   */
  setRequestFilter(filter: Partial<RequestFilter>): void {
    this.requestFilter = {
      urlPattern: filter.urlPattern ?? null,
      types: filter.types ?? null,
    };
  }

  /**
   * 判断是否需要处理该请求
   * @param request 网络请求对象
   * @returns 是否需要处理
   */
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

  /**
   * 获取所有当前活跃的网络请求
   * @returns 网络请求数组
   */
  async getActiveNetworkRequests(): Promise<NetworkRequest[]> {
    return Array.from(this.networkRequests.values());
  }

  /**
   * 获取页面性能指标
   * @returns 性能指标对象
   * @throws 如果未连接到浏览器
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.Performance.getMetrics();
  }

  /**
   * 获取页面DOM树
   * @returns DOM文档对象
   * @throws 如果未连接到浏览器
   */
  async getDOMDocument(): Promise<DOMDocument> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.DOM.getDocument();
  }

  /**
   * 获取页面资源树
   * @returns 资源树对象
   * @throws 如果未连接到浏览器
   */
  async getResourceTree(): Promise<ResourceTree> {
    if (!this.client) throw new Error('Not connected');
    const page = this.client.Page as unknown as PageDomain;
    return await page.getResourceTree();
  }

  /**
   * 截取页面截图
   * @param format 图片格式，支持 png 或 jpeg
   * @returns base64编码的图片数据
   * @throws 如果未连接到浏览器
   */
  async captureScreenshot(format: 'png' | 'jpeg' = 'png'): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    const page = this.client.Page as unknown as PageDomain;
    const result = await page.captureScreenshot({ format });
    return result.data;
  }

  /**
   * 获取所有Cookie
   * @returns Cookie数组
   * @throws 如果未连接到浏览器
   */
  async getAllCookies(): Promise<{ cookies: Cookie[] }> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.Network.getAllCookies();
  }

  /**
   * 连接到浏览器
   * @param options 连接选项，包含端口号
   * @throws 如果连接失败
   */
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

  /**
   * 设置网络请求监听器
   * 为指定的网络域设置请求监听，处理请求的整个生命周期
   * 
   * @param Network - 网络域实例
   * @param prefix - 请求ID前缀，用于多页面场景
   */
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

  /**
   * 格式化字节大小
   * 将字节数转换为人类可读的格式
   * 
   * @param bytes - 字节数
   * @returns 格式化后的字符串，如 "1.5 MB"
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * 获取页面元素
   * 根据选择器查询页面元素并返回其属性
   * 
   * @param selector - CSS选择器，默认为 '*'
   * @param includeChildren - 是否包含子元素，默认为 true
   * @returns 页面元素数组
   * @throws 如果未连接到浏览器或查询失败
   * 
   * @example
   * ```typescript
   * // 获取所有按钮
   * const buttons = await monitor.getPageElements('button');
   * // 获取带ID的div（不包含子元素）
   * const divs = await monitor.getPageElements('div[id]', false);
   * ```
   */
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

  /**
   * 刷新页面
   * 重新加载当前页面
   * 
   * @throws 如果未连接到浏览器
   */
  async reloadPage(): Promise<void> {
    if (!this.connected || !this.client) {
      throw new Error('未连接到浏览器');
    }
    const page = this.client.Page as unknown as PageDomain;
    await page.reload();
  }

  /**
   * 查询网络请求
   * 根据条件从数据库中查询网络请求记录
   * 
   * @param query - 查询条件
   * @returns 匹配的网络请求数组
   */
  async queryRequests(query: RequestQuery): Promise<NetworkRequest[]> {
    return this.requestDb.queryRequests(query);
  }

  /**
   * 获取请求统计信息
   * 返回请求总数和各类型请求的统计数据
   * 
   * @returns 统计信息对象
   */
  async getRequestStats(): Promise<{
    totalCount: number;
    typeStats: Record<string, number>;
    statusStats: Record<string, number>;
  }> {
    return this.requestDb.getRequestStats();
  }

  /**
   * 清理旧请求记录
   * 删除指定天数之前的请求记录
   * 
   * @param days - 保留天数
   * @returns 删除的记录数
   */
  async clearOldRequests(days: number): Promise<number> {
    return this.requestDb.clearOldRequests(days);
  }

  /**
   * 断开连接
   * 关闭所有连接并清理资源
   */
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

  /**
   * 保存网络请求
   * 将请求记录保存到数据库
   * 
   * @param request - 网络请求对象
   */
  async saveRequest(request: NetworkRequest): Promise<void> {
    await this.requestDb.saveRequest(request);
  }
}

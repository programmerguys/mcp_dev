declare module 'chrome-remote-interface' {
  export interface Target {
    id: string;
    type: string;
    title?: string;
    url: string;
    webSocketDebuggerUrl?: string;
  }

  export interface RequestWillBeSentParams {
    requestId: string;
    request: {
      method: string;
      url: string;
      headers: Record<string, string>;
    };
    type: string;
  }

  export interface ResponseReceivedParams {
    requestId: string;
    response: {
      status: number;
      headers: Record<string, string>;
    };
  }

  export interface LoadingFinishedParams {
    requestId: string;
    encodedDataLength: number;
    timestamp: number;
  }

  export interface LoadingFailedParams {
    requestId: string;
    errorText: string;
    canceled?: boolean;
    blockedReason?: string;
  }

  export interface Client {
    Network: {
      enable: () => Promise<void>;
      requestWillBeSent: (callback: (params: RequestWillBeSentParams) => void) => void;
      responseReceived: (callback: (params: ResponseReceivedParams) => void) => void;
      loadingFinished: (callback: (params: LoadingFinishedParams) => void) => void;
      loadingFailed: (callback: (params: LoadingFailedParams) => void) => void;
      getResponseBody: (params: { requestId: string }) => Promise<{ body: string }>;
      getAllCookies: () => Promise<{
        cookies: Array<{ name: string; value: string; domain: string }>;
      }>;
    };
    Console: {
      enable: () => Promise<void>;
    };
    DOM: {
      enable: () => Promise<void>;
      getDocument: () => Promise<{ root: { nodeId: number } }>;
      querySelectorAll: (params: { nodeId: number; selector: string }) => Promise<{
        nodeIds: number[];
      }>;
      describeNode: (params: { nodeId: number; depth?: number }) => Promise<{
        node: {
          nodeId: number;
          nodeName: string;
          attributes?: string[];
          children?: Array<{
            nodeId: number;
            nodeName: string;
            attributes?: string[];
          }>;
        };
      }>;
    };
    Page: {
      enable: () => Promise<void>;
      getResourceTree: () => Promise<{
        frameTree: {
          frame: {
            id: string;
            url: string;
          };
          resources: Array<{
            url: string;
            type: string;
            mimeType: string;
          }>;
        };
      }>;
      captureScreenshot: (params: { format?: 'png' | 'jpeg' }) => Promise<{ data: string }>;
    };
    Runtime: {
      enable: () => Promise<void>;
      consoleAPICalled: (
        callback: (params: {
          type: string;
          args: Array<{
            value?: string;
            description?: string;
          }>;
        }) => void,
      ) => void;
    };
    Performance: {
      enable: () => Promise<void>;
      getMetrics: () => Promise<{
        metrics: Array<{
          name: string;
          value: number;
        }>;
      }>;
    };
    close: () => Promise<void>;
  }

  export interface Options {
    port?: number;
    host?: string;
    target?: string | ((targets: Target[]) => Target | undefined);
  }

  export default function CDP(options?: Options): Promise<Client>;
  export function List(options?: { port?: number; host?: string }): Promise<Target[]>;
}

declare module 'chrome-remote-interface/types/protocol' {
  export interface Protocol {
    // 这里可以添加更多具体的协议类型定义
  }
  export default Protocol;
}

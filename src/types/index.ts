export interface NetworkRequest {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  type: string;
  status: number;
  responseHeaders: Record<string, string>;
  responseSize: number;
  responseBody?: string;
  body?: string;
  encodedDataLength?: number;
  error: string | null;
}

export interface BrowserOptions {
  port?: number;
}

export interface RequestFilter {
  urlPattern: string | null;
  types: string[] | null;
}

export interface PageElement {
  tag: string;
  id?: string;
  class?: string;
  children?: PageElement[];
}

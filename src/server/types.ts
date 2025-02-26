export interface NetworkRequest {
  id: string;
  type: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  status?: number;
  body?: string;
  timestamp: string;
}

export interface PageElement {
  tag: string;
  id?: string;
  class?: string;
  children?: PageElement[];
}

export interface BrowserOptions {
  browserType?: 'chrome' | 'edge';
  port?: number;
}

export interface ConsoleLog {
  timestamp: string;
  level: string;
  message: string;
}

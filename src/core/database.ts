import Database from 'better-sqlite3';
import type { NetworkRequest } from '../types/index.js';

interface DatabaseRow {
  id: string;
  type: string;
  method?: string;
  url?: string;
  status?: string;
  headers?: string;
  responseHeaders?: string;
  responseBody?: string;
  responseSize?: number;
  body?: string;
  timestamp: string;
  encodedDataLength?: number;
  error?: string;
}

export interface RequestQuery {
  type?: string;
  method?: string;
  status?: number | string;
  url?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
  minResponseSize?: number;
  maxResponseSize?: number;
  minStatus?: number;
  maxStatus?: number;
  urlPattern?: string;
  hasError?: boolean;
  responseContentType?: string;
  error?: string;
  sortBy?: 'timestamp' | 'responseSize' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export class RequestDatabase {
  private db: Database.Database;

  constructor(dbPath = ':memory:') {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    // 创建网络请求表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS network_requests (
        id TEXT PRIMARY KEY,
        type TEXT,
        method TEXT,
        url TEXT,
        status TEXT,
        headers TEXT,
        responseHeaders TEXT,
        responseBody TEXT,
        responseSize INTEGER,
        body TEXT,
        timestamp TEXT,
        encodedDataLength INTEGER,
        error TEXT
      )
    `);

    // 创建索引以提高查询性能
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON network_requests(timestamp);
      CREATE INDEX IF NOT EXISTS idx_type ON network_requests(type);
      CREATE INDEX IF NOT EXISTS idx_status ON network_requests(status);
      CREATE INDEX IF NOT EXISTS idx_url ON network_requests(url);
      CREATE INDEX IF NOT EXISTS idx_responseSize ON network_requests(responseSize);
    `);
  }

  async saveRequest(request: NetworkRequest): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO network_requests 
      (id, type, method, url, status, headers, responseHeaders, responseBody, responseSize, body, timestamp, encodedDataLength, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      request.id,
      request.type,
      request.method,
      request.url,
      request.status?.toString(),
      JSON.stringify(request.headers),
      JSON.stringify(request.responseHeaders),
      request.responseBody,
      request.responseSize,
      request.body,
      request.timestamp,
      request.encodedDataLength,
      request.error,
    );
  }

  async queryRequests(query: RequestQuery): Promise<NetworkRequest[]> {
    let sql = 'SELECT * FROM network_requests WHERE 1=1';
    const params: (string | number)[] = [];

    if (query.type && query.type !== 'all') {
      sql += ' AND type = ?';
      params.push(query.type);
    }

    if (query.method) {
      sql += ' AND method = ?';
      params.push(query.method);
    }

    if (query.status) {
      sql += ' AND status = ?';
      params.push(query.status.toString());
    }

    if (query.url) {
      sql += ' AND url LIKE ?';
      params.push(`%${query.url}%`);
    }

    if (query.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(query.startTime);
    }

    if (query.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(query.endTime);
    }

    if (query.minResponseSize) {
      sql += ' AND responseSize >= ?';
      params.push(query.minResponseSize);
    }

    if (query.maxResponseSize) {
      sql += ' AND responseSize <= ?';
      params.push(query.maxResponseSize);
    }

    if (query.minStatus) {
      sql += ' AND CAST(status AS INTEGER) >= ?';
      params.push(query.minStatus);
    }

    if (query.maxStatus) {
      sql += ' AND CAST(status AS INTEGER) <= ?';
      params.push(query.maxStatus);
    }

    if (query.urlPattern) {
      sql += ' AND url REGEXP ?';
      params.push(query.urlPattern);
    }

    if (query.responseContentType) {
      sql += " AND json_extract(responseHeaders, '$.Content-Type') LIKE ?";
      params.push(`%${query.responseContentType}%`);
    }

    if (query.error) {
      sql += ' AND error LIKE ?';
      params.push(`%${query.error}%`);
    }

    // 处理排序
    if (query.sortBy) {
      sql += ` ORDER BY ${query.sortBy}`;
      if (query.sortOrder) {
        sql += ` ${query.sortOrder.toUpperCase()}`;
      }
    } else {
      // 默认按时间戳降序排序
      sql += ' ORDER BY timestamp DESC';
    }

    // 处理分页
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }

    console.log('执行 SQL:', sql);
    console.log('参数:', params);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as DatabaseRow[];

    return rows.map(
      (row): NetworkRequest => ({
        id: row.id,
        type: row.type,
        method: row.method || '',
        url: row.url || '',
        status: row.status ? Number(row.status) : 0,
        headers: row.headers ? JSON.parse(row.headers) : {},
        responseHeaders: row.responseHeaders ? JSON.parse(row.responseHeaders) : {},
        responseBody: row.responseBody || '',
        responseSize: row.responseSize || 0,
        body: row.body,
        timestamp: row.timestamp,
        encodedDataLength: row.encodedDataLength,
        error: row.error || null,
      }),
    );
  }

  async getRequestStats(): Promise<{
    totalCount: number;
    typeStats: Record<string, number>;
    statusStats: Record<string, number>;
  }> {
    const totalCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM network_requests').get() as { count: number }
    ).count;

    interface StatRow {
      type: string;
      count: number;
    }

    const typeRows = this.db
      .prepare(`
        SELECT type, COUNT(*) as count 
        FROM network_requests 
        GROUP BY type
      `)
      .all() as StatRow[];

    const typeStats = typeRows.reduce((acc: Record<string, number>, row) => {
      acc[row.type] = row.count;
      return acc;
    }, {});

    interface StatusRow {
      status: string;
      count: number;
    }

    const statusRows = this.db
      .prepare(`
        SELECT status, COUNT(*) as count 
        FROM network_requests 
        GROUP BY status
      `)
      .all() as StatusRow[];

    const statusStats = statusRows.reduce((acc: Record<string, number>, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});

    return { totalCount, typeStats, statusStats };
  }

  async clearOldRequests(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = this.db
      .prepare(`
      DELETE FROM network_requests 
      WHERE timestamp < ?
    `)
      .run(cutoff.toISOString());

    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}

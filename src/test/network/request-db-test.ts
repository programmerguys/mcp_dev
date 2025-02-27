import { RequestDatabase, type RequestQuery } from '../../core/database.js';
import type { NetworkRequest } from '../../types/index.js';

class RequestDatabaseTest {
  private db: RequestDatabase;

  constructor() {
    this.db = new RequestDatabase(':memory:');
  }

  private formatRequest(request: NetworkRequest): string {
    return `
    请求ID: ${request.id}
    类型: ${request.type}
    方法: ${request.method || 'N/A'}
    URL: ${request.url || 'N/A'}
    状态: ${request.status || 'Pending'}
    时间: ${request.timestamp}
    请求头: ${JSON.stringify(request.headers, null, 2)}
    响应头: ${JSON.stringify(request.responseHeaders, null, 2)}
    响应体大小: ${this.formatBytes(request.responseSize || 0)}
    传输大小: ${request.encodedDataLength ? this.formatBytes(request.encodedDataLength) : 'N/A'}
    响应体预览: ${
      request.responseBody
        ? `${request.responseBody.slice(0, 100)}${request.responseBody.length > 100 ? '...' : ''}`
        : 'N/A'
    }
    错误信息: ${request.error || 'N/A'}
    `;
  }

  async runTests(): Promise<void> {
    console.log('\n=== 开始数据库测试 ===\n');

    try {
      // 1. 测试保存多个请求
      console.log('1. 测试保存请求...');
      const testRequests: NetworkRequest[] = [
        {
          id: '1',
          type: 'xhr',
          method: 'GET',
          url: 'https://api.example.com/test1',
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          timestamp: new Date().toISOString(),
          responseHeaders: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          responseBody: JSON.stringify({ message: 'Success', data: { id: 1, name: 'Test 1' } }),
          responseSize: 256,
          encodedDataLength: 512,
          error: null,
        },
        {
          id: '2',
          type: 'fetch',
          method: 'POST',
          url: 'https://api.example.com/test2',
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          timestamp: new Date().toISOString(),
          responseHeaders: { 'Content-Type': 'application/json', Location: '/test2/new-123' },
          responseBody: JSON.stringify({ status: 'created', id: 'new-123' }),
          responseSize: 128,
          encodedDataLength: 256,
          error: null,
        },
        {
          id: '3',
          type: 'xhr',
          method: 'GET',
          url: 'https://api.example.com/test3',
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1天前
          responseHeaders: { 'Content-Type': 'application/json' },
          responseBody: JSON.stringify({ error: 'Not Found', code: 404 }),
          responseSize: 64,
          encodedDataLength: 128,
          error: null,
        },
        {
          id: '4',
          type: 'fetch',
          method: 'GET',
          url: 'https://api.example.com/test4',
          status: 500,
          headers: { 'Content-Type': 'application/json' },
          timestamp: new Date().toISOString(),
          responseHeaders: { 'Content-Type': 'application/json' },
          responseBody: JSON.stringify({
            error: 'Internal Server Error',
            details: 'Database connection failed',
          }),
          responseSize: 512,
          encodedDataLength: 1024,
          error: 'Database connection failed',
        },
      ];

      for (const request of testRequests) {
        await this.db.saveRequest(request);
      }
      console.log('✓ 成功保存4个测试请求\n');

      // 2. 测试各种查询条件
      console.log('2. 测试查询功能...');

      // 2.1 按响应大小查询（大于256字节的响应）
      const sizeQuery: RequestQuery = {
        minResponseSize: 256,
        limit: 10,
      };
      const sizeResults = await this.db.queryRequests(sizeQuery);
      console.log('\n2.1 大响应查询结果 (>256字节):');
      console.log(`找到 ${sizeResults.length} 个大响应请求`);
      for (const req of sizeResults) {
        console.log(this.formatRequest(req));
      }

      // 2.2 按错误状态查询（4xx和5xx）
      const errorQuery: RequestQuery = {
        minStatus: 400,
        limit: 10,
      };
      const errorResults = await this.db.queryRequests(errorQuery);
      console.log('\n2.2 错误响应查询结果 (状态码>=400):');
      console.log(`找到 ${errorResults.length} 个错误响应`);
      for (const req of errorResults) {
        console.log(this.formatRequest(req));
      }

      // 2.3 按响应类型查询（JSON响应）
      const jsonQuery: RequestQuery = {
        responseContentType: 'application/json',
        limit: 10,
      };
      const jsonResults = await this.db.queryRequests(jsonQuery);
      console.log('\n2.3 JSON响应查询结果:');
      console.log(`找到 ${jsonResults.length} 个JSON响应`);
      for (const req of jsonResults) {
        console.log(this.formatRequest(req));
      }

      // 2.4 按错误信息查询
      const errorMsgQuery: RequestQuery = {
        error: 'database',
        limit: 10,
      };
      const errorMsgResults = await this.db.queryRequests(errorMsgQuery);
      console.log('\n2.4 包含特定错误信息的请求:');
      console.log(`找到 ${errorMsgResults.length} 个匹配请求`);
      for (const req of errorMsgResults) {
        console.log(this.formatRequest(req));
      }

      // 3. 测试统计信息
      console.log('\n3. 测试统计功能...');
      const stats = await this.db.getRequestStats();
      console.log('\n请求统计信息:');
      console.log(`总请求数: ${stats.totalCount}`);

      console.log('\n按类型统计:');
      for (const [type, count] of Object.entries(stats.typeStats)) {
        console.log(`${type}: ${count}个请求`);
      }

      console.log('\n按状态统计:');
      for (const [status, count] of Object.entries(stats.statusStats)) {
        console.log(`状态 ${status}: ${count}个请求`);
      }

      // 4. 测试清理旧请求
      console.log('\n4. 测试清理功能...');
      const deletedCount = await this.db.clearOldRequests(1); // 清理1天前的请求
      console.log(`✓ 成功清理了 ${deletedCount} 个旧请求`);

      // 5. 验证清理结果
      const finalCount = (await this.db.getRequestStats()).totalCount;
      console.log(`清理后剩余请求数: ${finalCount}`);
    } catch (error) {
      console.error('❌ 测试失败:', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.db.close();
      console.log('\n=== 数据库测试完成 ===\n');
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new RequestDatabaseTest();
  test.runTests().catch(console.error);
}

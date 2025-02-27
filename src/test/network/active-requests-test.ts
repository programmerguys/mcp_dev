import type { RequestQuery } from '../../core/database.js';
import type { NetworkRequest } from '../../types/index.js';
import { BaseTest } from '../base-test.js';

export class ActiveRequestsTest extends BaseTest {
  constructor() {
    super('活跃网络请求测试');
  }

  private formatNetworkRequest(request: NetworkRequest): string {
    return `
    请求ID: ${request.id}
    类型: ${request.type}
    方法: ${request.method || 'N/A'}
    URL: ${request.url || 'N/A'}
    状态: ${request.status || 'Pending'}
    时间: ${request.timestamp}
    请求头: ${JSON.stringify(request.headers, null, 2)}
    响应头: ${JSON.stringify(request.responseHeaders, null, 2)}
    响应体大小: ${request.responseSize ? this.formatBytes(request.responseSize) : '0 Bytes'}
    传输大小: ${request.encodedDataLength ? this.formatBytes(request.encodedDataLength) : 'N/A'}
    响应体预览: ${
      request.responseBody
        ? request.responseBody.slice(0, 200) + (request.responseBody.length > 200 ? '...' : '')
        : 'N/A'
    }
    ${request.error ? `错误信息: ${request.error}` : ''}
    `;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  private printRequestsSummary(requests: NetworkRequest[]): void {
    const typeStats = requests.reduce(
      (acc, req) => {
        acc[req.type] = (acc[req.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    console.log('\n=== 网络请求统计 ===');
    console.log(`总请求数: ${requests.length}`);
    console.log('\n请求类型分布:');
    for (const [type, count] of Object.entries(typeStats)) {
      console.log(`${type}: ${count}个请求`);
    }
    console.log('==================\n');
  }

  protected async runTest(): Promise<void> {
    try {
      // 1. 测试实时网络请求监控
      console.log('\n=== 测试实时网络请求监控 ===');
      console.log('开始获取活跃的网络请求...');

      // 刷新页面以产生网络请求
      console.log('刷新页面以产生网络请求...');
      await this.monitor.reloadPage();

      console.log('等待15秒收集请求...\n');
      // 增加等待时间以确保捕获所有请求
      await new Promise((resolve) => setTimeout(resolve, 15000));

      const activeRequests = await this.monitor.getActiveNetworkRequests();
      if (activeRequests.length === 0) {
        console.log('⚠️  当前没有活跃的网络请求');
      } else {
        this.printRequestsSummary(activeRequests);

        // 打印详细的请求信息
        console.log('\n=== 详细请求信息 ===');
        activeRequests.forEach((request, index) => {
          console.log(`\n--- 请求 #${index + 1} ---${this.formatNetworkRequest(request)}`);
        });
      }

      // 2. 测试数据库查询功能
      console.log('\n=== 测试数据库查询功能 ===');

      // 2.1 按类型查询
      const xhrQuery: RequestQuery = {
        type: 'xhr',
        limit: 5,
      };
      console.log('\n查询最近5个XHR请求:');
      const xhrRequests = await this.monitor.queryRequests(xhrQuery);
      console.log(`找到 ${xhrRequests.length} 个XHR请求`);
      let index = 1;
      for (const req of xhrRequests) {
        console.log(`\n--- XHR请求 #${index++} ---${this.formatNetworkRequest(req)}`);
      }

      // 2.2 按时间范围查询
      const timeQuery: RequestQuery = {
        startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 最近5分钟
        limit: 5,
      };
      console.log('\n查询最近5分钟的请求:');
      const recentRequests = await this.monitor.queryRequests(timeQuery);
      console.log(`找到 ${recentRequests.length} 个最近请求`);
      index = 1;
      for (const req of recentRequests) {
        console.log(`\n--- 最近请求 #${index++} ---${this.formatNetworkRequest(req)}`);
      }

      // 3. 测试统计功能
      console.log('\n=== 测试统计功能 ===');
      const stats = await this.monitor.getRequestStats();
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
    } catch (error) {
      console.error('❌ 测试失败:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

// 当直接运行此文件时执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new ActiveRequestsTest();
  test.run().catch(console.error);
}

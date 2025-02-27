import type { NetworkRequest } from '../../types/index.js';
import { BaseTest } from '../base-test.js';

export class NetworkQueryTest extends BaseTest {
  constructor() {
    super('网络请求查询');
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
    响应体大小: ${request.body ? Buffer.from(request.body).length : 0} bytes
    `;
  }

  private printRequestsSummary(requests: NetworkRequest[]): void {
    // 按类型统计请求
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

  private async testGetActiveRequests(): Promise<void> {
    try {
      console.log('\n开始获取活跃的网络请求...');

      const activeRequests = await this.monitor.getActiveNetworkRequests();

      if (activeRequests.length === 0) {
        console.log('⚠️  当前没有活跃的网络请求');
        return;
      }

      // 打印统计信息
      this.printRequestsSummary(activeRequests);

      // 打印详细请求信息
      console.log('=== 详细请求信息 ===');
      activeRequests.forEach((request, index) => {
        console.log(`\n--- 请求 #${index + 1} ---${this.formatNetworkRequest(request)}`);
      });
      console.log('==================\n');
    } catch (error) {
      console.error('❌ 获取网络请求失败:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  protected async runTest(): Promise<void> {
    await this.testGetActiveRequests();

    // 获取性能指标
    console.log('\n=== 获取性能指标 ===');
    try {
      const metrics = await this.monitor.getPerformanceMetrics();
      console.log('✓ 性能指标数据:');
      console.log(JSON.stringify(metrics, null, 2));
    } catch (error) {
      console.error('❌ 获取性能指标失败:', error instanceof Error ? error.message : String(error));
    }
    console.log('==================\n');

    // 获取Cookies
    console.log('=== 获取Cookies ===');
    try {
      const cookies = await this.monitor.getAllCookies();
      console.log('✓ Cookie数据:');
      console.log(JSON.stringify(cookies, null, 2));
    } catch (error) {
      console.error('❌ 获取Cookies失败:', error instanceof Error ? error.message : String(error));
    }
    console.log('==================\n');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }
}

// 当直接运行此文件时执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new NetworkQueryTest();
  test.run().catch(console.error);
}

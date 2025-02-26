import type { NetworkRequest } from '../../server/types.js';
import { BaseTest } from '../base-test.js';

export class NetworkQueryTest extends BaseTest {
  constructor() {
    super('网络请求查询');
  }

  protected async runTest(): Promise<void> {
    try {
      // 等待一些网络请求产生
      console.log('1. 等待网络请求产生...');
      console.log('请在浏览器中访问任意网站');
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // 获取活跃的网络请求
      console.log('\n2. 获取当前活跃的网络请求...');
      const activeRequests = await this.monitor.getActiveNetworkRequests();

      if (activeRequests.length === 0) {
        console.log('⚠️ 未检测到任何网络请求');
      } else {
        console.log(`✓ 检测到 ${activeRequests.length} 个网络请求\n`);

        // 按类型统计请求
        const typeStats = activeRequests.reduce(
          (acc, req) => {
            acc[req.type] = (acc[req.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        console.log('请求类型统计:');
        console.log(JSON.stringify(typeStats, null, 2));

        // 显示详细请求信息
        console.log('\n请求详细信息:');
        activeRequests.forEach((request, index) => {
          console.log(`\n--- 请求 #${index + 1} ---`);
          console.log(
            JSON.stringify(
              {
                id: request.id,
                type: request.type,
                method: request.method,
                url: request.url,
                status: request.status,
                timestamp: request.timestamp,
                headers: request.headers,
                contentLength: request.body?.length || 0,
              },
              null,
              2,
            ),
          );
        });
      }

      // 测试性能指标
      console.log('\n3. 获取性能指标...');
      const metrics = await this.monitor.getPerformanceMetrics();
      console.log('✓ 性能指标:');
      console.log(JSON.stringify(metrics, null, 2));

      // 获取所有 Cookie
      console.log('\n4. 获取所有 Cookie...');
      const cookies = await this.monitor.getAllCookies();
      console.log('✓ Cookie 列表:');
      console.log(JSON.stringify(cookies, null, 2));
    } catch (error) {
      console.error('测试过程中出错:', error);
      throw error;
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

// 当直接运行此文件时执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new NetworkQueryTest();
  test.run().catch(console.error);
}

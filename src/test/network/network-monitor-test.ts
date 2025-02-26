import type { NetworkRequest } from '../../server/types.js';
import { BaseTest } from '../base-test.js';

export class NetworkMonitorTest extends BaseTest {
  private requests: NetworkRequest[] = [];

  constructor() {
    super('网络请求监控');
  }

  protected async setup(): Promise<void> {
    await super.setup();
    this.monitor.setNetworkCallback(this.handleNetworkRequest.bind(this));
  }

  private handleNetworkRequest(request: NetworkRequest): void {
    this.requests.push(request);
    if (request.type === 'response') {
      console.log('\n=== 网络响应 ===');
      console.log(
        JSON.stringify(
          {
            id: request.id,
            url: request.url,
            status: request.status,
            type: request.type,
            contentLength: request.body?.length || 0,
          },
          null,
          2,
        ),
      );
    } else {
      console.log('\n=== 网络请求 ===');
      console.log(
        JSON.stringify(
          {
            id: request.id,
            url: request.url,
            method: request.method,
            type: request.type,
          },
          null,
          2,
        ),
      );
    }
    console.log('===============\n');
  }

  protected async runTest(): Promise<void> {
    console.log('开始监控网络请求...');
    console.log('请在浏览器中进行一些操作以产生网络请求');
    console.log('监控持续 15 秒...\n');

    // 监控 15 秒
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // 输出统计信息
    console.log('\n=== 监控统计 ===');
    console.log(`总请求数: ${this.requests.length}`);
    console.log('请求类型统计:');
    const typeStats = this.requests.reduce(
      (acc, req) => {
        acc[req.type] = (acc[req.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log(JSON.stringify(typeStats, null, 2));
    console.log('===============\n');
  }
}

// 当直接运行此文件时执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new NetworkMonitorTest();
  test.run().catch(console.error);
}

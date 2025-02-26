import type { NetworkRequest } from '../../server/types.js';
import { BaseTest } from '../base-test.js';

export class NetworkTest extends BaseTest {
  private requests: NetworkRequest[] = [];

  constructor() {
    super('网络请求');
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
    // 测试获取所有 Cookie
    console.log('1. 获取所有 Cookie...');
    const cookies = await this.monitor.getAllCookies();
    console.log('✓ Cookie 列表:');
    console.log(JSON.stringify(cookies, null, 2));
    console.log();

    // 测试实时网络请求监控
    console.log('2. 开始监控网络请求...');
    console.log('请在浏览器中访问: https://www.example.com');
    console.log('监控持续 10 秒...\n');
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // 获取活跃的网络请求
    console.log('3. 获取当前活跃的网络请求...');
    const activeRequests = await this.monitor.getActiveNetworkRequests();
    console.log('✓ 活跃的网络请求:');
    console.log(JSON.stringify(activeRequests, null, 2));
    console.log();
  }
}

// 当直接运行此文件时执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new NetworkTest();
  test.run().catch(console.error);
}

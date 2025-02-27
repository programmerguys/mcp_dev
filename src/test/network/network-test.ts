import { NetworkMonitorTest } from './network-monitor-test.js';
import { NetworkQueryTest } from './network-query-test.js';

async function runNetworkTests(): Promise<void> {
  console.log('\n=== 开始网络测试套件 ===\n');

  // 运行主动查询测试
  console.log('运行网络请求查询测试...');
  await new NetworkQueryTest().run();

  // 运行被动监控测试
  console.log('\n运行网络请求监控测试...');
  await new NetworkMonitorTest().run();

  console.log('\n=== 网络测试套件完成 ===\n');
}

// 当直接运行此文件时执行所有网络测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runNetworkTests().catch(console.error);
}

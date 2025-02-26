import { BaseTest } from '../base-test.js';

export class PageTest extends BaseTest {
  constructor() {
    super('页面功能');
  }

  protected async runTest(): Promise<void> {
    // 获取资源树
    console.log('1. 获取资源树...');
    const resourceTree = await this.monitor.getResourceTree();
    console.log('✓ 资源树:');
    console.log(JSON.stringify(resourceTree, null, 2));
    console.log();

    // 截取页面截图
    console.log('2. 截取页面截图...');
    const screenshot = await this.monitor.captureScreenshot();
    console.log(`✓ 截图数据长度: ${screenshot.length}`);
    console.log();

    // 获取性能指标
    console.log('3. 获取性能指标...');
    const metrics = await this.monitor.getPerformanceMetrics();
    console.log('✓ 性能指标:');
    console.log(JSON.stringify(metrics, null, 2));
    console.log();
  }
}

// 当直接运行此文件时执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new PageTest();
  test.run().catch(console.error);
}

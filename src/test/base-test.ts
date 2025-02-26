import { BrowserMonitor } from '../server/browser-monitor.js';

export abstract class BaseTest {
  protected monitor: BrowserMonitor;
  protected testName: string;

  constructor(testName: string) {
    this.monitor = new BrowserMonitor();
    this.testName = testName;
  }

  protected async setup(): Promise<void> {
    console.log(`\n=== ${this.testName} 测试开始 ===\n`);
    console.log('1. 正在连接到浏览器...');
    await this.monitor.connect({ port: 9222 });
    console.log('✓ 成功连接到浏览器\n');
  }

  protected async teardown(): Promise<void> {
    console.log('\n2. 正在断开连接...');
    await this.monitor.disconnect();
    console.log('✓ 已断开连接');
    console.log(`\n=== ${this.testName} 测试结束 ===\n`);
  }

  public async run(): Promise<void> {
    try {
      await this.setup();
      await this.runTest();
    } catch (error) {
      console.error('\n❌ 测试过程中出错:', error instanceof Error ? error.message : String(error));
    } finally {
      await this.teardown();
    }
  }

  protected abstract runTest(): Promise<void>;
}

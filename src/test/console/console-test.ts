import { BaseTest } from '../base-test.js';

export class ConsoleTest extends BaseTest {
  constructor() {
    super('控制台监控');
  }

  protected async setup(): Promise<void> {
    await super.setup();
    this.monitor.setConsoleCallback(this.handleConsoleLog.bind(this));
  }

  private handleConsoleLog(level: string, message: string): void {
    console.log('\n=== 控制台日志 ===');
    console.log(`级别: ${level}`);
    console.log(`消息: ${message}`);
    console.log('==================\n');
  }

  protected async runTest(): Promise<void> {
    console.log('开始监控控制台日志...');
    console.log('请在浏览器的开发者工具控制台中执行以下命令：');
    console.log('console.log("测试日志");');
    console.log('console.info("信息");');
    console.log('console.warn("警告");');
    console.log('console.error("错误");');
    console.log('\n监控持续 10 秒...\n');

    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}

// 当直接运行此文件时执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new ConsoleTest();
  test.run().catch(console.error);
}

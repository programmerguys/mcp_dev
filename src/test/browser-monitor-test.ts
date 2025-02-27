import { ConsoleTest } from './console/console-test.js';
import { DOMTest } from './dom/dom-test.js';
import { PageTest } from './page/page-test.js';

async function runTests(): Promise<void> {
  const tests = [new PageTest(), new DOMTest(), new ConsoleTest()];

  for (const test of tests) {
    await test.run();
  }
}

// 运行所有测试
console.log('\n=== 开始运行所有测试 ===\n');
runTests()
  .then(() => console.log('\n=== 所有测试完成 ===\n'))
  .catch(console.error);

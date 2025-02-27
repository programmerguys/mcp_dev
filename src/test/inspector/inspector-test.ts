import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserMonitor } from '../../server/browser-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startInspectorTest() {
  console.log('启动 MCP Inspector 测试...');

  // 1. 启动浏览器监控服务器
  const monitor = new BrowserMonitor();
  await monitor.connect({ port: 9222 });

  // 2. 启动 HTTP 服务器（SSE 端点）
  const serverProcess = spawn('node', [
    '--import',
    'data:text/javascript,import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("ts-node/esm", pathToFileURL("./"));',
    path.resolve(__dirname, '../../server/index.ts'),
  ]);

  // 3. 输出服务器日志
  serverProcess.stdout.on('data', (data) => {
    console.log(`服务器输出: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`服务器错误: ${data}`);
  });

  // 4. 等待服务器启动
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('\n服务器已启动，现在您可以：');
  console.log('1. 打开 MCP Inspector (https://github.com/modelcontextprotocol/inspector)');
  console.log('2. 连接到 http://localhost:8765/sse');
  console.log('3. 开始监控网络请求\n');

  // 监听进程退出信号
  process.on('SIGINT', async () => {
    console.log('\n正在关闭服务...');
    await monitor.disconnect();
    serverProcess.kill();
    process.exit(0);
  });
}

// 运行测试
startInspectorTest().catch(console.error);

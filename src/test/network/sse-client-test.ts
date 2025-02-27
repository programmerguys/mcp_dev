import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { BrowserMonitor } from '../../server/browser-monitor.js';
import type { NetworkRequest } from '../../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../../data/browser-monitor.db');

// 添加测试数据
async function setupTestData() {
  console.log('设置测试数据...');
  const monitor = new BrowserMonitor(DB_PATH);

  const testRequests: NetworkRequest[] = [
    {
      id: 'test-1',
      type: 'xhr',
      method: 'GET',
      url: 'https://api.example.com/users',
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      responseHeaders: { 'Content-Type': 'application/json' },
      responseBody: JSON.stringify({ users: [{ id: 1, name: 'Test User' }] }),
      responseSize: 256,
      timestamp: new Date().toISOString(),
      error: null,
    },
    {
      id: 'test-2',
      type: 'fetch',
      method: 'POST',
      url: 'https://api.example.com/data',
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      responseHeaders: { 'Content-Type': 'application/json' },
      responseBody: JSON.stringify({ success: true }),
      responseSize: 128,
      timestamp: new Date().toISOString(),
      error: null,
    },
  ];

  for (const request of testRequests) {
    await monitor.saveRequest(request);
  }

  console.log('测试数据设置完成');
}

async function runSseClientTest() {
  console.log('启动 SSE 客户端测试...');

  // 先设置测试数据
  await setupTestData();

  try {
    // 创建 SSE 客户端传输层
    const transport = new SSEClientTransport(new URL('http://localhost:8765/sse'));

    // 创建 MCP 客户端
    const client = new Client({
      name: 'browser-monitor-sse-client',
      version: '1.0.0',
    });

    // 连接到服务器
    await client.connect(transport);
    console.log('已连接到服务器');

    // 1. 列出所有可用工具
    console.log('\n1. 查询可用工具：');
    const tools = await client.listTools();
    console.log(JSON.stringify(tools, null, 2));

    // 2. 开始监控网络请求
    console.log('\n2. 启动网络监控：');
    const startResult = await client.callTool({
      name: 'start_monitoring',
      arguments: {
        port: 9222,
        urlPattern: '.*example\\.com.*',
        types: ['xhr', 'fetch'],
      },
    });
    console.log(JSON.stringify(startResult, null, 2));

    // 3. 读取网络请求流
    console.log('\n3. 读取网络请求流：');
    const streamResult = await client.readResource({
      uri: 'monitor://network/stream',
    });
    console.log(JSON.stringify(streamResult, null, 2));

    // 4. 轮询获取更新
    console.log('\n4. 开始轮询更新...');
    for (let i = 0; i < 10; i++) {
      const result = await client.readResource({
        uri: 'monitor://network/stream',
      });
      console.log(`\n第 ${i + 1} 次更新:`, JSON.stringify(result, null, 2));
      await new Promise((resolve) => setTimeout(resolve, 3000)); // 每3秒轮询一次
    }

    // 5. 停止监控
    console.log('\n5. 停止监控：');
    const stopResult = await client.callTool({
      name: 'stop_monitoring',
      arguments: {},
    });
    console.log(JSON.stringify(stopResult, null, 2));
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 运行测试
runSseClientTest().catch(console.error);

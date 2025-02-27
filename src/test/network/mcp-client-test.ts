import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BrowserMonitor } from '../../server/browser-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, '../../server/index.ts');
const DB_PATH = path.resolve(__dirname, '../../../data/browser-monitor.db');

const REGISTER_IMPORT =
  'data:text/javascript,import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("ts-node/esm", pathToFileURL("./"));';

// 添加测试数据
async function setupTestData() {
  console.log('设置测试数据...');
  const monitor = new BrowserMonitor(DB_PATH);

  // 添加一些测试请求数据
  const testRequests = [
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
    {
      id: 'test-3',
      type: 'xhr',
      method: 'GET',
      url: 'https://api.example.com/error',
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      responseHeaders: { 'Content-Type': 'application/json' },
      responseBody: JSON.stringify({ error: 'Not Found' }),
      responseSize: 64,
      timestamp: new Date().toISOString(),
      error: 'Resource not found',
    },
  ];

  for (const request of testRequests) {
    await monitor.saveRequest(request);
  }

  console.log('测试数据设置完成');
}

async function runMcpClientTest() {
  console.log('启动 MCP 客户端测试...');

  // 先设置测试数据
  await setupTestData();

  // 启动服务器进程
  const serverProcess = spawn('node', ['--import', REGISTER_IMPORT, SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // 创建客户端传输层
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', REGISTER_IMPORT, SERVER_PATH],
  });

  // 创建 MCP 客户端
  const client = new Client(
    {
      name: 'browser-monitor-client',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  try {
    // 连接到服务器
    await client.connect(transport);
    console.log('已连接到服务器');

    // 1. 列出所有可用工具
    console.log('\n1. 查询可用工具：');
    const tools = await client.listTools();
    console.log(JSON.stringify(tools, null, 2));

    // 2. 列出所有可用资源
    console.log('\n2. 查询可用资源：');
    const resources = await client.listResources();
    console.log(JSON.stringify(resources, null, 2));

    // 3. 调用网络请求查询工具
    console.log('\n3. 测试网络请求查询工具：');
    const networkQueryResult = await client.callTool({
      name: 'query_network',
      arguments: {
        type: 'all',
        limit: 10,
        offset: 0,
        sortBy: 'timestamp',
        sortOrder: 'desc',
      },
    });
    console.log(JSON.stringify(networkQueryResult, null, 2));

    // 4. 读取网络统计资源
    console.log('\n4. 读取网络统计资源：');
    const networkStats = await client.readResource({
      uri: 'monitor://network/stats',
    });
    console.log(JSON.stringify(networkStats, null, 2));

    console.log('\n测试完成！');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    // 关闭客户端连接
    await client.close();

    // 关闭服务器进程
    serverProcess.kill();
  }
}

// 运行测试
runMcpClientTest().catch(console.error);

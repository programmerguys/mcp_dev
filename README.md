# Browser Monitor Pro

[![GitHub license](https://img.shields.io/github/license/your-username/browser-monitor-pro)](https://github.com/your-username/browser-monitor-pro/blob/main/LICENSE)
[![npm version](https://img.shields.io/npm/v/browser-monitor-pro)](https://www.npmjs.com/package/browser-monitor-pro)
[![CI Status](https://github.com/your-username/browser-monitor-pro/workflows/CI/badge.svg)](https://github.com/your-username/browser-monitor-pro/actions)
[![Coverage Status](https://coveralls.io/repos/github/your-username/browser-monitor-pro/badge.svg?branch=main)](https://coveralls.io/github/your-username/browser-monitor-pro?branch=main)

Browser Monitor Pro 是一个强大的浏览器监控工具，基于 Model Context Protocol (MCP) 实现，用于实时监控浏览器控制台日志和网络请求。

## ✨ 特性

- 🔍 实时监控浏览器控制台日志
- 🌐 捕获并分析网络请求
- 🎯 DOM 元素查询和分析
- 🔒 安全的数据传输
- 📊 数据可视化支持
- 🔌 插件系统支持
- 🌈 多浏览器支持 (Chrome, Edge)

## 📦 安装

```bash
npm install browser-monitor-pro
```

## 🚀 快速开始

```javascript
import { BrowserMonitor } from 'browser-monitor-pro';

const monitor = new BrowserMonitor();

// 设置控制台日志回调
monitor.setConsoleCallback((level, message) => {
  console.log(`[${level}] ${message}`);
});

// 设置网络请求回调
monitor.setNetworkCallback((request) => {
  console.log('Network request:', request);
});

// 连接到浏览器
await monitor.connect({
  browserType: 'chrome',
  port: 9222
});
```

## 📖 文档

详细文档请访问我们的 [文档站点](https://your-username.github.io/browser-monitor-pro)

## 🤝 贡献

我们欢迎任何形式的贡献！请查看我们的 [贡献指南](CONTRIBUTING.md)。

## 📄 许可证

本项目基于 MIT 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🔗 相关链接

- [更新日志](CHANGELOG.md)
- [问题反馈](https://github.com/your-username/browser-monitor-pro/issues)
- [项目主页](https://github.com/your-username/browser-monitor-pro)

## 🌟 支持我们

如果这个项目对您有帮助，请给我们一个星标 ⭐️ 
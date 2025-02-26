import * as CDP from 'chrome-remote-interface';
import { BaseTest } from '../base-test.js';

interface EvaluateResult {
  tagName: string;
  textContent: string | null;
  className: string;
  id: string;
  innerHTML: string;
}

interface RuntimeClient {
  evaluate(options: {
    expression: string;
    returnByValue?: boolean;
    includeCommandLineAPI?: boolean;
  }): Promise<{
    result: {
      value?: EvaluateResult | null;
      type?: string;
      description?: string;
    };
  }>;
}

export class DOMTest extends BaseTest {
  private client!: CDP.Client;

  constructor() {
    super('DOM 操作');
  }

  private async connect() {
    this.client = await CDP.default();
    await this.client.DOM.enable();
    await this.client.Runtime.enable();
  }

  private async disconnect() {
    if (this.client) {
      await this.client.close();
    }
  }

  private async getSelectedElement(): Promise<EvaluateResult | null> {
    try {
      const runtime = this.client.Runtime as unknown as RuntimeClient;

      // 使用 Runtime.evaluate 获取选中的元素
      const result = await runtime.evaluate({
        expression: `(() => {
                    // 获取当前选中的元素
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const element = range.commonAncestorContainer;
                        if (element.nodeType === 1) { // 元素节点
                            return {
                                tagName: element.nodeName,
                                textContent: element.textContent,
                                className: (element as Element).className,
                                id: (element as Element).id,
                                innerHTML: (element as Element).innerHTML
                            };
                        }
                    }
                    return null;
                })()`,
        returnByValue: true,
        includeCommandLineAPI: true,
      });

      if (result.result?.value) {
        console.log('选中的元素信息:', JSON.stringify(result.result.value, null, 2));
        return result.result.value;
      }
      console.log('未找到选中的元素');
      return null;
    } catch (error) {
      console.error('获取选中元素失败:', error);
      return null;
    }
  }

  protected async runTest(): Promise<void> {
    try {
      await this.connect();
      console.log('开始 DOM 测试...');

      // 获取选中的元素
      console.log('正在获取选中的元素...');
      const selectedElement = await this.getSelectedElement();
      if (selectedElement) {
        console.log('成功获取选中元素的详细信息');
      }
    } catch (error) {
      console.error('DOM 测试失败:', error);
    } finally {
      await this.disconnect();
    }
  }

  public async run(): Promise<void> {
    return this.runTest();
  }
}

// 如果文件作为主模块运行，则执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new DOMTest();
  test.run().catch(console.error);
}

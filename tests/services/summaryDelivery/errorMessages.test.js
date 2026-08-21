const {
  getContentFilterMessage,
  getMessageTooLongErrorMessage,
  getNetworkErrorMessageForTask,
  formatErrorMessage
} = require('../../../src/services/summaryDelivery/errorMessages');

describe('任务错误文案', () => {
  it('内容过滤错误使用专门文案', () => {
    const out = formatErrorMessage(
      Object.assign(new Error('filtered due to the prompt'), { status: 400 })
    );
    expect(out).toBe(getContentFilterMessage());
    expect(out).toContain('🤖 内容安全提醒');
  });

  it('网络错误文案包含转义后的错误信息', () => {
    const out = formatErrorMessage(
      Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
    );
    expect(out).toContain('⚠️ 网络连接错误');
    expect(out).toContain('connect ETIMEDOUT');
    expect(out).toContain('/summary');
  });

  it('消息过长错误使用专门文案', () => {
    const out = formatErrorMessage(new Error('MessageTooLongError: too long'));
    expect(out).toBe(getMessageTooLongErrorMessage());
    expect(out).toContain('⚠️ 消息记录过长');
  });

  it('通用错误转义后展示', () => {
    const out = formatErrorMessage(new Error('bad [thing]'));
    expect(out).toContain('❌ 总结生成失败');
    expect(out).toContain('bad \\[thing]');
  });
});

describe('getNetworkErrorMessageForTask', () => {
  it('使用 metadata 中的消息数量', () => {
    const out = getNetworkErrorMessageForTask({ metadata: { messagesAnalyzed: 250 } });
    expect(out).toContain('/summary 250');
  });

  it('result 缺失时回退默认数量 100', () => {
    const out = getNetworkErrorMessageForTask(undefined);
    expect(out).toContain('/summary 100');
  });
});

const duplicateGuard = require('../../src/middleware/duplicateGuard');

function makeCtx(updateId, text) {
  return {
    update: { update_id: updateId, message: text ? { text, from: { id: 1, username: 'u' } } : undefined }
  };
}

describe('duplicateGuard 中间件', () => {
  afterAll(() => {
    duplicateGuard.cleanup();
  });

  it('首次出现的 update 放行', async () => {
    const next = jest.fn();
    await duplicateGuard(makeCtx(5001), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('重复的 update 被静默丢弃（不调用 next）', async () => {
    const next1 = jest.fn();
    const next2 = jest.fn();
    await duplicateGuard(makeCtx(5002), next1);
    await duplicateGuard(makeCtx(5002), next2);
    expect(next1).toHaveBeenCalledTimes(1);
    expect(next2).not.toHaveBeenCalled();
  });

  it('缺少 update_id 的更新直接放行', async () => {
    const next = jest.fn();
    await duplicateGuard({ update: {} }, next);
    await duplicateGuard({}, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('不同 update_id 互不干扰', async () => {
    const nextA = jest.fn();
    const nextB = jest.fn();
    await duplicateGuard(makeCtx(6001), nextA);
    await duplicateGuard(makeCtx(6002), nextB);
    expect(nextA).toHaveBeenCalledTimes(1);
    expect(nextB).toHaveBeenCalledTimes(1);
  });

  it('cleanup 清空已处理记录后相同 update 可再次通过', async () => {
    await duplicateGuard(makeCtx(7001), jest.fn());
    duplicateGuard.cleanup();
    const next = jest.fn();
    await duplicateGuard(makeCtx(7001), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

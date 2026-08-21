const os = require('os');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(os.tmpdir(), `tsb-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = dbPath;

const messageStore = require('../../src/services/messageStore');

function makeMessage(overrides = {}) {
  return Object.assign({
    message_id: Math.floor(Math.random() * 1000000),
    chat: { id: -100, type: 'supergroup' },
    from: { id: 1, username: 'alice', first_name: 'Alice' },
    text: '你好',
    date: 1700000000
  }, overrides);
}

describe('messageStore（真实 SQLite 临时库）', () => {
  beforeAll(async () => {
    await messageStore.init();
  });

  afterAll(async () => {
    await messageStore.close();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-journal`, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
  });

  beforeEach(async () => {
    await messageStore.deleteChatMessages(-100);
    await messageStore.deleteChatMessages(-200);
  });

  it('存储群组文本消息并按时间升序返回', async () => {
    await messageStore.storeMessage(makeMessage({ message_id: 1, text: '第一条', date: 1700000001 }));
    await messageStore.storeMessage(makeMessage({ message_id: 2, text: '第二条', date: 1700000002 }));
    await messageStore.storeMessage(makeMessage({ message_id: 3, text: '第三条', date: 1700000003 }));

    const rows = await messageStore.getRecentMessages(-100, 10);
    expect(rows).toHaveLength(3);
    expect(rows[0].text).toBe('第一条');
    expect(rows[2].text).toBe('第三条');
    expect(rows.map((r) => r.message_id)).toEqual([1, 2, 3]);
  });

  it('私聊消息与无文本消息不存储', async () => {
    await messageStore.storeMessage(makeMessage({ chat: { id: 999, type: 'private' } }));
    await messageStore.storeMessage(makeMessage({ text: undefined }));
    const rows = await messageStore.getRecentMessages(-100, 10);
    expect(rows).toHaveLength(0);
  });

  it('过滤 bot 自身消息', async () => {
    await messageStore.storeMessage(makeMessage({ message_id: 10 }), 42);
    await messageStore.storeMessage(
      makeMessage({ message_id: 11, from: { id: 42, username: 'bot', first_name: 'Bot' } }),
      42
    );
    const rows = await messageStore.getRecentMessages(-100, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].message_id).toBe(10);
  });

  it('相同 (message_id, chat_id) 的消息只存一次（INSERT OR IGNORE）', async () => {
    await messageStore.storeMessage(makeMessage({ message_id: 20, text: '原文' }));
    await messageStore.storeMessage(makeMessage({ message_id: 20, text: '重复投递' }));
    const rows = await messageStore.getRecentMessages(-100, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('原文');
  });

  it('getChatStats 统计总数、用户数与时间范围', async () => {
    await messageStore.storeMessage(makeMessage({ message_id: 30, from: { id: 1, username: 'a', first_name: 'A' }, date: 1000 }));
    await messageStore.storeMessage(makeMessage({ message_id: 31, from: { id: 2, username: 'b', first_name: 'B' }, date: 2000 }));
    await messageStore.storeMessage(makeMessage({ message_id: 32, from: { id: 1, username: 'a', first_name: 'A' }, date: 3000 }));

    const stats = await messageStore.getChatStats(-100);
    expect(stats.total_messages).toBe(3);
    expect(stats.unique_users).toBe(2);
    expect(stats.earliest_message).toBe(1000);
    expect(stats.latest_message).toBe(3000);
  });

  it('用户改名后 getTopUsers 仍按 user_id 合并计数（不重复计行）', async () => {
    await messageStore.storeMessage(makeMessage({
      message_id: 40,
      from: { id: 7, username: 'old_name', first_name: '旧名' },
      date: 1000
    }));
    await messageStore.storeMessage(makeMessage({
      message_id: 41,
      from: { id: 7, username: 'new_name', first_name: '新名' },
      date: 2000
    }));
    await messageStore.storeMessage(makeMessage({
      message_id: 42,
      from: { id: 8, username: 'other', first_name: '别人' },
      date: 1500
    }));

    const users = await messageStore.getTopUsers(-100, 10);
    expect(users).toHaveLength(2);
    const top = users.find((u) => u.user_id === 7);
    expect(top.message_count).toBe(2);
  });

  it('deleteChatMessages 删除记录并返回统计', async () => {
    await messageStore.storeMessage(makeMessage({ message_id: 50 }));
    await messageStore.storeMessage(makeMessage({ message_id: 51 }));

    const result = await messageStore.deleteChatMessages(-100);
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);

    const stats = await messageStore.getChatStats(-100);
    expect(stats.total_messages).toBe(0);

    const again = await messageStore.deleteChatMessages(-100);
    expect(again.deletedCount).toBe(0);
  });

  it('相同秒内的消息按插入顺序稳定返回', async () => {
    const sameDate = 1700000000;
    await messageStore.storeMessage(makeMessage({ message_id: 70, text: '一', date: sameDate }));
    await messageStore.storeMessage(makeMessage({ message_id: 71, text: '二', date: sameDate }));
    await messageStore.storeMessage(makeMessage({ message_id: 72, text: '三', date: sameDate }));

    const rows = await messageStore.getRecentMessages(-100, 10);
    const sameSecond = rows.filter((r) => r.date === sameDate);
    expect(sameSecond.map((r) => r.text)).toEqual(['一', '二', '三']);
  });

  it('不同群组的数据相互隔离', async () => {
    await messageStore.storeMessage(makeMessage({ message_id: 60, chat: { id: -100, type: 'supergroup' } }));
    await messageStore.storeMessage(makeMessage({ message_id: 61, chat: { id: -200, type: 'supergroup' } }));

    expect((await messageStore.getRecentMessages(-100, 10))).toHaveLength(1);
    expect((await messageStore.getRecentMessages(-200, 10))).toHaveLength(1);
  });
});

describe('admin 工具', () => {
  let isAdmin;
  let getAdminIds;

  function loadAdminModule(envValue) {
    if (envValue === undefined) {
      delete process.env.ADMIN_USER_IDS;
    } else {
      process.env.ADMIN_USER_IDS = envValue;
    }
    jest.resetModules();
    const admin = require('../../src/utils/admin');
    isAdmin = admin.isAdmin;
    getAdminIds = admin.getAdminIds;
  }

  afterEach(() => {
    delete process.env.ADMIN_USER_IDS;
    jest.resetModules();
  });

  it('逗号分隔的 ID 被解析为管理员列表', () => {
    loadAdminModule('111, 222 ,333');
    expect(getAdminIds()).toEqual([111, 222, 333]);
    expect(isAdmin(222)).toBe(true);
    expect(isAdmin(999)).toBe(false);
  });

  it('未配置时管理员列表为空，所有人被拒绝', () => {
    loadAdminModule(undefined);
    expect(getAdminIds()).toEqual([]);
    expect(isAdmin(111)).toBe(false);
  });

  it('非法条目被过滤掉', () => {
    loadAdminModule('111, abc, ,222');
    expect(getAdminIds()).toEqual([111, 222]);
  });

  it('userId 缺失时返回 false', () => {
    loadAdminModule('111');
    expect(isAdmin()).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(0)).toBe(false);
  });
});

/**
 * Customer UI — Test Suite
 * Tests CustomerService CRUD + poin balance logic
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  StyleSheet: { create: (s) => s },
  Alert: { alert: jest.fn() },
  Dimensions: { get: () => ({ width: 1024, height: 768 }) },
  Animated: {
    Value: class {
      constructor(v) { this._v = v; }
      setValue(v) { this._v = v; }
      interpolate() { return {}; }
    },
    timing: () => ({ start: (cb) => cb && cb() }),
    View: 'div',
    Text: 'span',
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

describe('CustomerService — CRUD (Web/localStorage)', () => {
  const { CustomerService } = require('../src/services/customer/CustomerService');

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('getAll returns empty initially', async () => {
    expect(await CustomerService.getAll()).toEqual([]);
  });

  test('create adds customer with generated ID and poin=0', async () => {
    const r = await CustomerService.create({ name: 'Budi', phone: '0811' });
    expect(r.id).toMatch(/^CUST-/);
    expect(r.name).toBe('Budi');
    expect(r.poin).toBe(0);
    expect(await CustomerService.getAll()).toHaveLength(1);
  });

  test('create rejects empty name', async () => {
    await expect(CustomerService.create({ name: '' })).rejects.toThrow('Nama pelanggan wajib diisi');
  });

  test('update changes fields in-place', async () => {
    const c = await CustomerService.create({ name: 'Budi', phone: '0811' });
    const u = await CustomerService.update(c.id, { name: 'Budi Updated', phone: '0822' });
    
    expect(u.name).toBe('Budi Updated');
    expect(u.phone).toBe('0822');
    
    const all = await CustomerService.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Budi Updated');
  });

  test('delete removes customer', async () => {
    const c1 = await CustomerService.create({ name: 'A' });
    const c2 = await CustomerService.create({ name: 'B' });
    expect(await CustomerService.getAll()).toHaveLength(2);

    await CustomerService.delete(c1.id);
    const all = await CustomerService.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('B');
  });

  test('search by name / phone / email', async () => {
    await CustomerService.create({ name: 'Budi', phone: '0811', email: 'b@t.com' });
    await CustomerService.create({ name: 'Ani', phone: '0822', email: 'a@t.com' });
    await CustomerService.create({ name: 'Citra', phone: '0833', email: 'c@t.com' });

    expect(await CustomerService.search('budi')).toHaveLength(1);
    expect(await CustomerService.search('0822')).toHaveLength(1);
    expect(await CustomerService.search('a@t.com')).toHaveLength(1);
    expect(await CustomerService.search('')).toHaveLength(3);
  });

  test('getAll sorts alphabetically', async () => {
    await CustomerService.create({ name: 'Zaki' });
    await CustomerService.create({ name: 'Ani' });
    await CustomerService.create({ name: 'Budi' });

    const names = (await CustomerService.getAll()).map(c => c.name);
    expect(names).toEqual(['Ani', 'Budi', 'Zaki']);
  });

  test('updatePoin add/subtract', async () => {
    const c = await CustomerService.create({ name: 'Budi' });

    await CustomerService.updatePoin(c.id, 150);
    expect((await CustomerService.getById(c.id)).poin).toBe(150);

    await CustomerService.updatePoin(c.id, -50);
    expect((await CustomerService.getById(c.id)).poin).toBe(100);

    await CustomerService.updatePoin(c.id, -200);
    expect((await CustomerService.getById(c.id)).poin).toBe(0);
  });

  test('poin displayed with formatNumber', async () => {
    const { formatNumber } = require('../src/utils/format');
    const c = await CustomerService.create({ name: 'Test' });
    await CustomerService.updatePoin(c.id, 1500);

    const u = await CustomerService.getById(c.id);
    expect(formatNumber(u.poin)).toBe('1.500');
  });
});

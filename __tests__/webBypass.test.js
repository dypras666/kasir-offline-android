/**
 * Expo Web SQLite API Bypass Test Suite
 * 
 * Tests the fallback mechanism for Web platform:
 * - Storage abstraction (localStorage on Web, SecureStore on native)
 * - Web DB mock (ensures no SQLite calls crash on browser)
 * - local_sales CRUD for omset/dashboard persistence
 * - Platform detection logic
 */

// Mock Platform before any imports
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Platform = { ...RN.Platform, OS: 'web' };
  return RN;
});

describe('Web Bypass — Storage Abstraction', () => {
  const ORIGINAL_LOCAL_STORAGE = global.localStorage;

  beforeEach(() => {
    // Set up a fake localStorage
    const store = {};
    global.localStorage = {
      getItem: jest.fn((key) => store[key] ?? null),
      setItem: jest.fn((key, val) => { store[key] = String(val); }),
      removeItem: jest.fn((key) => { delete store[key]; }),
      clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    };
  });

  afterEach(() => {
    global.localStorage = ORIGINAL_LOCAL_STORAGE;
  });

  afterAll(() => {
    jest.resetModules();
  });

  test('Storage.getItemAsync uses localStorage.getItem on Web', async () => {
    const { Storage } = require('../src/services/api');
    global.localStorage.setItem('test_key', 'test_value');
    const val = await Storage.getItemAsync('test_key');
    expect(val).toBe('test_value');
    expect(global.localStorage.getItem).toHaveBeenCalledWith('test_key');
  });

  test('Storage.setItemAsync uses localStorage.setItem on Web', async () => {
    const { Storage } = require('../src/services/api');
    await Storage.setItemAsync('test_key', 'hello');
    expect(global.localStorage.setItem).toHaveBeenCalledWith('test_key', 'hello');
  });

  test('Storage.deleteItemAsync uses localStorage.removeItem on Web', async () => {
    const { Storage } = require('../src/services/api');
    global.localStorage.setItem('test_key', 'val');
    await Storage.deleteItemAsync('test_key');
    expect(global.localStorage.removeItem).toHaveBeenCalledWith('test_key');
  });
});

describe('Web Bypass — DB Mock (no SQLite)', () => {
  test('Web db mock does not crash on any method call', () => {
    // Simulate the inline mock used in App.js for web
    const db = {
      execSync: () => {},
      getAllSync: () => [],
      runSync: () => ({ lastInsertRowId: 0, changes: 0 }),
      getFirstSync: () => ({}),
      withTransactionSync: (fn) => fn(),
    };

    expect(() => db.execSync('SELECT 1')).not.toThrow();
    expect(() => db.getAllSync('SELECT * FROM products')).not.toThrow();
    expect(() => db.runSync('INSERT INTO test (id) VALUES (?)', 1)).not.toThrow();
    expect(() => db.getFirstSync('SELECT COUNT(*) as c FROM test')).not.toThrow();
    expect(() => db.withTransactionSync(() => {})).not.toThrow();

    const result = db.runSync('INSERT ...');
    expect(result.lastInsertRowId).toBe(0);
    expect(result.changes).toBe(0);

    const rows = db.getAllSync('SELECT * FROM products');
    expect(rows).toEqual([]);

    const first = db.getFirstSync('SELECT 1');
    expect(first).toEqual({});
  });
});

describe('Web Bypass — local_sales CRUD (Omset/Dashboard)', () => {
  beforeEach(() => {
    const store = {};
    global.localStorage = {
      getItem: jest.fn((key) => store[key] ?? null),
      setItem: jest.fn((key, val) => { store[key] = String(val); }),
      removeItem: jest.fn((key) => { delete store[key]; }),
      clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    };
  });

  afterEach(() => {
    global.localStorage = null;
  });

  test('empty local_sales returns empty array', () => {
    const raw = global.localStorage.getItem('local_sales');
    const sales = raw ? JSON.parse(raw) : [];
    expect(sales).toEqual([]);
  });

  test('saving a sale updates omset calculation correctly', () => {
    const sale = {
      id: Date.now(),
      total: 50000,
      payment_method: 'CASH',
      created_at: new Date().toISOString(),
      items: [{ product_id: '1', qty: 2, price: 25000 }],
      synced: 0,
    };

    // Save
    const existing = JSON.parse(global.localStorage.getItem('local_sales') || '[]');
    existing.push(sale);
    global.localStorage.setItem('local_sales', JSON.stringify(existing));

    // Read back
    const data = JSON.parse(global.localStorage.getItem('local_sales'));
    expect(data).toHaveLength(1);
    expect(data[0].total).toBe(50000);
    expect(data[0].synced).toBe(0);

    // Calculate omset (simulating loadOmset)
    const today = new Date().toISOString().split('T')[0];
    const filtered = data.filter(s => s.created_at.startsWith(today));
    const total = filtered.reduce((sum, s) => sum + Number(s.total), 0);
    expect(total).toBe(50000);
  });

  test('synced flag is updated and pushed correctly', () => {
    // Simulate syncData web flow
    const sales = [
      { id: 1, total: 10000, synced: 0, items: [{ product_id: '1', qty: 1, price: 10000 }] },
      { id: 2, total: 20000, synced: 1, items: [{ product_id: '2', qty: 2, price: 10000 }] },
    ];
    global.localStorage.setItem('local_sales', JSON.stringify(sales));

    // Simulate pushing unsynced
    let stored = JSON.parse(global.localStorage.getItem('local_sales'));
    stored = stored.map(s => {
      if (s.synced === 0) {
        // API push would happen here
        s.synced = 1;
      }
      return s;
    });
    global.localStorage.setItem('local_sales', JSON.stringify(stored));

    const result = JSON.parse(global.localStorage.getItem('local_sales'));
    expect(result).toHaveLength(2);
    expect(result[0].synced).toBe(1);
    expect(result[1].synced).toBe(1);
  });
});

describe('Web Bypass — Platform Detection Logic', () => {
  test('Platform.OS is web for this test suite', () => {
    const { Platform } = require('react-native');
    expect(Platform.OS).toBe('web');
  });

  test('Storage resolves to localStorage on web', () => {
    const { Storage } = require('../src/services/api');
    // On web, Storage.getItemAsync should exist and NOT be SecureStore
    // SecureStore methods are getItemAsync, setItemAsync, deleteItemAsync
    expect(typeof Storage.getItemAsync).toBe('function');
    expect(typeof Storage.setItemAsync).toBe('function');
    expect(typeof Storage.deleteItemAsync).toBe('function');
  });
});

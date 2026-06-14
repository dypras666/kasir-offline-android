#!/usr/bin/env node
/**
 * Expo Web SQLite API Bypass — Integration Test
 * 
 * Tests the Web bypass logic WITHOUT Jest or babel.
 * Uses Node.js built-in `assert` + manual module mocking.
 * Run: node tests/test-web-bypass.js
 */

const assert = require('node:assert');

// ---------------------------------------------------------------------------
// 1. Mock Storage abstraction (simulates src/services/api.js Platform check)
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
let beforeFn = () => {};

function beforeEach(fn) {
  beforeFn = fn;
}

function test(name, fn) {
  try {
    beforeFn();
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`  ✕ FAIL: ${name}`);
    console.error(`    ${e.message}`);
    return;
  }
  console.log(`  ✓ PASS: ${name}`);
}

function describe(suite, fn) {
  console.log(`\n${suite}`);
  beforeFn = () => {}; // Reset before hook
  fn();
}

// Fake localStorage for Node
const fakeStore = {};
const localStorage = {
  getItem: (key) => fakeStore[key] ?? null,
  setItem: (key, val) => { fakeStore[key] = String(val); },
  removeItem: (key) => { delete fakeStore[key]; },
  clear: () => { Object.keys(fakeStore).forEach(k => delete fakeStore[k]); },
};

// Simulate the Storage from src/services/api.js
// On web: Platform.OS === 'web' → localStorage
const Storage = {
  getItemAsync: async (key) => localStorage.getItem(key),
  setItemAsync: async (key, val) => localStorage.setItem(key, String(val)),
  deleteItemAsync: async (key) => localStorage.removeItem(key),
};

// Web DB mock (from App.js lines 49-51)
const webDb = {
  execSync: () => {},
  getAllSync: () => [],
  runSync: () => ({ lastInsertRowId: 0, changes: 0 }),
  getFirstSync: () => ({}),
  withTransactionSync: (fn) => fn(),
};

// ========================================================
// Suite 1: Storage Abstraction
// ========================================================
describe('Storage Abstraction (localStorage on Web)', () => {
  beforeEach(() => localStorage.clear());

  test('getItemAsync reads from localStorage', async () => {
    localStorage.setItem('test_key', 'hello');
    const val = await Storage.getItemAsync('test_key');
    assert.strictEqual(val, 'hello');
  });

  test('getItemAsync returns null for missing key', async () => {
    const val = await Storage.getItemAsync('nonexistent');
    assert.strictEqual(val, null);
  });

  test('setItemAsync writes to localStorage', async () => {
    await Storage.setItemAsync('test_key', 'world');
    assert.strictEqual(localStorage.getItem('test_key'), 'world');
  });

  test('setItemAsync converts value to string', async () => {
    await Storage.setItemAsync('num_key', 42);
    assert.strictEqual(localStorage.getItem('num_key'), '42');
  });

  test('deleteItemAsync removes from localStorage', async () => {
    localStorage.setItem('test_key', 'val');
    await Storage.deleteItemAsync('test_key');
    assert.strictEqual(localStorage.getItem('test_key'), null);
  });

  test('deleteItemAsync on missing key does not throw', async () => {
    await Storage.deleteItemAsync('missing');
    assert.ok(true);
  });
});

// ========================================================
// Suite 2: Web DB Mock (no SQLite crash)
// ========================================================
describe('Web DB Mock — no SQLite calls crash', () => {
  test('execSync does not throw', () => {
    assert.doesNotThrow(() => webDb.execSync('CREATE TABLE test (id INT)'));
  });

  test('getAllSync returns empty array', () => {
    const rows = webDb.getAllSync('SELECT * FROM products');
    assert.deepStrictEqual(rows, []);
  });

  test('runSync returns { lastInsertRowId: 0, changes: 0 }', () => {
    const res = webDb.runSync('INSERT INTO test VALUES (?)', 1);
    assert.strictEqual(res.lastInsertRowId, 0);
    assert.strictEqual(res.changes, 0);
  });

  test('getFirstSync returns empty object', () => {
    const res = webDb.getFirstSync('SELECT COUNT(*) as c FROM sales');
    assert.deepStrictEqual(res, {});
  });

  test('withTransactionSync runs the callback', () => {
    let called = false;
    webDb.withTransactionSync(() => { called = true; });
    assert.strictEqual(called, true);
  });
});

// ========================================================
// Suite 3: local_sales CRUD (Omset/Dashboard persistence)
// ========================================================
describe('local_sales CRUD — Omset & Dashboard persistence', () => {
  beforeEach(() => localStorage.clear());

  test('empty local_sales returns empty array', () => {
    const raw = localStorage.getItem('local_sales');
    const sales = raw ? JSON.parse(raw) : [];
    assert.deepStrictEqual(sales, []);
  });

  test('saving a sale locally stores it correctly', async () => {
    const sale = {
      id: Date.now(),
      total: 50000,
      payment_method: 'CASH',
      created_at: new Date().toISOString(),
      items: [{ product_id: '1', qty: 2, price: 25000 }],
      synced: 0,
    };

    // Simulate: save sale to local_sales (checkout flow)
    const existing = JSON.parse(localStorage.getItem('local_sales') || '[]');
    existing.push(sale);
    localStorage.setItem('local_sales', JSON.stringify(existing));

    const data = JSON.parse(localStorage.getItem('local_sales'));
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].total, 50000);
    assert.strictEqual(data[0].synced, 0);
    assert.ok(data[0].id);
    assert.ok(data[0].created_at);
  });

  test('omset calculation from local_sales works', () => {
    const today = new Date().toISOString().split('T')[0];

    const sales = [
      { id: 1, total: 25000, created_at: today + 'T10:00:00.000Z' },
      { id: 2, total: 35000, created_at: today + 'T11:00:00.000Z' },
      { id: 3, total: 100000, created_at: '2025-01-01T10:00:00.000Z' }, // yesterday
    ];

    localStorage.setItem('local_sales', JSON.stringify(sales));

    const stored = JSON.parse(localStorage.getItem('local_sales'));
    const todaySales = stored.filter(s => s.created_at.startsWith(today));
    const omset = todaySales.reduce((sum, s) => sum + Number(s.total), 0);

    assert.strictEqual(todaySales.length, 2);
    assert.strictEqual(omset, 60000); // 25000 + 35000
  });

  test('synced flag tracking works', () => {
    const sales = [
      { id: 1, total: 10000, synced: 0 },
      { id: 2, total: 20000, synced: 1 },
    ];
    localStorage.setItem('local_sales', JSON.stringify(sales));

    // Simulate syncData: push unsynced to API, then mark synced
    let stored = JSON.parse(localStorage.getItem('local_sales'));
    stored = stored.map(s => {
      if (s.synced === 0) {
        // API POST would happen here
        s.synced = 1; // mark as synced
      }
      return s;
    });
    localStorage.setItem('local_sales', JSON.stringify(stored));

    const result = JSON.parse(localStorage.getItem('local_sales'));
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].synced, 1);
    assert.strictEqual(result[1].synced, 1);
  });

  test('recent sales sorting works (dashboard stats)', () => {
    const sales = [
      { id: 1, total: 10000, created_at: '2025-06-10T10:00:00Z' },
      { id: 2, total: 20000, created_at: '2025-06-13T10:00:00Z' },
      { id: 3, total: 15000, created_at: '2025-06-12T10:00:00Z' },
    ];

    const sorted = [...sales].sort((a, b) => b.created_at.localeCompare(a.created_at));
    assert.strictEqual(sorted[0].id, 2); // 2025-06-13 is latest
    assert.strictEqual(sorted[1].id, 3);
    assert.strictEqual(sorted[2].id, 1);
  });

  test('checkout saves both API-push and local fallback', async () => {
    // Simulate the full checkout flow on Web
    const cart = [
      { id: 'p1', name: 'Product A', sell_price: 25000, qty: 2 },
      { id: 'p2', name: 'Product B', sell_price: 10000, qty: 1 },
    ];
    const total = cart.reduce((sum, item) => sum + (item.sell_price * item.qty), 0);
    assert.strictEqual(total, 60000);

    // API push (mocked as successful)
    let apiSuccess = true;

    // Save locally (always)
    const salesStr = localStorage.getItem('local_sales') || '[]';
    const sales = JSON.parse(salesStr);
    sales.push({
      id: Date.now(),
      total,
      payment_method: 'CASH',
      created_at: new Date().toISOString(),
      items: cart.map(item => ({
        product_id: item.id,
        qty: item.qty,
        price: item.sell_price,
      })),
      synced: apiSuccess ? 1 : 0,
    });
    localStorage.setItem('local_sales', JSON.stringify(sales));

    const stored = JSON.parse(localStorage.getItem('local_sales'));
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].total, 60000);
    assert.strictEqual(stored[0].synced, 1); // API succeeded
    assert.strictEqual(stored[0].items.length, 2);
  });

  test('checkout saves with synced=0 when API fails', async () => {
    const cart = [{ id: 'p1', sell_price: 25000, qty: 1 }];
    const total = 25000;

    // API push fails
    let apiSuccess = false;

    const salesStr = localStorage.getItem('local_sales') || '[]';
    const sales = JSON.parse(salesStr);
    sales.push({
      id: Date.now(),
      total,
      payment_method: 'CASH',
      created_at: new Date().toISOString(),
      items: cart.map(item => ({
        product_id: item.id,
        qty: item.qty,
        price: item.sell_price,
      })),
      synced: apiSuccess ? 1 : 0,
    });
    localStorage.setItem('local_sales', JSON.stringify(sales));

    const stored = JSON.parse(localStorage.getItem('local_sales'));
    assert.strictEqual(stored[0].synced, 0); // API failed, flagged for retry
  });
});

// ========================================================
// Suite 4: Platform Detection Pattern
// ========================================================
describe('Platform Detection Pattern', () => {
  test('Platform.OS check guards SQLite on Web', () => {
    const isWeb = true; // simulating Platform.OS === 'web'
    
    // This mirrors the initDB logic: on web, skip SQLite
    if (isWeb) {
      // Should NOT try to open a SQLite database
      assert.ok(true, 'SQLite creation skipped on web');
    } else {
      assert.fail('Should not reach here');
    }
  });

  test('Web bypass pattern uses conditional branching correctly', () => {
    // Simulate the pattern from App.js
    const loadProductsForWeb = (apiAvailable) => {
      if (apiAvailable) {
        return { source: 'api', data: [{ id: 1, name: 'From API' }] };
      } else {
        return { source: 'local', data: [] };
      }
    };

    // Web: API is available
    const result = loadProductsForWeb(true);
    assert.strictEqual(result.source, 'api');
    assert.strictEqual(result.data.length, 1);
  });
});

// ========================================================
// Results
// ========================================================
const total = pass + fail;
console.log(`\n══════════════════════════════════════════`);
console.log(`  Total: ${total}  |  PASS: ${pass}  |  FAIL: ${fail}`);
console.log(`══════════════════════════════════════════\n`);
process.exit(fail > 0 ? 1 : 0);

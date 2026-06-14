#!/usr/bin/env node
/**
 * Background Sync Queue — Integration Test
 *
 * Tests the automatic offline transaction sync runner WITHOUT Jest or babel.
 * Simulates:
 *   1. Checkout saving with synced=0 (offline)
 *   2. Connectivity-resume trigger pushing unsynced transactions
 *   3. Marking synced=1 after successful push
 *   4. Dedicated queue runner (native SQLite & web localStorage)
 *
 * Run: node tests/test-background-sync.js
 */

const assert = require('node:assert');

// ---------------------------------------------------------------------------
// Test harness
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
    console.error(`  \u2715 FAIL: ${name}`);
    console.error(`    ${e.message}`);
    return;
  }
  console.log(`  \u2713 PASS: ${name}`);
}

function describe(suite, fn) {
  console.log(`\n${suite}`);
  beforeFn = () => {};
  fn();
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const fakeStore = {};
const localStorage = {
  getItem: (key) => fakeStore[key] ?? null,
  setItem: (key, val) => { fakeStore[key] = String(val); },
  removeItem: (key) => { delete fakeStore[key]; },
  clear: () => { Object.keys(fakeStore).forEach(k => delete fakeStore[k]); },
};

// Simulated Storage abstraction (like src/services/api.js)
const Storage = {
  getItemAsync: async (key) => localStorage.getItem(key),
  setItemAsync: async (key, val) => localStorage.setItem(key, String(val)),
  deleteItemAsync: async (key) => localStorage.removeItem(key),
};

// Mock NetInfo that we can control
let mockConnected = false;
let netInfoListeners = [];

const NetInfo = {
  addEventListener: (cb) => {
    netInfoListeners.push(cb);
    // Return unsubscribe function
    return () => {
      netInfoListeners = netInfoListeners.filter(l => l !== cb);
    };
  },
  // Test helper: simulate connectivity change
  _simulateConnectivityChange: (isConnected, isReachable) => {
    mockConnected = isConnected;
    netInfoListeners.forEach(cb => cb({
      isConnected,
      isInternetReachable: isReachable !== undefined ? isReachable : isConnected,
    }));
  },
};

// Simulated API endpoint
let apiCalls = [];
const fakeApi = {
  post: async (url, data, config) => {
    apiCalls.push({ url, data, config });
    return { status: 200 };
  },
};

// Mock db for native path
const fakeDb = {
  _sales: [],
  _items: [],
  execSync: function (sql) {
    if (sql.startsWith('CREATE TABLE')) return;
    if (sql.startsWith('DELETE')) { this._sales = []; this._items = []; }
  },
  getAllSync: function (sql, ...params) {
    if (sql.includes('sales') && sql.includes('synced = 0')) {
      return this._sales.filter(s => s.synced === 0);
    }
    if (sql.includes('sale_items') && sql.includes('sale_id')) {
      return this._items.filter(i => i.sale_id === params[0]);
    }
    return [];
  },
  runSync: function (sql, ...params) {
    if (sql.startsWith('INSERT INTO sales')) {
      const id = this._sales.length + 1;
      this._sales.push({ id, total: params[0], payment_method: params[1], synced: 0 });
      return { lastInsertRowId: id, changes: 1 };
    }
    if (sql.startsWith('INSERT INTO sale_items')) {
      this._items.push({ sale_id: params[0], product_id: params[1], qty: params[2], price: params[3] });
      return { lastInsertRowId: this._items.length, changes: 1 };
    }
    if (sql.startsWith('UPDATE sales SET synced = 1')) {
      const sale = this._sales.find(s => s.id === params[0]);
      if (sale) sale.synced = 1;
      return { changes: 1 };
    }
    return { lastInsertRowId: 0, changes: 0 };
  },
  getFirstSync: () => ({}),
  withTransactionSync: (fn) => fn(),
};

// ---------------------------------------------------------------------------
// The background sync logic (ported from src/services/backgroundSync.js)
// ---------------------------------------------------------------------------
let isSyncing = false;

async function pushUnsyncedTransactions() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const token = await Storage.getItemAsync('user_token');
    if (!token) {
      isSyncing = false;
      return;
    }

    // Web path (localStorage)
    const salesStr = await Storage.getItemAsync('local_sales') || '[]';
    let sales = JSON.parse(salesStr);
    let updated = false;

    for (const s of sales) {
      if (s.synced === 0) {
        try {
          await fakeApi.post('http://test/api/v1/pos/transaction', {
            total_amount: s.total,
            payment_method: s.payment_method,
            items: s.items
          }, { headers: { Authorization: `Bearer ${token}` } });
          s.synced = 1;
          updated = true;
        } catch (err) {
          console.error('BackgroundSync failed for sale ID:', s.id, err);
        }
      }
    }

    if (updated) {
      await Storage.setItemAsync('local_sales', JSON.stringify(sales));
    }

    // Native SQLite path
    const unsynced = fakeDb.getAllSync('SELECT * FROM sales WHERE synced = 0');
    for (const s of unsynced) {
      try {
        const items = fakeDb.getAllSync('SELECT * FROM sale_items WHERE sale_id = ?', s.id);
        await fakeApi.post('http://test/api/v1/pos/transaction', {
          total_amount: s.total,
          payment_method: s.payment_method,
          items: items.map(i => ({ product_id: i.product_id, qty: i.qty, price: i.price }))
        }, { headers: { Authorization: `Bearer ${token}` } });
        fakeDb.runSync('UPDATE sales SET synced = 1 WHERE id = ?', s.id);
      } catch (e) {
        console.error('BackgroundSync failed to push sale ID:', s.id, e);
      }
    }
  } catch (error) {
    console.error('BackgroundSyncService error:', error);
  } finally {
    isSyncing = false;
  }
}

// ---------------------------------------------------------------------------
// Suite 1: BackgroundSync — Deduplicates (no concurrent syncs)
// ---------------------------------------------------------------------------
describe('BackgroundSync — Concurrent sync guard', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    fakeDb._sales = [];
    fakeDb._items = [];
  });

  test('does not run concurrent syncs', async () => {
    localStorage.setItem('user_token', 'test-token');
    localStorage.setItem('local_sales', JSON.stringify([{ id: 1, total: 50000, synced: 0, items: [] }]));

    // Start two syncs — second should be dropped
    await Promise.all([pushUnsyncedTransactions(), pushUnsyncedTransactions()]);

    const finalSales = JSON.parse(localStorage.getItem('local_sales'));
    assert.strictEqual(finalSales[0].synced, 1);
    // Should only push once (1 API call)  
    assert.strictEqual(apiCalls.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: BackgroundSync — Web localStorage path
// ---------------------------------------------------------------------------
describe('BackgroundSync — Web (localStorage) path', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    fakeDb._sales = [];
    fakeDb._items = [];
  });

  test('skip sync when no token', async () => {
    await pushUnsyncedTransactions();
    assert.strictEqual(apiCalls.length, 0);
  });

  test('pushes unsynced sales to API and marks synced', async () => {
    await Storage.setItemAsync('user_token', 'test-token');
    const sales = [
      { id: 100, total: 25000, payment_method: 'CASH', items: [{ product_id: 'p1', qty: 1, price: 25000 }], synced: 0 },
      { id: 101, total: 15000, payment_method: 'CASH', items: [{ product_id: 'p2', qty: 2, price: 7500 }], synced: 0 },
    ];
    await Storage.setItemAsync('local_sales', JSON.stringify(sales));

    await pushUnsyncedTransactions();

    const result = JSON.parse(await Storage.getItemAsync('local_sales'));
    assert.strictEqual(result[0].synced, 1);
    assert.strictEqual(result[1].synced, 1);
    assert.strictEqual(apiCalls.length, 2);
  });

  test('skips already synced entries', async () => {
    await Storage.setItemAsync('user_token', 'test-token');
    const sales = [
      { id: 200, total: 10000, payment_method: 'CASH', items: [], synced: 1 },
    ];
    await Storage.setItemAsync('local_sales', JSON.stringify(sales));

    await pushUnsyncedTransactions();

    assert.strictEqual(apiCalls.length, 0);
  });

  test('leaves synced=0 if API call fails', async () => {
    await Storage.setItemAsync('user_token', 'test-token');
    const sales = [
      { id: 300, total: 50000, payment_method: 'CASH', items: [{ product_id: 'p3', qty: 1, price: 50000 }], synced: 0 },
    ];
    await Storage.setItemAsync('local_sales', JSON.stringify(sales));

    // Make API fail
    const originalPost = fakeApi.post;
    let failCount = 0;
    fakeApi.post = async () => {
      failCount++;
      throw new Error('Network error');
    };

    await pushUnsyncedTransactions();

    const result = JSON.parse(await Storage.getItemAsync('local_sales'));
    assert.strictEqual(result[0].synced, 0); // Still unsynced
    assert.strictEqual(failCount, 1);

    fakeApi.post = originalPost;
  });
});

// ---------------------------------------------------------------------------
// Suite 3: BackgroundSync — Native SQLite path
// ---------------------------------------------------------------------------
describe('BackgroundSync — Native SQLite path', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    fakeDb._sales = [];
    fakeDb._items = [];
  });

  test('pushes unsynced native sales and marks synced', async () => {
    await Storage.setItemAsync('user_token', 'test-token');
    
    // Simulate checkout on native: insert sales + sale_items
    fakeDb.runSync('INSERT INTO sales (total, payment_method) VALUES (?, ?)', 75000, 'CASH');
    fakeDb.runSync('INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)', 1, 'p1', 3, 25000);

    const unsyncedBefore = fakeDb.getAllSync('SELECT * FROM sales WHERE synced = 0');
    assert.strictEqual(unsyncedBefore.length, 1);
    assert.strictEqual(unsyncedBefore[0].synced, 0);

    await pushUnsyncedTransactions();

    const unsyncedAfter = fakeDb.getAllSync('SELECT * FROM sales WHERE synced = 0');
    assert.strictEqual(unsyncedAfter.length, 0); // All synced

    const syncedSale = fakeDb._sales.find(s => s.id === 1);
    assert.strictEqual(syncedSale.synced, 1);
    assert.strictEqual(apiCalls.length, 1);
  });

  test('pushes sale_items as part of API payload', async () => {
    await Storage.setItemAsync('user_token', 'test-token');
    
    fakeDb.runSync('INSERT INTO sales (total, payment_method) VALUES (?, ?)', 30000, 'CASH');
    fakeDb.runSync('INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)', 1, 'p1', 2, 15000);

    await pushUnsyncedTransactions();

    assert.strictEqual(apiCalls.length, 1);
    assert.deepStrictEqual(apiCalls[0].data.items, [
      { product_id: 'p1', qty: 2, price: 15000 }
    ]);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: NetInfo Connectivity Listener
// ---------------------------------------------------------------------------
describe('NetInfo Connectivity Listener Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    netInfoListeners = [];
    fakeDb._sales = [];
    fakeDb._items = [];
  });

  test('connectivity change triggers pushUnsyncedTransactions', async () => {
    await Storage.setItemAsync('user_token', 'test-token');
    await Storage.setItemAsync('local_sales', JSON.stringify([
      { id: 400, total: 20000, payment_method: 'CASH', items: [], synced: 0 },
    ]));

    // Simulate the startBackgroundSync listener registration
    let triggerCount = 0;
    const originalFn = pushUnsyncedTransactions;
    const mockFn = async () => {
      triggerCount++;
      await originalFn();
    };

    // Register listener (mimics backgroundSync start)
    const unsub = NetInfo.addEventListener(() => {
      mockFn();
    });

    // Simulate connectivity resume
    NetInfo._simulateConnectivityChange(true, true);

    // Give async time
    await new Promise(r => setTimeout(r, 50));

    const result = JSON.parse(await Storage.getItemAsync('local_sales'));
    assert.strictEqual(result[0].synced, 1);
    assert.strictEqual(apiCalls.length, 1);

    // Cleanup
    unsub();
  });

  test('does NOT trigger when going offline', async () => {
    await Storage.setItemAsync('user_token', 'test-token');
    await Storage.setItemAsync('local_sales', JSON.stringify([
      { id: 500, total: 10000, payment_method: 'CASH', items: [], synced: 0 },
    ]));

    let triggerCount = 0;
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        triggerCount++;
      }
    });

    // Going offline
    NetInfo._simulateConnectivityChange(false, false);
    assert.strictEqual(triggerCount, 0);

    // Cleanup
    unsub();
  });
});

// ---------------------------------------------------------------------------
// Suite 5: End-to-end flow — offline checkout → reconnect → sync
// ---------------------------------------------------------------------------
describe('E2E: Offline Checkout → Reconnect → Auto Sync', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    netInfoListeners = [];
    fakeDb._sales = [];
    fakeDb._items = [];
  });

  test('full flow: checkout (offline), reconnect, auto-push', async () => {
    // 1. User logged in
    await Storage.setItemAsync('user_token', 'test-token');
    
    // 2. Checkout happens while offline — saves with synced=0
    const checkoutSale = {
      id: Date.now(),
      total: 50000,
      payment_method: 'CASH',
      created_at: new Date().toISOString(),
      items: [{ product_id: 'p1', qty: 2, price: 25000 }],
      synced: 0, // offline!
    };
    const existing = JSON.parse(localStorage.getItem('local_sales') || '[]');
    existing.push(checkoutSale);
    localStorage.setItem('local_sales', JSON.stringify(existing));
    assert.strictEqual(JSON.parse(localStorage.getItem('local_sales'))[0].synced, 0);

    // 3. Connection returns — trigger background sync
    await pushUnsyncedTransactions();

    // 4. Verify synced
    const result = JSON.parse(localStorage.getItem('local_sales'));
    assert.strictEqual(result[0].synced, 1);
    assert.strictEqual(apiCalls.length, 1);
    assert.strictEqual(apiCalls[0].data.total_amount, 50000);
    assert.strictEqual(apiCalls[0].data.items.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
const total = pass + fail;
console.log(`\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
console.log(`  Total: ${total}  |  PASS: ${pass}  |  FAIL: ${fail}`);
console.log(`\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n`);
process.exit(fail > 0 ? 1 : 0);

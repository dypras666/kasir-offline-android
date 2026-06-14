#!/usr/bin/env node
/**
 * Offline Queue — Integration Test
 *
 * Tests the automatic offline transaction sync runner WITHOUT Jest or babel.
 * Simulates:
 *   1. Enqueue transaksi saat offline (synced=0)
 *   2. Connectivity-resume trigger (auto-push saat koneksi pulih)
 *   3. Mark as synced (synced=1 setelah push berhasil)
 *
 * Run: node tests/test-offline-queue.js
 */

const assert = require('node:assert');

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
let beforeFn = () => {};
const testsToRun = [];

function beforeEach(fn) {
  beforeFn = fn;
}

function test(name, fn) {
  const currentBefore = beforeFn;
  testsToRun.push(async () => {
    try {
      await currentBefore();
      await fn();
      pass++;
      console.log(`  \u2713 PASS: ${name}`);
    } catch (e) {
      fail++;
      console.error(`  \u2715 FAIL: ${name}`);
      console.error(`    ${e.stack || e.message}`);
    }
  });
}

function describe(suite, fn) {
  testsToRun.push(async () => {
    console.log(`\n${suite}`);
    beforeFn = () => {};
  });
  fn();
}

async function runAllTests() {
  for (const t of testsToRun) {
    await t();
  }
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

const Storage = {
  getItemAsync: async (key) => localStorage.getItem(key),
  setItemAsync: async (key, val) => localStorage.setItem(key, String(val)),
  deleteItemAsync: async (key) => localStorage.removeItem(key),
};

let mockConnected = false;
let netInfoListeners = [];

const NetInfo = {
  addEventListener: (cb) => {
    netInfoListeners.push(cb);
    return () => {
      netInfoListeners = netInfoListeners.filter(l => l !== cb);
    };
  },
  _simulateConnectivityChange: (isConnected, isReachable) => {
    mockConnected = isConnected;
    netInfoListeners.forEach(cb => cb({
      isConnected,
      isInternetReachable: isReachable !== undefined ? isReachable : isConnected,
    }));
  },
};

let apiCalls = [];
const fakeApi = {
  post: async (url, data, config) => {
    apiCalls.push({ url, data, config });
    return { status: 200 };
  },
};

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
// The OfflineQueue logic (ported from src/services/OfflineQueueService.js)
// ---------------------------------------------------------------------------
let isSyncing = false;
let currentSyncPromise = null;

async function pushUnsyncedTransactions() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const token = await Storage.getItemAsync('user_token');
    const branchId = await Storage.getItemAsync('selected_branch_id') || '1';
    if (!token) {
      isSyncing = false;
      return;
    }
    const baseUrl = 'http://localhost:8085';

    // Native SQLite path (menggunakan fakeDb)
    const unsynced = fakeDb.getAllSync('SELECT * FROM sales WHERE synced = 0');
    for (const s of unsynced) {
      try {
        const items = fakeDb.getAllSync('SELECT * FROM sale_items WHERE sale_id = ?', s.id);
        await fakeApi.post(`${baseUrl}/api/v1/pos/transaction`, {
          total_amount: s.total,
          payment_method: s.payment_method,
          branch_id: parseInt(branchId, 10),
          items: items.map(i => ({
            product_id: i.product_id,
            qty: i.qty,
            price: i.price
          }))
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fakeDb.runSync('UPDATE sales SET synced = 1 WHERE id = ?', s.id);
      } catch (e) {
        console.error('OfflineQueueService gagal push transaksi ID:', s.id, e);
      }
    }
  } catch (error) {
    console.error('OfflineQueueService error:', error);
  } finally {
    isSyncing = false;
  }
}

let unsubscribeNetInfo = null;

function startOfflineQueue() {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      currentSyncPromise = pushUnsyncedTransactions();
    }
  });
}

function stopOfflineQueue() {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
}

/** Helper test: await any in-flight sync from NetInfo listener */
async function flushSync() {
  if (currentSyncPromise) {
    await currentSyncPromise;
    currentSyncPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Suite 1: Enqueue transaksi saat offline
// ---------------------------------------------------------------------------
describe('OfflineQueue — Enqueue transaksi saat offline', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    fakeDb._sales = [];
    fakeDb._items = [];
    stopOfflineQueue();
  });

  test('transaksi masuk dengan synced=0 saat offline', () => {
    fakeDb.runSync('INSERT INTO sales', 50000, 'CASH');
    fakeDb.runSync('INSERT INTO sale_items', 1, 1, 2, 25000);

    assert.strictEqual(fakeDb._sales.length, 1);
    assert.strictEqual(fakeDb._sales[0].synced, 0);
    assert.strictEqual(fakeDb._sales[0].total, 50000);
    assert.strictEqual(fakeDb._items.length, 1);
  });

  test('multiple transaksi offline — semua synced=0', () => {
    fakeDb.runSync('INSERT INTO sales', 10000, 'CASH');
    fakeDb.runSync('INSERT INTO sales', 25000, 'QRIS');
    fakeDb.runSync('INSERT INTO sales', 75000, 'DEBIT');

    assert.strictEqual(fakeDb._sales.length, 3);
    assert.ok(fakeDb._sales.every(s => s.synced === 0));
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Auto-push saat koneksi pulih
// ---------------------------------------------------------------------------
describe('OfflineQueue — Auto-push saat koneksi pulih', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    fakeDb._sales = [];
    fakeDb._items = [];
    stopOfflineQueue();
  });

  test('trigger push saat isConnected=true', async () => {
    localStorage.setItem('user_token', 'test-token');
    localStorage.setItem('selected_branch_id', '1');
    fakeDb.runSync('INSERT INTO sales', 50000, 'CASH');
    fakeDb.runSync('INSERT INTO sale_items', 1, 1, 2, 25000);

    startOfflineQueue();
    NetInfo._simulateConnectivityChange(true);

    // Tunggu async operation
    await flushSync();

    assert.strictEqual(apiCalls.length, 1);
    assert.strictEqual(apiCalls[0].url, 'http://localhost:8085/api/v1/pos/transaction');
    assert.strictEqual(apiCalls[0].data.total_amount, 50000);
    assert.strictEqual(apiCalls[0].data.payment_method, 'CASH');
    assert.strictEqual(apiCalls[0].data.branch_id, 1);
    assert.strictEqual(apiCalls[0].data.items.length, 1);
    assert.strictEqual(apiCalls[0].data.items[0].product_id, 1);
    assert.strictEqual(apiCalls[0].data.items[0].qty, 2);
    assert.strictEqual(apiCalls[0].data.items[0].price, 25000);
  });

  test('tidak push saat offline (isConnected=false)', async () => {
    localStorage.setItem('user_token', 'test-token');
    localStorage.setItem('selected_branch_id', '1');
    fakeDb.runSync('INSERT INTO sales', 30000, 'CASH');

    startOfflineQueue();
    // Simulasi offline
    NetInfo._simulateConnectivityChange(false);

    await flushSync();

    assert.strictEqual(apiCalls.length, 0);
  });

  test('tidak push saat tidak ada token', async () => {
    localStorage.removeItem('user_token');
    fakeDb.runSync('INSERT INTO sales', 40000, 'QRIS');

    startOfflineQueue();
    NetInfo._simulateConnectivityChange(true);

    await flushSync();

    assert.strictEqual(apiCalls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Mark as synced setelah push berhasil
// ---------------------------------------------------------------------------
describe('OfflineQueue — Mark as synced', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    fakeDb._sales = [];
    fakeDb._items = [];
    stopOfflineQueue();
  });

  test('synced berubah menjadi 1 setelah push sukses', async () => {
    localStorage.setItem('user_token', 'test-token');
    localStorage.setItem('selected_branch_id', '1');
    fakeDb.runSync('INSERT INTO sales', 200000, 'DEBIT');
    fakeDb.runSync('INSERT INTO sale_items', 1, 3, 1, 200000);

    startOfflineQueue();
    NetInfo._simulateConnectivityChange(true);

    await flushSync();

    assert.strictEqual(fakeDb._sales[0].synced, 1);
    // Tidak ada lagi transaksi yang belum sync
    const unsynced = fakeDb.getAllSync('SELECT * FROM sales WHERE synced = 0');
    assert.strictEqual(unsynced.length, 0);
  });

  test('transaksi gagal tetap synced=0 untuk retry berikutnya', async () => {
    localStorage.setItem('user_token', 'test-token');
    localStorage.setItem('selected_branch_id', '1');
    fakeDb.runSync('INSERT INTO sales', 50000, 'CASH');

    // Buat API gagal dulu
    const originalPost = fakeApi.post;
    fakeApi.post = async () => { throw new Error('Network error'); };

    await pushUnsyncedTransactions();

    assert.strictEqual(fakeDb._sales[0].synced, 0);
    const unsynced = fakeDb.getAllSync('SELECT * FROM sales WHERE synced = 0');
    assert.strictEqual(unsynced.length, 1);

    // Restore API dan push ulang — harus sukses
    fakeApi.post = originalPost;
    apiCalls = [];

    await pushUnsyncedTransactions();

    assert.strictEqual(fakeDb._sales[0].synced, 1);
    assert.strictEqual(apiCalls.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Concurrent sync guard
// ---------------------------------------------------------------------------
describe('OfflineQueue — Concurrent sync guard', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    fakeDb._sales = [];
    fakeDb._items = [];
    stopOfflineQueue();
  });

  test('tidak menjalankan sync bersamaan', async () => {
    localStorage.setItem('user_token', 'test-token');
    localStorage.setItem('selected_branch_id', '1');
    fakeDb.runSync('INSERT INTO sales', 100000, 'CASH');
    fakeDb.runSync('INSERT INTO sale_items', 1, 1, 1, 100000);

    // Jalankan dua sync bersamaan — yang kedua harus di-drop
    await Promise.all([pushUnsyncedTransactions(), pushUnsyncedTransactions()]);

    // Hanya sekali API call
    assert.strictEqual(apiCalls.length, 1);
    assert.strictEqual(fakeDb._sales[0].synced, 1);
  });
});

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
runAllTests().finally(() => {
  console.log(`\nOfflineQueue Tests: ${pass} passed, ${fail} failed${fail > 0 ? ' ***' : ''}`);
  process.exitCode = fail > 0 ? 1 : 0;
});

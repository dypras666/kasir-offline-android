#!/usr/bin/env node
/**
 * Lost Inventory — Integration Test
 *
 * Tests the offline report and automatic sync for lost/damaged goods.
 * Run: node tests/test-lost-inventory.js
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
    console.log(`  \u2713 PASS: ${name}`);
  } catch (e) {
    fail++;
    console.error(`  \u2715 FAIL: ${name}`);
    console.error(`    ${e.message}`);
  }
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

const Storage = {
  getItemAsync: async (key) => localStorage.getItem(key),
  setItemAsync: async (key, val) => localStorage.setItem(key, String(val)),
  deleteItemAsync: async (key) => localStorage.removeItem(key),
};

let apiCalls = [];
const fakeApi = {
  post: async (url, data, config) => {
    apiCalls.push({ url, data, config });
    return { status: 200 };
  },
};

const fakeDb = {
  _lost: [],
  execSync: function (sql) {
    if (sql.includes('CREATE TABLE')) return;
    if (sql.includes('DELETE')) this._lost = [];
  },
  getAllSync: function (sql) {
    if (sql.includes('lost_inventories')) {
      if (sql.includes('synced = 0')) return this._lost.filter(i => i.synced === 0);
      return this._lost;
    }
    return [];
  },
  runSync: function (sql, params) {
    if (sql.includes('INSERT INTO lost_inventories')) {
      const id = this._lost.length + 1;
      this._lost.push({
        id,
        product_id: params[0],
        product_name: params[1],
        qty: params[2],
        loss_type: params[3],
        note: params[4],
        reported_at: params[5],
        synced: 0,
        branch_id: params[6]
      });
      return { lastInsertRowId: id };
    }
    if (sql.includes('UPDATE lost_inventories SET synced = 1')) {
      const item = this._lost.find(i => i.id === params[0]);
      if (item) item.synced = 1;
      return { changes: 1 };
    }
    return { changes: 0 };
  }
};

// ---------------------------------------------------------------------------
// The Logic (Ported from LostInventoryService.js)
// ---------------------------------------------------------------------------
async function pushUnsyncedLostInventory() {
  const token = await Storage.getItemAsync('user_token');
  if (!token) return;
  const baseUrl = 'http://test-server';

  const unsynced = fakeDb.getAllSync('SELECT * FROM lost_inventories WHERE synced = 0');

  for (const item of unsynced) {
    try {
      await fakeApi.post(
        `${baseUrl}/api/v1/lost-inventories-sync`,
        {
          product_id: item.product_id,
          product_name: item.product_name,
          qty: item.qty,
          loss_type: item.loss_type,
          note: item.note || '',
          reported_at: item.reported_at,
          branch_id: item.branch_id || '1',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fakeDb.runSync('UPDATE lost_inventories SET synced = 1 WHERE id = ?', [item.id]);
    } catch (err) {
      console.error('Failed sync:', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Lost Inventory Offline & Sync', () => {
  beforeEach(() => {
    localStorage.clear();
    apiCalls = [];
    fakeDb._lost = [];
  });

  test('Save report offline (SQLite mock)', () => {
    fakeDb.runSync('INSERT INTO lost_inventories', ['p1', 'Produk A', 5, 'rusak', 'Pecah', '2026-06-13', '1']);
    assert.strictEqual(fakeDb._lost.length, 1);
    assert.strictEqual(fakeDb._lost[0].synced, 0);
    assert.strictEqual(fakeDb._lost[0].loss_type, 'rusak');
  });

  test('Push unsynced reports to server', async () => {
    await Storage.setItemAsync('user_token', 'valid-token');
    fakeDb.runSync('INSERT INTO lost_inventories', ['p1', 'Produk A', 2, 'hilang', '', '2026-06-13', '1']);
    
    await pushUnsyncedLostInventory();

    assert.strictEqual(apiCalls.length, 1);
    assert.strictEqual(apiCalls[0].url, 'http://test-server/api/v1/lost-inventories-sync');
    assert.strictEqual(apiCalls[0].data.loss_type, 'hilang');
    assert.strictEqual(fakeDb._lost[0].synced, 1);
  });

  test('Skip sync if no token', async () => {
    fakeDb.runSync('INSERT INTO lost_inventories', ['p1', 'Produk A', 1, 'hilang', '', '2026-06-13', '1']);
    await pushUnsyncedLostInventory();
    assert.strictEqual(apiCalls.length, 0);
    assert.strictEqual(fakeDb._lost[0].synced, 0);
  });
});

const total = pass + fail;
console.log(`\nResults: ${pass}/${total} passed`);
process.exit(fail > 0 ? 1 : 0);

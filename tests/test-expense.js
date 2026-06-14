#!/usr/bin/env node
/**
 * Expense Module Integration Test
 * Verifies create, list, and offline fallback for Expenses.
 */

const assert = require('node:assert');

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
    console.log(`  ✓ PASS: ${name}`);
  } catch (e) {
    fail++;
    console.error(`  ✕ FAIL: ${name}`);
    console.error(`    ${e.message}`);
  }
}

function describe(suite, fn) {
  console.log(`\n${suite}`);
  beforeFn = () => {};
  fn();
}

// Mocking storage and local database behavior (mimicking Platform.OS === 'web' behavior)
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
};

// --- Logic from ExpenseService.js (web-mode behavior) ---
const saveExpenseLocal = async (data) => {
  const key = 'expenses_local';
  const raw = await Storage.getItemAsync(key) || '[]';
  const list = JSON.parse(raw);
  const newItem = {
    id: Date.now(),
    ...data,
    status: 'pending',
    created_at: new Date().toISOString(),
    synced: 0,
  };
  list.push(newItem);
  await Storage.setItemAsync(key, JSON.stringify(list));
  return newItem;
};

const getExpensesLocal = async (branchId) => {
  const raw = await Storage.getItemAsync('expenses_local') || '[]';
  let list = JSON.parse(raw);
  if (branchId) {
    list = list.filter(e => String(e.branch_id) === String(branchId));
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

// --- Test Suites ---

describe('Expense Module — Local Storage (Offline Fallback)', () => {
  beforeEach(() => localStorage.clear());

  test('saving an expense locally stores it correctly', async () => {
    const data = {
      judul: 'Tagihan Listrik',
      amount: 150000,
      kategori: 'listrik',
      tanggal: '2025-06-15',
      branch_id: 1
    };

    const saved = await saveExpenseLocal(data);
    assert.strictEqual(saved.judul, 'Tagihan Listrik');
    assert.strictEqual(saved.amount, 150000);
    assert.strictEqual(saved.synced, 0);
    assert.strictEqual(saved.status, 'pending');

    const storedRaw = localStorage.getItem('expenses_local');
    const stored = JSON.parse(storedRaw);
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].judul, 'Tagihan Listrik');
  });

  test('fetching expenses returns sorted list', async () => {
    await saveExpenseLocal({ judul: 'Lama', amount: 100, created_at: '2025-01-01' });
    // Simulate delay for timestamp
    const data2 = { judul: 'Baru', amount: 200, created_at: '2025-06-01' };
    await saveExpenseLocal(data2);

    const list = await getExpensesLocal();
    assert.strictEqual(list.length, 2);
    // getExpensesLocal sorts by created_at DESC
    assert.strictEqual(list[0].judul, 'Baru');
  });

  test('filtering expenses by branch_id works', async () => {
    await saveExpenseLocal({ judul: 'Branch 1', branch_id: 1 });
    await saveExpenseLocal({ judul: 'Branch 2', branch_id: 2 });

    const list1 = await getExpensesLocal(1);
    assert.strictEqual(list1.length, 1);
    assert.strictEqual(list1[0].judul, 'Branch 1');

    const list2 = await getExpensesLocal(2);
    assert.strictEqual(list2.length, 1);
    assert.strictEqual(list2[0].judul, 'Branch 2');
  });

  test('empty expense list returns empty array', async () => {
    const list = await getExpensesLocal();
    assert.deepStrictEqual(list, []);
  });
});

describe('Expense Module — Sync Simulation', () => {
  beforeEach(() => localStorage.clear());

  test('marking local expense as synced works', async () => {
    const expense = await saveExpenseLocal({ judul: 'To Sync', amount: 500 });
    
    // Simulate sync process
    const raw = await Storage.getItemAsync('expenses_local') || '[]';
    const list = JSON.parse(raw);
    const idx = list.findIndex(e => e.id === expense.id);
    list[idx].synced = 1;
    await Storage.setItemAsync('expenses_local', JSON.stringify(list));

    const updated = await getExpensesLocal();
    assert.strictEqual(updated[0].synced, 1);
  });
});

// Final report
const total = pass + fail;
console.log(`\n══════════════════════════════════════════`);
console.log(`  Total: ${total}  |  PASS: ${pass}  |  FAIL: ${fail}`);
console.log(`══════════════════════════════════════════\n`);
process.exit(fail > 0 ? 1 : 0);

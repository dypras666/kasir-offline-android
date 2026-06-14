import axios from 'axios';
import { Platform } from 'react-native';
import { getBaseUrl, Storage } from './api';

// SQLite for offline fallback
let SQLite = null;
let db = null;
if (Platform.OS !== 'web') {
  try {
    SQLite = require('expo-sqlite');
    db = SQLite.openDatabaseSync('kasir_offline_v2.db');
  } catch (e) {
    console.warn('expo-sqlite tidak tersedia di ExpenseService', e);
  }
}

/**
 * Buat tabel expenses untuk penyimpanan offline.
 * Dipanggil dari initDB() di App.js.
 */
export const createExpenseTable = () => {
  if (Platform.OS === 'web') return;
  if (!db) return;
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_no TEXT,
        judul TEXT NOT NULL,
        amount REAL NOT NULL,
        kategori TEXT DEFAULT 'lainnya',
        tanggal TEXT NOT NULL,
        keterangan TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        branch_id TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0
      );
    `);
    console.log('Tabel expenses berhasil dibuat');
  } catch (e) {
    console.warn('Gagal create expenses table:', e);
  }
};

/**
 * Simpan expense ke SQLite lokal (offline fallback).
 */
export const saveExpenseLocal = async (data) => {
  if (Platform.OS === 'web' || !db) {
    // Web fallback: localStorage
    const key = 'expenses_local';
    const raw = await Storage.getItemAsync(key) || '[]';
    const list = JSON.parse(raw);
    list.push({
      id: Date.now(),
      ...data,
      status: 'pending',
      created_at: new Date().toISOString(),
      synced: 0,
    });
    await Storage.setItemAsync(key, JSON.stringify(list));
    return list[list.length - 1];
  }

  try {
    db.runSync(
      `INSERT INTO expenses (judul, amount, kategori, tanggal, keterangan, status, branch_id, synced)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, 0)`,
      [data.judul, data.amount, data.kategori, data.tanggal, data.keterangan || '', data.branch_id || '']
    );
    return { id: db.getFirstSync('SELECT last_insert_rowid() as id').id };
  } catch (e) {
    console.error('Gagal simpan expense lokal:', e);
    throw e;
  }
};

/**
 * Ambil expenses dari SQLite lokal (untuk offline mode).
 */
export const getExpensesLocal = async (branchId) => {
  if (Platform.OS === 'web' || !db) {
    const raw = await Storage.getItemAsync('expenses_local') || '[]';
    let list = JSON.parse(raw);
    if (branchId) {
      list = list.filter(e => String(e.branch_id) === String(branchId));
    }
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  try {
    let rows;
    if (branchId) {
      rows = db.getAllSync(
        'SELECT * FROM expenses WHERE branch_id = ? ORDER BY created_at DESC',
        [String(branchId)]
      );
    } else {
      rows = db.getAllSync('SELECT * FROM expenses ORDER BY created_at DESC');
    }
    return rows;
  } catch (e) {
    console.error('Gagal ambil expenses lokal:', e);
    return [];
  }
};

/**
 * Sync expenses lokal yang belum terkirim (synced = 0) ke server.
 * Dipanggil oleh background sync.
 */
export const syncExpenses = async () => {
  if (!db && Platform.OS !== 'web') return { synced: 0, failed: 0 };

  let localExpenses;

  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('expenses_local') || '[]';
    localExpenses = JSON.parse(raw).filter(e => e.synced === 0);
  } else {
    localExpenses = db.getAllSync('SELECT * FROM expenses WHERE synced = 0');
  }

  if (localExpenses.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const baseUrl = await getBaseUrl();
  const token = await Storage.getItemAsync('user_token');

  for (const expense of localExpenses) {
    try {
      await axios.post(
        `${baseUrl}/api/v1/expenses`,
        {
          judul: expense.judul,
          amount: Number(expense.amount),
          kategori: expense.kategori || 'lainnya',
          tanggal: expense.tanggal,
          keterangan: expense.keterangan || '',
          branch_id: expense.branch_id,
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 8000,
        }
      );

      // Mark as synced
      if (Platform.OS === 'web') {
        const raw = await Storage.getItemAsync('expenses_local') || '[]';
        const list = JSON.parse(raw);
        const idx = list.findIndex(e => e.id === expense.id);
        if (idx !== -1) {
          list[idx].synced = 1;
          await Storage.setItemAsync('expenses_local', JSON.stringify(list));
        }
      } else {
        db.runSync('UPDATE expenses SET synced = 1 WHERE id = ?', [expense.id]);
      }

      synced++;
    } catch (e) {
      console.warn(`Gagal sync expense #${expense.id}:`, e.message);
      failed++;
    }
  }

  return { synced, failed };
};

/**
 * Service untuk mengelola biaya operasional (Expense).
 */
export const ExpenseService = {
  /**
   * POST /api/v1/expenses — buat expense baru.
   * Fallback ke penyimpanan lokal jika server tidak reachable.
   */
  createExpense: async (data) => {
    try {
      const baseUrl = await getBaseUrl();
      const token = await Storage.getItemAsync('user_token');
      const response = await axios.post(`${baseUrl}/api/v1/expenses`, data, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 8000,
      });
      return response.data;
    } catch (error) {
      console.error('Error creating expense via API, saving locally:', error.message);
      // Fallback: simpan lokal
      await saveExpenseLocal(data);
      return { offline: true, message: 'Disimpan lokal, akan sync otomatis' };
    }
  },

  /**
   * GET /api/v1/expenses — ambil daftar expense.
   * Fallback ke data lokal jika server tidak reachable.
   */
  getExpenses: async (params = {}) => {
    try {
      const baseUrl = await getBaseUrl();
      const token = await Storage.getItemAsync('user_token');
      const response = await axios.get(`${baseUrl}/api/v1/expenses`, {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 8000,
      });
      return response.data;
    } catch (error) {
      console.error('Error getting expenses from API, falling back to local:', error.message);
      // Fallback: ambil dari lokal
      const localData = await getExpensesLocal(params.branch_id);
      return localData;
    }
  }
};

import { Platform } from 'react-native';
import { Storage } from '../api';
import { CustomerSyncQueue } from './CustomerSyncQueue';

let SQLite = null;
let db = null;
if (Platform.OS !== 'web') {
  try {
    SQLite = require('expo-sqlite');
    db = SQLite.openDatabaseSync('kasir_offline_v2.db');
  } catch (e) {
    console.warn('expo-sqlite tidak tersedia di CustomerService', e);
  }
}

const STORAGE_KEY = 'customers_local';

/**
 * CustomerService — mengelola data pelanggan secara lokal (offline-first)
 * Setiap pelanggan memiliki:
 * - id (string unik, auto-generated)
 * - name (string, wajib)
 * - phone (string, opsional)
 * - email (string, opsional)
 * - address (string, opsional)
 * - poin (number, default 0)
 * - created_at (ISO string)
 * - updated_at (ISO string)
 */
export const CustomerService = {
  /**
   * Buat tabel customers jika belum ada (native SQLite)
   */
  createTable: () => {
    if (Platform.OS === 'web' || !db) return;
    try {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT DEFAULT '',
          email TEXT DEFAULT '',
          address TEXT DEFAULT '',
          poin REAL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
    } catch (e) {
      console.warn('Gagal create customers table:', e);
    }
  },

  /**
   * Generate ID unik untuk pelanggan baru
   */
  _generateId: () => {
    return 'CUST-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  },

  /**
   * Ambil semua pelanggan (diurutkan berdasarkan nama A-Z)
   */
  getAll: async () => {
    if (Platform.OS === 'web') {
      try {
        const raw = await Storage.getItemAsync(STORAGE_KEY) || '[]';
        return JSON.parse(raw).sort((a, b) => a.name.localeCompare(b.name));
      } catch (e) {
        console.warn('CustomerService.getAll web error:', e);
        return [];
      }
    }
    if (!db) return [];
    try {
      return db.getAllSync('SELECT * FROM customers ORDER BY name ASC');
    } catch (e) {
      console.warn('CustomerService.getAll db error:', e);
      return [];
    }
  },

  /**
   * Cari pelanggan berdasarkan nama atau nomor telepon
   */
  search: async (query) => {
    const all = await CustomerService.getAll();
    if (!query || !query.trim()) return all;
    const q = query.toLowerCase().trim();
    return all.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    );
  },

  /**
   * Ambil satu pelanggan berdasarkan ID
   */
  getById: async (id) => {
    if (!id) return null;
    if (Platform.OS === 'web') {
      const all = await CustomerService.getAll();
      return all.find((c) => c.id === id) || null;
    }
    if (!db) return null;
    try {
      return db.getFirstSync('SELECT * FROM customers WHERE id = ?', [id]) || null;
    } catch (e) {
      console.warn('CustomerService.getById error:', e);
      return null;
    }
  },

  /**
   * Tambah pelanggan baru
   */
  create: async ({ name, phone, email, address }) => {
    if (!name || !name.trim()) {
      throw new Error('Nama pelanggan wajib diisi');
    }

    const now = new Date().toISOString();
    const newCustomer = {
      id: CustomerService._generateId(),
      name: name.trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      address: (address || '').trim(),
      poin: 0,
      created_at: now,
      updated_at: now,
    };

    if (Platform.OS === 'web') {
      const all = await CustomerService.getAll();
      all.push(newCustomer);
      await Storage.setItemAsync(STORAGE_KEY, JSON.stringify(all));
      CustomerSyncQueue.enqueue('create', newCustomer).catch(e => console.warn('SyncQueue enqueue create error:', e));
      return newCustomer;
    }

    if (!db) throw new Error('Database tidak tersedia');
    try {
      db.runSync(
        `INSERT INTO customers (id, name, phone, email, address, poin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [newCustomer.id, newCustomer.name, newCustomer.phone, newCustomer.email, newCustomer.address, now, now]
      );
      // Enqueue for server sync
      CustomerSyncQueue.enqueue('create', newCustomer).catch(e => console.warn('SyncQueue enqueue create error:', e));
      return newCustomer;
    } catch (e) {
      console.warn('CustomerService.create error:', e);
      throw new Error('Gagal menyimpan pelanggan');
    }
  },

  /**
   * Update data pelanggan
   */
  update: async (id, { name, phone, email, address }) => {
    if (!id) throw new Error('ID pelanggan wajib diisi');
    if (!name || !name.trim()) throw new Error('Nama pelanggan wajib diisi');

    const now = new Date().toISOString();

    if (Platform.OS === 'web') {
      const all = await CustomerService.getAll();
      const idx = all.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error('Pelanggan tidak ditemukan');
      all[idx] = {
        ...all[idx],
        name: name.trim(),
        phone: (phone || '').trim(),
        email: (email || '').trim(),
        address: (address || '').trim(),
        updated_at: now,
      };
      await Storage.setItemAsync(STORAGE_KEY, JSON.stringify(all));
      return all[idx];
    }

    if (!db) throw new Error('Database tidak tersedia');
    try {
      db.runSync(
        `UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, updated_at = ? WHERE id = ?`,
        [name.trim(), (phone || '').trim(), (email || '').trim(), (address || '').trim(), now, id]
      );
      return await CustomerService.getById(id);
    } catch (e) {
      console.warn('CustomerService.update error:', e);
      throw new Error('Gagal mengupdate pelanggan');
    }
  },

  /**
   * Hapus pelanggan berdasarkan ID
   */
  delete: async (id) => {
    if (!id) throw new Error('ID pelanggan wajib diisi');

    if (Platform.OS === 'web') {
      let all = await CustomerService.getAll();
      const idx = all.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error('Pelanggan tidak ditemukan');
      all = all.filter((c) => c.id !== id);
      await Storage.setItemAsync(STORAGE_KEY, JSON.stringify(all));
      return true;
    }

    if (!db) throw new Error('Database tidak tersedia');
    try {
      db.runSync('DELETE FROM customers WHERE id = ?', [id]);
      return true;
    } catch (e) {
      console.warn('CustomerService.delete error:', e);
      throw new Error('Gagal menghapus pelanggan');
    }
  },

  /**
   * Tambah/tarik poin pelanggan
   */
  updatePoin: async (id, delta) => {
    if (!id) throw new Error('ID pelanggan wajib diisi');
    if (delta === 0) return await CustomerService.getById(id);

    if (Platform.OS === 'web') {
      const all = await CustomerService.getAll();
      const idx = all.findIndex((c) => c.id === id);
      if (idx === -1) throw new Error('Pelanggan tidak ditemukan');
      all[idx].poin = Math.max(0, (all[idx].poin || 0) + delta);
      all[idx].updated_at = new Date().toISOString();
      await Storage.setItemAsync(STORAGE_KEY, JSON.stringify(all));
      return all[idx];
    }

    if (!db) throw new Error('Database tidak tersedia');
    try {
      const customer = await CustomerService.getById(id);
      if (!customer) throw new Error('Pelanggan tidak ditemukan');
      const newPoin = Math.max(0, (customer.poin || 0) + delta);
      db.runSync('UPDATE customers SET poin = ?, updated_at = ? WHERE id = ?', [newPoin, new Date().toISOString(), id]);
      return await CustomerService.getById(id);
    } catch (e) {
      console.warn('CustomerService.updatePoin error:', e);
      throw new Error('Gagal mengupdate poin pelanggan');
    }
  },
};

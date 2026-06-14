import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import axios from 'axios';
import { getBaseUrl, Storage } from './api';

let SQLite = null;
let db = null;
if (Platform.OS !== 'web') {
  try {
    SQLite = require('expo-sqlite');
    db = SQLite.openDatabaseSync('kasir_offline_v2.db');
  } catch (e) {
    console.warn('expo-sqlite tidak tersedia di LostInventoryService', e);
  }
}

/**
 * Buat tabel lost_inventories jika belum ada (dipanggil di initDB).
 */
export const createLostInventoryTable = () => {
  if (Platform.OS === 'web') return;
  if (!db) return;
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS lost_inventories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        qty REAL NOT NULL DEFAULT 0,
        loss_type TEXT NOT NULL DEFAULT 'hilang',
        note TEXT DEFAULT '',
        reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0,
        branch_id TEXT DEFAULT ''
      );
    `);
  } catch (e) {
    console.warn('Gagal create lost_inventories table:', e);
  }
};

/**
 * Simpan laporan barang hilang/rusak ke SQLite lokal (synced=0).
 */
export const saveLostInventory = async ({
  product_id,
  product_name,
  qty,
  loss_type = 'hilang',
  note = '',
}) => {
  const branchId = (await Storage.getItemAsync('selected_branch_id')) || '1';
  const timestamp = new Date().toISOString();

  if (Platform.OS === 'web') {
    const existing = await Storage.getItemAsync('lost_inventory_local') || '[]';
    const list = JSON.parse(existing);
    const newId = list.length > 0 ? Math.max(...list.map((i) => i.id)) + 1 : 1;
    list.push({
      id: newId,
      product_id,
      product_name,
      qty,
      loss_type,
      note,
      reported_at: timestamp,
      synced: 0,
      branch_id: branchId,
    });
    await Storage.setItemAsync('lost_inventory_local', JSON.stringify(list));
    return newId;
  }

  if (!db) throw new Error('SQLite tidak tersedia');
  const result = db.runSync(
    `INSERT INTO lost_inventories (product_id, product_name, qty, loss_type, note, reported_at, synced, branch_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [product_id, product_name, qty, loss_type, note, timestamp, branchId]
  );
  return result.lastInsertRowId;
};

/**
 * Ambil semua laporan dari penyimpanan lokal.
 */
export const getLostInventoryLocal = async (opts = {}) => {
  const { status = 'all' } = opts;

  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('lost_inventory_local') || '[]';
    let list = JSON.parse(raw);
    if (status === 'synced') list = list.filter((i) => i.synced === 1);
    if (status === 'unsynced') list = list.filter((i) => i.synced === 0);
    return list.sort((a, b) => new Date(b.reported_at) - new Date(a.reported_at));
  }

  if (!db) return [];
  let query = 'SELECT * FROM lost_inventories';
  if (status === 'synced') query += ' WHERE synced = 1';
  if (status === 'unsynced') query += ' WHERE synced = 0';
  query += ' ORDER BY reported_at DESC';
  return db.getAllSync(query);
};

/**
 * Hapus laporan dari penyimpanan lokal.
 */
export const removeLostInventoryLocal = async (id) => {
  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('lost_inventory_local') || '[]';
    let list = JSON.parse(raw);
    list = list.filter((i) => i.id !== id);
    await Storage.setItemAsync('lost_inventory_local', JSON.stringify(list));
    return;
  }
  if (!db) return;
  db.runSync('DELETE FROM lost_inventories WHERE id = ?', [id]);
};

/**
 * Push laporan yang belum tersinkronisasi ke Go server.
 */
export const pushUnsyncedLostInventory = async () => {
  const token = await Storage.getItemAsync('user_token');
  if (!token) return;
  const baseUrl = await getBaseUrl();

  const unsynced = await getLostInventoryLocal({ status: 'unsynced' });

  for (const item of unsynced) {
    try {
      await axios.post(
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
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000,
        }
      );

      if (Platform.OS === 'web') {
        const raw = await Storage.getItemAsync('lost_inventory_local') || '[]';
        let list = JSON.parse(raw);
        list = list.map((i) => (i.id === item.id ? { ...i, synced: 1 } : i));
        await Storage.setItemAsync('lost_inventory_local', JSON.stringify(list));
      } else if (db) {
        db.runSync('UPDATE lost_inventories SET synced = 1 WHERE id = ?', [item.id]);
      }
    } catch (err) {
      console.error('pushUnsyncedLostInventory gagal untuk ID:', item.id, err);
    }
  }
};

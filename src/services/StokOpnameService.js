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
    console.warn('expo-sqlite tidak tersedia di StokOpnameService', e);
  }
}

/**
 * Buat tabel stok_opnames dan stok_opname_items jika belum ada.
 * Dipanggil dari initDB() di App.js.
 */
export const createStokOpnameTable = () => {
  if (Platform.OS === 'web') return;
  if (!db) return;
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS stok_opnames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opname_number TEXT,
        branch_id TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        total_items INTEGER DEFAULT 0,
        total_adjustment REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        synced INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS stok_opname_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opname_id INTEGER,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        system_qty REAL DEFAULT 0,
        actual_qty REAL DEFAULT 0,
        difference REAL DEFAULT 0,
        unit_name TEXT DEFAULT '',
        notes TEXT DEFAULT ''
      );
    `);
    console.log('Tabel stok_opnames dan stok_opname_items berhasil dibuat');
  } catch (e) {
    console.warn('Gagal create stok_opnames table:', e);
  }
};

/**
 * Ambil semua stok opname dari penyimpanan lokal.
 */
export const getStokOpnamesLocal = async (opts = {}) => {
  const { status = 'all', branch_id } = opts;
  let query, params;

  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('stok_opnames_local') || '[]';
    let list = JSON.parse(raw);
    if (status !== 'all') list = list.filter((i) => i.status === status);
    if (branch_id) list = list.filter((i) => i.branch_id === String(branch_id));
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  if (!db) return [];
  query = 'SELECT * FROM stok_opnames WHERE 1=1';
  params = [];
  if (status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }
  if (branch_id) {
    query += ' AND branch_id = ?';
    params.push(String(branch_id));
  }
  query += ' ORDER BY created_at DESC';
  return db.getAllSync(query, params);
};

/**
 * Ambil detail satu stok opname beserta item-itemnya.
 */
export const getStokOpnameDetailLocal = async (id) => {
  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('stok_opnames_local') || '[]';
    const list = JSON.parse(raw);
    return list.find((i) => i.id === id) || null;
  }
  if (!db) return null;
  const opname = db.getFirstSync('SELECT * FROM stok_opnames WHERE id = ?', [id]);
  if (!opname) return null;
  opname.items = db.getAllSync('SELECT * FROM stok_opname_items WHERE opname_id = ?', [id]);
  return opname;
};

/**
 * Simpan stok opname baru ke SQLite lokal.
 * Menerima data header + items, menghitung difference secara otomatis.
 */
export const saveStokOpnameLocal = async ({
  branch_id,
  notes = '',
  items = [],
}) => {
  const timestamp = new Date().toISOString();
  const branchId = branch_id || (await Storage.getItemAsync('selected_branch_id')) || '1';
  const totalItems = items.length;
  const totalAdjustment = items.reduce((sum, i) => {
    const diff = parseFloat(i.actual_qty || 0) - parseFloat(i.system_qty || 0);
    return sum + diff;
  }, 0);

  // Generate opname number
  const opnameNumber = `SO-${Date.now()}`;

  if (Platform.OS === 'web') {
    const existing = await Storage.getItemAsync('stok_opnames_local') || '[]';
    const list = JSON.parse(existing);
    const newId = list.length > 0 ? Math.max(...list.map((i) => i.id)) + 1 : 1;
    list.push({
      id: newId,
      opname_number: opnameNumber,
      branch_id: branchId,
      notes,
      status: 'draft',
      total_items: totalItems,
      total_adjustment: totalAdjustment,
      created_at: timestamp,
      completed_at: null,
      synced: 0,
      items: items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        system_qty: parseFloat(item.system_qty || 0),
        actual_qty: parseFloat(item.actual_qty || 0),
        difference: parseFloat(item.actual_qty || 0) - parseFloat(item.system_qty || 0),
        unit_name: item.unit_name || '',
        notes: item.notes || '',
      })),
    });
    await Storage.setItemAsync('stok_opnames_local', JSON.stringify(list));
    return newId;
  }

  if (!db) throw new Error('SQLite tidak tersedia');
  let opnameId;
  db.withTransactionSync(() => {
    const result = db.runSync(
      `INSERT INTO stok_opnames (opname_number, branch_id, notes, status, total_items, total_adjustment, created_at, completed_at, synced)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, NULL, 0)`,
      [opnameNumber, branchId, notes, totalItems, totalAdjustment, timestamp]
    );
    opnameId = result.lastInsertRowId;
    for (const item of items) {
      const actualQty = parseFloat(item.actual_qty || 0);
      const systemQty = parseFloat(item.system_qty || 0);
      db.runSync(
        `INSERT INTO stok_opname_items (opname_id, product_id, product_name, system_qty, actual_qty, difference, unit_name, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          opnameId,
          item.product_id,
          item.product_name,
          systemQty,
          actualQty,
          actualQty - systemQty,
          item.unit_name || '',
          item.notes || '',
        ]
      );
    }
  });
  return opnameId;
};

/**
 * Complete (selesaikan) stok opname — ubah status dari 'draft' ke 'completed'.
 */
export const completeStokOpnameLocal = async (id) => {
  const timestamp = new Date().toISOString();

  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('stok_opnames_local') || '[]';
    let list = JSON.parse(raw);
    list = list.map((i) =>
      i.id === id
        ? { ...i, status: 'completed', completed_at: timestamp }
        : i
    );
    await Storage.setItemAsync('stok_opnames_local', JSON.stringify(list));
    return;
  }
  if (!db) return;
  db.runSync(
    'UPDATE stok_opnames SET status = ?, completed_at = ? WHERE id = ?',
    ['completed', timestamp, id]
  );
};

/**
 * Cancel stok opname.
 */
export const cancelStokOpnameLocal = async (id) => {
  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('stok_opnames_local') || '[]';
    let list = JSON.parse(raw);
    list = list.map((i) =>
      i.id === id ? { ...i, status: 'cancelled' } : i
    );
    await Storage.setItemAsync('stok_opnames_local', JSON.stringify(list));
    return;
  }
  if (!db) return;
  db.runSync('UPDATE stok_opnames SET status = ? WHERE id = ?', ['cancelled', id]);
};

/**
 * Submit stok opname — jika online, kirim langsung; jika offline, simpan lokal.
 */
export const submitStokOpname = async (payload) => {
  try {
    const netInfo = require('@react-native-community/netinfo').default;
    const netState = await netInfo.fetch();
    const isOnline = netState.isConnected && netState.isInternetReachable !== false;
    const token = await Storage.getItemAsync('user_token');

    if (isOnline && token) {
      const baseUrl = await getBaseUrl();
      await axios.post(
        `${baseUrl}/api/v1/stok-opnames/sync`,
        {
          opname_number: payload.opname_number || `SO-${Date.now()}`,
          branch_id: payload.branch_id,
          notes: payload.notes || '',
          status: payload.status || 'completed',
          total_items: payload.items?.length || 0,
          total_adjustment: payload.items?.reduce(
            (sum, i) => sum + (parseFloat(i.actual_qty || 0) - parseFloat(i.system_qty || 0)),
            0
          ) || 0,
          items: payload.items?.map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            system_qty: parseFloat(i.system_qty || 0),
            actual_qty: parseFloat(i.actual_qty || 0),
            difference: parseFloat(i.actual_qty || 0) - parseFloat(i.system_qty || 0),
            unit_name: i.unit_name || '',
            notes: i.notes || '',
          })) || [],
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000,
        }
      );
    }

    // Always save locally
    const localId = await saveStokOpnameLocal(payload);
    return localId;
  } catch (e) {
    console.warn('submitStokOpname gagal, fallback ke offline', e);
    const localId = await saveStokOpnameLocal(payload);
    return localId;
  }
};

/**
 * Push stok opname yang belum tersinkronisasi ke server cloud.
 */
export const pushUnsyncedStokOpnames = async () => {
  const token = await Storage.getItemAsync('user_token');
  if (!token) return;
  const baseUrl = await getBaseUrl();

  let unsynced = [];
  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('stok_opnames_local') || '[]';
    unsynced = JSON.parse(raw).filter((i) => i.synced === 0);
  } else if (db) {
    unsynced = db.getAllSync('SELECT * FROM stok_opnames WHERE synced = 0');
  }

  for (const so of unsynced) {
    try {
      let items = [];
      if (Platform.OS === 'web') {
        items = so.items || [];
      } else if (db) {
        items = db.getAllSync('SELECT * FROM stok_opname_items WHERE opname_id = ?', [so.id]);
      }

      await axios.post(
        `${baseUrl}/api/v1/stok-opnames/sync`,
        {
          opname_number: so.opname_number || `SO-${so.id}`,
          branch_id: so.branch_id || '1',
          notes: so.notes || '',
          status: so.status || 'completed',
          total_items: so.total_items || items.length,
          total_adjustment: so.total_adjustment || 0,
          items: items.map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            system_qty: parseFloat(i.system_qty || 0),
            actual_qty: parseFloat(i.actual_qty || 0),
            difference: parseFloat(i.difference || 0),
            unit_name: i.unit_name || '',
            notes: i.notes || '',
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000,
        }
      );

      if (Platform.OS === 'web') {
        const raw = await Storage.getItemAsync('stok_opnames_local') || '[]';
        let list = JSON.parse(raw);
        list = list.map((i) => (i.id === so.id ? { ...i, synced: 1 } : i));
        await Storage.setItemAsync('stok_opnames_local', JSON.stringify(list));
      } else if (db) {
        db.runSync('UPDATE stok_opnames SET synced = 1 WHERE id = ?', [so.id]);
      }
    } catch (err) {
      console.error('pushUnsyncedStokOpnames gagal untuk ID:', so.id, err);
    }
  }
};

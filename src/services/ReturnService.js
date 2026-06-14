import axios from 'axios';
import { Platform } from 'react-native';
import { getBaseUrl, Storage } from './api';

let SQLite = null;
let db = null;
if (Platform.OS !== 'web') {
  try {
    SQLite = require('expo-sqlite');
    db = SQLite.openDatabaseSync('kasir_offline_v2.db');
  } catch (e) {
    console.warn('expo-sqlite tidak tersedia di ReturnService', e);
  }
}

export const ReturnService = {
  createTable: () => {
    if (Platform.OS === 'web' || !db) return;
    try {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS returns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL,
          invoice_number TEXT,
          reason TEXT,
          refund_type TEXT DEFAULT 'CASH',
          total_refund REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced INTEGER DEFAULT 0,
          branch_id TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS return_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          return_id INTEGER,
          product_id TEXT,
          product_name TEXT,
          qty REAL,
          price REAL,
          subtotal REAL
        );
      `);
    } catch (e) {
      console.warn('Gagal create returns table:', e);
    }
  },

  getReturnsLocal: async () => {
    if (Platform.OS === 'web') {
      const raw = await Storage.getItemAsync('returns_local') || '[]';
      return JSON.parse(raw).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (!db) return [];
    return db.getAllSync('SELECT * FROM returns ORDER BY created_at DESC');
  },

  saveReturnLocal: async (sale, items, reason, options = {}) => {
    const branchId = (await Storage.getItemAsync('selected_branch_id')) || '1';
    const timestamp = new Date().toISOString();
    const totalRefund = items.reduce((sum, i) => sum + i.subtotal, 0);
    const refundType = options.refund_type || 'CASH';

    if (Platform.OS === 'web') {
      const existing = await Storage.getItemAsync('returns_local') || '[]';
      const list = JSON.parse(existing);
      const newId = list.length > 0 ? Math.max(...list.map((i) => i.id)) + 1 : 1;
      list.push({
        id: newId,
        sale_id: sale.id,
        invoice_number: sale.invoice_number,
        reason,
        refund_type: refundType,
        total_refund: totalRefund,
        created_at: timestamp,
        synced: 0,
        branch_id: branchId,
        items
      });
      await Storage.setItemAsync('returns_local', JSON.stringify(list));
      return newId;
    }

    if (!db) throw new Error('SQLite tidak tersedia');
    let returnId;
    db.withTransactionSync(() => {
      const result = db.runSync(
        `INSERT INTO returns (sale_id, invoice_number, reason, refund_type, total_refund, created_at, synced, branch_id)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [sale.id, sale.invoice_number, reason, refundType, totalRefund, timestamp, branchId]
      );
      returnId = result.lastInsertRowId;
      for (const item of items) {
        db.runSync(
          `INSERT INTO return_items (return_id, product_id, product_name, qty, price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [returnId, item.product_id, item.product_name, item.qty, item.price, item.subtotal]
        );
      }
    });
    return returnId;
  },

  /**
   * Get the appropriate sync endpoint for returns based on server mode.
   * - local mode: POST to http://{STB_IP}:8081/api/v1/sales-returns-sync (Go Sync Server)
   * - cloud mode: POST to {baseUrl}/api/v1/sales/{saleId}/return
   */
  getReturnEndpoint: async (saleId) => {
    const serverMode = await Storage.getItemAsync('server_mode');
    if (serverMode === 'local') {
      const savedIp = await Storage.getItemAsync('local_server_ip');
      return `http://${savedIp}/api/v1/sales-returns-sync`;
    }
    const baseUrl = await getBaseUrl();
    return `${baseUrl}/api/v1/sales/${saleId}/return`;
  },

  submitReturn: async (sale, items, reason, options = {}) => {
    try {
      const netInfo = require('@react-native-community/netinfo').default;
      const netState = await netInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable !== false;
      const token = await Storage.getItemAsync('user_token');
      const branchId = (await Storage.getItemAsync('selected_branch_id')) || '1';
      const refundType = options.refund_type || 'CASH';

      if (isOnline && token) {
        const serverMode = await Storage.getItemAsync('server_mode');
        const endpoint = await ReturnService.getReturnEndpoint(sale.id);

        const payload = serverMode === 'local'
          ? {
              // local Go Sync Server payload format
              sale_id: sale.id,
              invoice_number: sale.invoice_number,
              reason,
              refund_type: refundType,
              branch_id: branchId,
              total_refund: items.reduce((sum, i) => sum + i.subtotal, 0),
              items: items.map(i => ({
                product_id: i.product_id,
                product_name: i.product_name,
                qty: i.qty,
                price: i.price,
                subtotal: i.subtotal || (i.qty * i.price)
              }))
            }
          : {
              // cloud API format
              reason,
              refund_type: refundType,
              branch_id: branchId,
              items: items.map(i => ({
                product_id: i.product_id,
                qty: i.qty
              }))
            };

        await axios.post(endpoint, payload, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000
        });

        // Simpan ke lokal tapi set synced = 1
        const timestamp = new Date().toISOString();
        const totalRefund = items.reduce((sum, i) => sum + i.subtotal, 0);

        if (Platform.OS === 'web') {
          const existing = await Storage.getItemAsync('returns_local') || '[]';
          const list = JSON.parse(existing);
          const newId = list.length > 0 ? Math.max(...list.map((x) => x.id)) + 1 : 1;
          list.push({
            id: newId,
            sale_id: sale.id,
            invoice_number: sale.invoice_number,
            reason,
            total_refund: totalRefund,
            created_at: timestamp,
            synced: 1,
            branch_id: branchId,
            items
          });
          await Storage.setItemAsync('returns_local', JSON.stringify(list));
        } else if (db) {
          db.withTransactionSync(() => {
            const result = db.runSync(
              `INSERT INTO returns (sale_id, invoice_number, reason, total_refund, created_at, synced, branch_id)
               VALUES (?, ?, ?, ?, ?, 1, ?)`,
              [sale.id, sale.invoice_number, reason, totalRefund, timestamp, branchId]
            );
            const returnId = result.lastInsertRowId;
            for (const item of items) {
              db.runSync(
                `INSERT INTO return_items (return_id, product_id, product_name, qty, price, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [returnId, item.product_id, item.product_name, item.qty, item.price, item.subtotal]
              );
            }
          });
        }
      } else {
        // Offline: save to local queue
        await ReturnService.saveReturnLocal(sale, items, reason);
      }
    } catch (e) {
      console.warn('submitReturn gagal, fallback to offline', e);
      await ReturnService.saveReturnLocal(sale, items, reason);
    }
  },

  pushUnsyncedReturns: async () => {
    const token = await Storage.getItemAsync('user_token');
    if (!token) return;

    const serverMode = await Storage.getItemAsync('server_mode');

    let unsynced = [];
    if (Platform.OS === 'web') {
      const raw = await Storage.getItemAsync('returns_local') || '[]';
      unsynced = JSON.parse(raw).filter(i => i.synced === 0);
    } else if (db) {
      unsynced = db.getAllSync('SELECT * FROM returns WHERE synced = 0');
    }

    for (const ret of unsynced) {
      try {
        let items = [];
        if (Platform.OS === 'web') {
          items = ret.items || [];
        } else if (db) {
          items = db.getAllSync('SELECT * FROM return_items WHERE return_id = ?', [ret.id]);
        }

        const endpoint = serverMode === 'local'
          ? ReturnService.getReturnEndpoint(ret.sale_id)
          : ReturnService.getReturnEndpoint(ret.sale_id);

        const endpointUrl = await endpoint;

        const payload = serverMode === 'local'
          ? {
              sale_id: ret.sale_id,
              invoice_number: ret.invoice_number,
              reason: ret.reason,
              branch_id: ret.branch_id,
              total_refund: ret.total_refund,
              items: items.map(i => ({
                product_id: i.product_id,
                product_name: i.product_name,
                qty: i.qty,
                price: i.price,
                subtotal: i.subtotal || (i.qty * i.price)
              }))
            }
          : {
              reason: ret.reason,
              branch_id: ret.branch_id,
              items: items.map(i => ({
                product_id: i.product_id,
                qty: i.qty
              }))
            };

        await axios.post(endpointUrl, payload, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000
        });

        if (Platform.OS === 'web') {
          const raw = await Storage.getItemAsync('returns_local') || '[]';
          let list = JSON.parse(raw);
          list = list.map(i => i.id === ret.id ? { ...i, synced: 1 } : i);
          await Storage.setItemAsync('returns_local', JSON.stringify(list));
        } else if (db) {
          db.runSync('UPDATE returns SET synced = 1 WHERE id = ?', [ret.id]);
        }
      } catch (err) {
        console.error('pushUnsyncedReturns gagal untuk ID:', ret.id, err);
      }
    }
  }
};

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
    console.warn('expo-sqlite tidak tersedia di PurchaseReturnService', e);
  }
}

export const PurchaseReturnService = {
  createTable: () => {
    if (Platform.OS === 'web' || !db) return;
    try {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS purchase_returns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          purchase_invoice_id INTEGER NOT NULL,
          invoice_number TEXT,
          supplier_id TEXT,
          supplier_name TEXT,
          reason TEXT,
          total_return REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced INTEGER DEFAULT 0,
          branch_id TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS purchase_return_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          purchase_return_id INTEGER,
          product_id TEXT,
          product_name TEXT,
          qty REAL,
          price REAL,
          subtotal REAL
        );
      `);
    } catch (e) {
      console.warn('Gagal create purchase_returns table:', e);
    }
  },

  getPurchaseReturnsLocal: async () => {
    if (Platform.OS === 'web') {
      const raw = await Storage.getItemAsync('purchase_returns_local') || '[]';
      return JSON.parse(raw).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (!db) return [];
    return db.getAllSync('SELECT * FROM purchase_returns ORDER BY created_at DESC');
  },

  savePurchaseReturnLocal: async (invoice, items, reason) => {
    const branchId = (await Storage.getItemAsync('selected_branch_id')) || '1';
    const timestamp = new Date().toISOString();
    const totalReturn = items.reduce((sum, i) => sum + i.subtotal, 0);

    if (Platform.OS === 'web') {
      const existing = await Storage.getItemAsync('purchase_returns_local') || '[]';
      const list = JSON.parse(existing);
      const newId = list.length > 0 ? Math.max(...list.map((i) => i.id)) + 1 : 1;
      list.push({
        id: newId,
        purchase_invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        supplier_id: invoice.supplier_id,
        supplier_name: invoice.supplier_name,
        reason,
        total_return: totalReturn,
        created_at: timestamp,
        synced: 0,
        branch_id: branchId,
        items
      });
      await Storage.setItemAsync('purchase_returns_local', JSON.stringify(list));
      return newId;
    }

    if (!db) throw new Error('SQLite tidak tersedia');
    let returnId;
    db.withTransactionSync(() => {
      const result = db.runSync(
        `INSERT INTO purchase_returns (purchase_invoice_id, invoice_number, supplier_id, supplier_name, reason, total_return, created_at, synced, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [invoice.id, invoice.invoice_number, invoice.supplier_id, invoice.supplier_name, reason, totalReturn, timestamp, branchId]
      );
      returnId = result.lastInsertRowId;
      for (const item of items) {
        db.runSync(
          `INSERT INTO purchase_return_items (purchase_return_id, product_id, product_name, qty, price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [returnId, item.product_id, item.product_name, item.qty, item.price, item.subtotal]
        );
      }
    });
    return returnId;
  },

  getPurchaseReturnEndpoint: async () => {
    const serverMode = await Storage.getItemAsync('server_mode');
    if (serverMode === 'local') {
      const savedIp = await Storage.getItemAsync('local_server_ip');
      return `http://${savedIp}/api/v1/purchase-returns-sync`;
    }
    const baseUrl = await getBaseUrl();
    return `${baseUrl}/api/v1/purchase-returns`;
  },

  submitPurchaseReturn: async (invoice, items, reason) => {
    try {
      const netInfo = require('@react-native-community/netinfo').default;
      const netState = await netInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable !== false;
      const token = await Storage.getItemAsync('user_token');
      const branchId = (await Storage.getItemAsync('selected_branch_id')) || '1';

      if (isOnline && token) {
        const serverMode = await Storage.getItemAsync('server_mode');
        const endpoint = await PurchaseReturnService.getPurchaseReturnEndpoint();

        const payload = serverMode === 'local'
          ? {
              purchase_invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              supplier_id: invoice.supplier_id,
              reason,
              branch_id: branchId,
              total_return: items.reduce((sum, i) => sum + i.subtotal, 0),
              items: items.map(i => ({
                product_id: i.product_id,
                product_name: i.product_name,
                qty: i.qty,
                price: i.price,
                subtotal: i.subtotal
              }))
            }
          : {
              purchase_invoice_id: invoice.id,
              reason,
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
        const totalReturn = items.reduce((sum, i) => sum + i.subtotal, 0);

        if (Platform.OS === 'web') {
          const existing = await Storage.getItemAsync('purchase_returns_local') || '[]';
          const list = JSON.parse(existing);
          const newId = list.length > 0 ? Math.max(...list.map((x) => x.id)) + 1 : 1;
          list.push({
            id: newId,
            purchase_invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            supplier_id: invoice.supplier_id,
            supplier_name: invoice.supplier_name,
            reason,
            total_return: totalReturn,
            created_at: timestamp,
            synced: 1,
            branch_id: branchId,
            items
          });
          await Storage.setItemAsync('purchase_returns_local', JSON.stringify(list));
        } else if (db) {
          db.withTransactionSync(() => {
            const result = db.runSync(
              `INSERT INTO purchase_returns (purchase_invoice_id, invoice_number, supplier_id, supplier_name, reason, total_return, created_at, synced, branch_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
              [invoice.id, invoice.invoice_number, invoice.supplier_id, invoice.supplier_name, reason, totalReturn, timestamp, branchId]
            );
            const returnId = result.lastInsertRowId;
            for (const item of items) {
              db.runSync(
                `INSERT INTO purchase_return_items (purchase_return_id, product_id, product_name, qty, price, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [returnId, item.product_id, item.product_name, item.qty, item.price, item.subtotal]
              );
            }
          });
        }
      } else {
        await PurchaseReturnService.savePurchaseReturnLocal(invoice, items, reason);
      }
    } catch (e) {
      console.warn('submitPurchaseReturn gagal, fallback to offline', e);
      await PurchaseReturnService.savePurchaseReturnLocal(invoice, items, reason);
    }
  },

  pushUnsyncedPurchaseReturns: async () => {
    const token = await Storage.getItemAsync('user_token');
    if (!token) return;

    const serverMode = await Storage.getItemAsync('server_mode');
    const endpoint = await PurchaseReturnService.getPurchaseReturnEndpoint();

    let unsynced = [];
    if (Platform.OS === 'web') {
      const raw = await Storage.getItemAsync('purchase_returns_local') || '[]';
      unsynced = JSON.parse(raw).filter(i => i.synced === 0);
    } else if (db) {
      unsynced = db.getAllSync('SELECT * FROM purchase_returns WHERE synced = 0');
    }

    for (const ret of unsynced) {
      try {
        let items = [];
        if (Platform.OS === 'web') {
          items = ret.items || [];
        } else if (db) {
          items = db.getAllSync('SELECT * FROM purchase_return_items WHERE purchase_return_id = ?', [ret.id]);
        }

        const payload = serverMode === 'local'
          ? {
              purchase_invoice_id: ret.purchase_invoice_id,
              invoice_number: ret.invoice_number,
              supplier_id: ret.supplier_id,
              reason: ret.reason,
              branch_id: ret.branch_id,
              total_return: ret.total_return,
              items: items.map(i => ({
                product_id: i.product_id,
                product_name: i.product_name,
                qty: i.qty,
                price: i.price,
                subtotal: i.subtotal
              }))
            }
          : {
              purchase_invoice_id: ret.purchase_invoice_id,
              reason: ret.reason,
              branch_id: ret.branch_id,
              items: items.map(i => ({
                product_id: i.product_id,
                qty: i.qty
              }))
            };

        await axios.post(endpoint, payload, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000
        });

        if (Platform.OS === 'web') {
          const raw = await Storage.getItemAsync('purchase_returns_local') || '[]';
          let list = JSON.parse(raw);
          list = list.map(i => i.id === ret.id ? { ...i, synced: 1 } : i);
          await Storage.setItemAsync('purchase_returns_local', JSON.stringify(list));
        } else if (db) {
          db.runSync('UPDATE purchase_returns SET synced = 1 WHERE id = ?', [ret.id]);
        }
      } catch (err) {
        console.error('pushUnsyncedPurchaseReturns gagal untuk ID:', ret.id, err);
      }
    }
  }
};

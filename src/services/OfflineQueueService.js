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
    console.warn('expo-sqlite tidak tersedia di OfflineQueueService', e);
  }
}

let isSyncing = false;

export const pushUnsyncedTransactions = async () => {
  if (isSyncing) return;
  const { pushUnsyncedLostInventory } = require('./LostInventoryService');
  
  isSyncing = true;

  try {
    const token = await Storage.getItemAsync('user_token');
    const branchId = await Storage.getItemAsync('selected_branch_id') || '1';
    if (!token) {
      isSyncing = false;
      return;
    }
    const baseUrl = await getBaseUrl();

    if (Platform.OS === 'web') {
      const salesStr = await Storage.getItemAsync('local_sales') || '[]';
      let sales = JSON.parse(salesStr);
      let updated = false;

      for (const s of sales) {
        if (s.synced === 0) {
          try {
            await axios.post(`${baseUrl}/api/v1/sales`, {
              total_amount: s.total,
              subtotal: s.subtotal || s.total,
              discount_type: s.discount_type || 'none',
              discount_value: s.discount_value || 0,
              payment_method: s.payment_method,
              payments: s.payments && s.payments.length > 0 ? s.payments : [{ payment_method_id: s.payment_method || 'CASH', amount: s.total }],
              branch_id: s.branch_id || parseInt(branchId, 10),
              customer_id: s.customer_id || null,
              items: s.items
            }, {
              headers: { Authorization: `Bearer ${token}` }
            });
            s.synced = 1;
            updated = true;
          } catch (err) {
            console.error('Web OfflineQueueService gagal push transaksi ID:', s.id, err);
          }
        }
      }

      if (updated) {
        await Storage.setItemAsync('local_sales', JSON.stringify(sales));
      }
    } else {
      if (!db) {
        isSyncing = false;
        return;
      }
      const unsynced = db.getAllSync('SELECT * FROM sales WHERE synced = 0');
      for (const s of unsynced) {
        try {
          const items = db.getAllSync('SELECT * FROM sale_items WHERE sale_id = ?', s.id);
          await axios.post(`${baseUrl}/api/v1/sales`, {
            total_amount: s.total,
            subtotal: s.subtotal || s.total,
            discount_type: s.discount_type || 'none',
            discount_value: s.discount_value || 0,
            payment_method: s.payment_method,
            payments: s.payments && s.payments.length > 0 ? (typeof s.payments === 'string' ? JSON.parse(s.payments) : s.payments) : [{ payment_method_id: s.payment_method || 'CASH', amount: s.total }],
            branch_id: s.branch_id || parseInt(branchId, 10),
            customer_id: s.customer_id || null,
            items: items.map(i => ({
              product_id: i.product_id,
              qty: i.qty,
              price: i.price,
              discount_type: i.discount_type || 'none',
              discount_value: i.discount_value || 0,
              subtotal: i.subtotal || (i.price * i.qty)
            }))
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          db.runSync('UPDATE sales SET synced = 1 WHERE id = ?', s.id);
        } catch (e) {
          console.error('OfflineQueueService gagal push transaksi ID:', s.id, e);
        }
      }
    }
  } catch (error) {
    console.error('OfflineQueueService error:', error);
  } finally {
    // Sync lost inventory as well
    await pushUnsyncedLostInventory().catch(e => console.error('LostInventory sync error:', e));

    // Push unsynced returns
    const { pushUnsyncedReturns } = require('./ReturnService');
    await pushUnsyncedReturns().catch(e => console.error('Returns sync error:', e));

    // Push unsynced stok opnames
    const { pushUnsyncedStokOpnames } = require('./StokOpnameService');
    await pushUnsyncedStokOpnames().catch(e => console.error('StokOpname sync error:', e));

    isSyncing = false;
  }
};

export const pushOfflineVoids = async () => {
  try {
    const token = await Storage.getItemAsync('user_token');
    if (!token) return;
    const baseUrl = await getBaseUrl();
    const voidQueueStr = await Storage.getItemAsync('void_queue') || '[]';
    let voidQueue = JSON.parse(voidQueueStr);
    let updated = false;

    for (const v of voidQueue) {
      try {
        await axios.post(`${baseUrl}/api/v1/sales/${v.sale_id}/void`, {}, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000
        });
        // Update local status
        if (Platform.OS !== 'web' && db) {
          db.runSync('UPDATE sales SET status = ? WHERE id = ?', ['voided', v.sale_id]);
        } else {
          const salesStr = await Storage.getItemAsync('local_sales') || '[]';
          let sales = JSON.parse(salesStr);
          sales = sales.map(s => s.id === v.sale_id ? { ...s, status: 'voided' } : s);
          await Storage.setItemAsync('local_sales', JSON.stringify(sales));
        }
        v.synced = true;
        updated = true;
      } catch (err) {
        console.error('voidQueue sync gagal untuk sale ID:', v.sale_id, err);
      }
    }
    if (updated) {
      voidQueue = voidQueue.filter(v => !v.synced);
      await Storage.setItemAsync('void_queue', JSON.stringify(voidQueue));
    }
  } catch (e) {
    console.error('pushOfflineVoids error:', e);
  }
};

let unsubscribeNetInfo = null;

export const startOfflineQueue = () => {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      pushUnsyncedTransactions();
    }
  });
};

export const stopOfflineQueue = () => {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
};

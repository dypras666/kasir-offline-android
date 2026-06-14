import { Platform } from 'react-native';
import axios from 'axios';
import { getBaseUrl, Storage } from '../api';

const SYNC_QUEUE_KEY = 'customer_sync_queue';

/**
 * CustomerSyncQueue — Queue sinkronisasi pelanggan ke server
 *
 * Menyimpan operasi CRUD yang dilakukan offline dan mengirimkannya
 * ke server saat koneksi tersedia kembali.
 */
export const CustomerSyncQueue = {
  /**
   * Ambil antrian sinkronisasi dari storage
   */
  getQueue: async () => {
    try {
      const raw = await Storage.getItemAsync(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('CustomerSyncQueue.getQueue error:', e);
      return [];
    }
  },

  /**
   * Simpan antrian ke storage
   */
  setQueue: async (queue) => {
    try {
      await Storage.setItemAsync(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('CustomerSyncQueue.setQueue error:', e);
    }
  },

  /**
   * Tambah operasi ke antrian
   * @param {string} action - 'create' | 'update' | 'delete'
   * @param {object} data - data pelanggan
   */
  enqueue: async (action, data) => {
    const queue = await CustomerSyncQueue.getQueue();
    queue.push({
      id: Date.now().toString(),
      action,
      data,
      created_at: new Date().toISOString(),
      synced: false,
    });
    await CustomerSyncQueue.setQueue(queue);
  },

  /**
   * Push semua item antrian ke server
   * Dipanggil saat koneksi tersedia
   */
  pushUnsynced: async () => {
    const token = await Storage.getItemAsync('user_token');
    if (!token) return;

    const baseUrl = await getBaseUrl();
    const queue = await CustomerSyncQueue.getQueue();
    const unsynced = queue.filter((item) => !item.synced);

    if (unsynced.length === 0) return;

    let updated = false;

    for (const item of unsynced) {
      try {
        switch (item.action) {
          case 'create':
            await axios.post(
              `${baseUrl}/api/v1/customers`,
              item.data,
              {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 8000,
              }
            );
            break;

          case 'update':
            await axios.put(
              `${baseUrl}/api/v1/customers/${item.data.id}`,
              item.data,
              {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 8000,
              }
            );
            break;

          case 'delete':
            await axios.delete(
              `${baseUrl}/api/v1/customers/${item.data.id}`,
              {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 8000,
              }
            );
            break;

          default:
            console.warn('Unknown sync action:', item.action);
        }
        item.synced = true;
        updated = true;
      } catch (e) {
        console.error(
          `CustomerSyncQueue pushUnsynced gagal (${item.action}):`,
          item.data?.id || item.data?.name,
          e.response?.status || e.message
        );
      }
    }

    if (updated) {
      // Hapus item yang sudah synced dari queue
      const cleanQueue = queue.filter((item) => !item.synced);
      await CustomerSyncQueue.setQueue(cleanQueue);
    }
  },

  /**
   * Cek apakah ada item yang belum disinkronisasi
   */
  hasUnsynced: async () => {
    const queue = await CustomerSyncQueue.getQueue();
    return queue.some((item) => !item.synced);
  },

  /**
   * Hapus semua antrian
   */
  clear: async () => {
    await Storage.setItemAsync(SYNC_QUEUE_KEY, '[]');
  },
};

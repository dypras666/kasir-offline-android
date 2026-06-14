# Offline Queue — Background Sync untuk Transaksi Lokal

## Ringkasan

Modul `OfflineQueueService.js` menyediakan background queue runner yang memonitor koneksi jaringan menggunakan `@react-native-community/netinfo` dan secara otomatis mendorong transaksi yang belum tersinkronisasi dari SQLite lokal (`sales` / `sale_items`) ke server STB/cloud saat koneksi pulih.

## Arsitektur

```
┌──────────────────────────────────────────────┐
│                   App.js                     │
│  ┌──────────────────────────────────────────┐│
│  │          useEffect (on mount)            ││
│  │  startOfflineQueue() / stopOfflineQueue()││
│  └──────────────┬───────────────────────────┘│
└─────────────────┼────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────┐
│        OfflineQueueService.js                │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │     NetInfo.addEventListener()       │    │
│  │   (isConnected + isInternetReachable)│    │
│  └──────────┬───────────────────────────┘    │
│             ▼                                 │
│  ┌──────────────────────────────────────┐    │
│  │    pushUnsyncedTransactions()        │    │
│  │                                      │    │
│  │  1. Check token & baseUrl           │    │
│  │  2. SELECT * FROM sales             │    │
│  │       WHERE synced = 0              │    │
│  │  3. For each sale:                  │    │
│  │     - SELECT sale_items             │    │
│  │     - POST /api/v1/pos/transaction  │    │
│  │     - UPDATE sales SET synced = 1   │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

## Flow Detail

### 1. Startup (App.js)

```js
useEffect(() => {
  startOfflineQueue();
  return () => stopOfflineQueue();
}, []);
```

- Saat aplikasi dibuka, `startOfflineQueue()` mendaftarkan listener ke `NetInfo.addEventListener`.
- Saat unmount (aplikasi ditutup), `stopOfflineQueue()` melepas listener.

### 2. Deteksi Koneksi

- Listener `NetInfo` menerima state `{ isConnected, isInternetReachable }`.
- Jika `isConnected === true` **dan** `isInternetReachable !== false`, maka `pushUnsyncedTransactions()` dipanggil.
- Tidak ada trigger manual — sinkronisasi terjadi otomatis saat koneksi pulih.

### 3. Push Transaksi

**Native (SQLite):**
1. Ambil semua baris di tabel `sales` dengan `synced = 0`.
2. Untuk setiap transaksi:
   - Ambil item dari `sale_items` berdasarkan `sale_id`.
   - POST ke `${baseUrl}/api/v1/pos/transaction` dengan payload:
     ```json
     {
       "total_amount": <s.total>,
       "payment_method": "<s.payment_method>",
       "branch_id": <branchId>,
       "items": [{"product_id": ..., "qty": ..., "price": ...}]
     }
     ```
   - Update `sales SET synced = 1 WHERE id = ?`.

**Web (localStorage):**
1. Ambil `local_sales` dari `Storage`.
2. Parse JSON, iterasi item dengan `synced === 0`.
3. Push satu per satu, lalu simpan kembali ke storage.

### 4. Mark as Synced

- Setelah POST berhasil (status 2xx), flag `synced` diubah menjadi `1`.
- Jika gagal, transaksi tetap `synced = 0` dan akan di-coba lagi saat koneksi pulih berikutnya.
- Guard `isSyncing` mencegah duplikasi — hanya satu proses sync yang berjalan dalam satu waktu.

## Komponen

### File yang Dibuat

| File | Deskripsi |
|------|-----------|
| `src/services/OfflineQueueService.js` | Service utama — monitor koneksi & push transaksi |
| `tests/test-offline-queue.js` | Integration test (node) |
| `docs/offline-queue.md` | Dokumentasi ini |

### File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `App.js` | Import + `useEffect` untuk auto-start/shutdown |
| `package.json` | Tambah `test-offline-queue.js` ke script `test` |

## Dependensi

- `@react-native-community/netinfo` — deteksi koneksi real-time
- `expo-sqlite` — query SQLite lokal
- `axios` — HTTP POST ke server sync

## Testing

Jalankan dengan:

```bash
node tests/test-offline-queue.js
```

Atau via npm:

```bash
npm test
```

Test mencakup:
1. **Enqueue transaksi saat offline** — memasukkan transaksi ke SQLite lokal dengan `synced=0`.
2. **Auto-push saat koneksi pulih** — simulasi koneksi online via mock `NetInfo`, verifikasi API call.
3. **Mark as synced** — verifikasi flag `synced` berubah menjadi `1` setelah push berhasil.

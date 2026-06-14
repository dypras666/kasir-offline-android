# Purchase Return (Retur Pembelian) - Mobile Flow

## Overview
Fitur Retur Pembelian memungkinkan pengguna untuk mengembalikan barang yang sudah diterima dari supplier melalui Purchase Invoice. Fitur ini mendukung offline-first dengan sinkronisasi latar belakang.

## User Flow

1. **Navigasi**:
   - Dari bottom tab, pengguna memilih ikon "Retur Beli" (RotateCcw).
   - Atau dari halaman Purchase Order, klik "Retur Pembelian".

2. **List Retur Pembelian** (`PurchaseReturnListScreen`):
   - Menampilkan daftar retur pembelian yang sudah diproses.
   - **Filter**: Status (sync/belum sync), Periode (hari ini, minggu ini, bulan ini), Supplier.
   - **Search**: Cari berdasarkan nomor invoice atau nama supplier.
   - **Refresh**: Memuat ulang data dari lokal.
   - Setiap item menampilkan: Invoice number, Nama supplier, Tanggal, Alasan retur, Total retur, Status sync.

3. **Form Retur Pembelian** (`PurchaseReturnFormScreen`):
   - **Step 1 - Pilih Invoice**: Cari dan pilih Purchase Invoice yang sudah ada.
     - Data diambil dari API `/api/v1/purchase-invoices` (cloud) atau lokal SQLite.
     - Setiap invoice menampilkan: invoice number, supplier, status, item count, total.
   - **Step 2 - Pilih Item & Qty**: Tentukan item dan kuantitas yang akan diretur.
     - Input alasan retur.
     - Qty control (+/-) untuk setiap item, tidak bisa melebihi qty invoice.
     - "Pilih Semua" / "Reset" untuk batch selection.
   - **Konfirmasi & Submit**: Alert dialog konfirmasi.

## Service: PurchaseReturnService

### Endpoints
| Mode | Endpoint | Method |
|------|----------|--------|
| Cloud | `{baseUrl}/api/v1/purchase-returns` | POST |
| Local | `http://{STB_IP}/api/v1/purchase-returns-sync` | POST |

### SQLite Tables
- **purchase_returns**: id, purchase_invoice_id, invoice_number, supplier_id, supplier_name, reason, total_return, created_at, synced, branch_id
- **purchase_return_items**: id, purchase_return_id, product_id, product_name, qty, price, subtotal

### Methods
| Method | Description |
|--------|-------------|
| `createTable()` | Membuat tabel purchase_returns dan purchase_return_items di SQLite |
| `getPurchaseReturnsLocal()` | Mengambil daftar retur dari SQLite/Storage lokal |
| `savePurchaseReturnLocal(invoice, items, reason)` | Menyimpan retur ke lokal tanpa sync |
| `submitPurchaseReturn(invoice, items, reason)` | Submit via API + simpan lokal; fallback offline |
| `pushUnsyncedPurchaseReturns()` | Sinkronisasi retur yang belum tersync ke API |
| `getPurchaseReturnEndpoint()` | Mendapatkan URL endpoint berdasarkan mode server |

### Offline-First Architecture
1. `submitPurchaseReturn` mengecek koneksi jaringan.
2. **Online**: POST ke API endpoint → simpan ke lokal dengan `synced=1`.
3. **Offline / Error**: simpan ke lokal dengan `synced=0`.
4. `pushUnsyncedPurchaseReturns` dipanggil secara periodik oleh background sync untuk mengirim data yang tertunda.
5. Semua data tetap tersimpan di SQLite untuk akses offline cepat.

### Payload Formats

**Cloud API**:
```json
{
  "purchase_invoice_id": 1,
  "reason": "Barang rusak",
  "branch_id": "1",
  "items": [
    { "product_id": "10", "qty": 2 }
  ]
}
```

**Local Go Sync Server**:
```json
{
  "purchase_invoice_id": 1,
  "invoice_number": "PO-001",
  "supplier_id": "2",
  "reason": "Barang rusak",
  "branch_id": "1",
  "total_return": 30000,
  "items": [
    {
      "product_id": "10",
      "product_name": "Barang A",
      "qty": 2,
      "price": 15000,
      "subtotal": 30000
    }
  ]
}
```

## File Structure
```
src/
├── services/
│   └── PurchaseReturnService.js     # Service: SQLite + API integration
├── screens/
│   └── purchase-order/
│       ├── PurchaseReturnListScreen.js    # List retur pembelian
│       └── PurchaseReturnFormScreen.js    # Form retur pembelian
__tests__/
└── PurchaseReturn.test.js           # Unit tests
docs/
└── purchase-return-mobile.md        # This file
```

## Testing
Run tests:
```bash
npm test -- __tests__/PurchaseReturn.test.js
```

Test coverage:
- Service: createTable, getPurchaseReturnsLocal, savePurchaseReturnLocal
- Service: submitPurchaseReturn (online & offline)
- Service: pushUnsyncedPurchaseReturns
- Mocks: SQLite, axios, netinfo, storage

## Integration Points
- **App.js**: Tab navigation "Retur Beli", header title, screen rendering
- **initDB**: `PurchaseReturnService.createTable()` dipanggil saat init
- **Background Sync**: `pushUnsyncedPurchaseReturns` dijalankan oleh backgroundSync

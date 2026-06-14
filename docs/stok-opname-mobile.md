# Stok Opname Mobile — Dokumentasi

## Flowchart

```
┌─────────────────────────────────────────────────────────────────┐
│                       App.js (State-based Nav)                  │
│                                                                 │
│  Tab Bar                                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Dashboard │ Kasir │ Stok │ Retur │ SO │ Kejadian │ ...    │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│         ▼ activeTab='stokOpname'                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              StokOpnameListScreen                        │    │
│  │  ┌──────┬────────────────────────────────────────┐      │    │
│  │  │Filters│ Semua │ Draft │ Completed │ Cancelled │      │    │
│  │  ├──────┴────────────────────────────────────────┤      │    │
│  │  │ [SO-17105021]                   [COMPLETED]   │      │    │
│  │  │ Pengecekan mingguan                            │      │    │
│  │  │ 2024-01-15            3 item dihitung         │      │    │
│  │  │ Selisih: -2 unit                              │      │    │
│  │  ├───────────────────────────────────────────────┤      │    │
│  │  │ [SO-17105088]                   [DRAFT]       │      │    │
│  │  │ ...                                           │      │    │
│  │  └───────────────────────────────────────────────┘      │    │
│  │                 [ + ] FAB                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                        │                                │
│         ▼ tap item               ▼ tap +                          │
│  ┌──────────────────┐    ┌───────────────────────────┐           │
│  │StokOpnameDetail   │    │  StokOpnameFormScreen     │           │
│  │                   │    │  (Create mode)            │           │
│  │ Header: SO-001    │    │                           │           │
│  │ Status: COMPLETED │    │ Branch (display only)     │           │
│  │                   │    │ Notes (textarea)          │           │
│  │ Info Section:     │    │                           │           │
│  │  Branch: Cab X    │    │ Items:                    │           │
│  │  Dibuat: ...      │    │  [Product Search Select]  │           │
│  │                   │    │  [Sistem] [Aktual] [Diff] │           │
│  │ Items List:       │    │  [+] Tambah Item          │           │
│  │  Product A        │    │                           │           │
│  │  Sis: 5 | Akt: 4  │    │ Total Selisih: -1         │           │
│  │  Diff: -1         │    │ [Simpan Stok Opname]      │           │
│  │                   │    └───────────────────────────┘           │
│  │ Actions:          │                                            │
│  │ [Selesaikan]      │                                            │
│  │ [Batalkan]        │                                            │
│  └──────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Screen Descriptions

### 1. StokOpnameListScreen
- **Path**: `src/screens/stok-opname/StokOpnameListScreen.js`
- **Purpose**: Lists all Stok Opname with filtering by status and pull-to-refresh
- **Key Features**:
  - `FlashList` for performant rendering
  - Uses `getStokOpnamesLocal` from `StokOpnameService`
  - Filter chips: Semua, Draft, Completed, Cancelled
  - Status badges with colors
  - FAB (+) to create a new record
- **Navigation**: Item tap -> `StokOpnameDetail`, + tap -> `StokOpnameForm`

### 2. StokOpnameDetailScreen
- **Path**: `src/screens/stok-opname/StokOpnameDetailScreen.js`
- **Purpose**: Detail view of a specific Stok Opname record
- **Key Features**:
  - Item listing showing `system_qty`, `actual_qty`, and `difference` per item
  - Total adjustment display
  - Actions (Complete / Cancel) if status is `draft`

### 3. StokOpnameFormScreen
- **Path**: `src/screens/stok-opname/StokOpnameFormScreen.js`
- **Purpose**: Create a new Stok Opname
- **Key Features**:
  - Adding rows dynamically
  - Modal product picker
  - Inputs for System Qty and Actual Qty
  - Automatically calculates differences
  - Validates and saves locally, triggers sync to cloud

## Offline Logic & SQLite

- Tables: `stok_opnames` and `stok_opname_items`
- Local saves handle generating the `opname_number` natively.
- **Sync**: Done via `submitStokOpname` and `pushUnsyncedStokOpnames` inside `StokOpnameService.js`. The queue runners in `OfflineQueueService` and `backgroundSync` pick up any unsynced (synced=0) items and send them to the Cloud.

## Database Tables
```sql
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
```
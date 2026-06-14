# Mobile Lost Inventory Flow

## Overview
The "Barang Hilang/Rusak" (Lost Inventory) feature allows cashiers or admins to report lost, damaged, or stolen inventory. Crucially, this feature supports offline capability out-of-the-box using the same SQLite storage and background queue system implemented for sales transactions.

## Architecture

### 1. UI Layer (`App.js`)
- **New Tab / Screen:** A new "Kejadian" tab (internally routed to `lost`) was added to the bottom tab bar.
- **Lost Inventory Dashboard:** Displays a list of all historical lost inventory reports from the local SQLite database. Uses `@shopify/flash-list` for smooth scrolling. Includes badges tracking whether an item is "Synced" or "Pending" via offline status tracking.
- **Reporting Modal:** A floating modal enabling users to:
  1. Search and select a product.
  2. Input quantity (qty).
  3. Select `loss_type` (HILANG or RUSAK).
  4. Optionally add a note/keterangan.

### 2. Service Layer (`src/services/LostInventoryService.js`)
Handles the persistence mapping to either SQLite (for native iOS/Android) or `localStorage` (for web).
- `createLostInventoryTable`: Called on startup by `initDB` to instantiate the `lost_inventories` table. 
- `saveLostInventory`: Stores the initial report locally with `synced=0`.
- `getLostInventoryLocal`: Pulls data to render the UI list.
- `pushUnsyncedLostInventory`: The core background-queue routine. It iterates over reports with `synced=0`, pushes them securely to the Golang backend (`POST /api/v1/lost-inventories-sync`), and marks them as `synced=1` in the local DB.

### 3. Background Offline Queue (`src/services/backgroundSync.js` & `OfflineQueueService.js`)
The `pushUnsyncedLostInventory` routine is wired directly into the NetInfo connectivity listeners in `backgroundSync.js` and `OfflineQueueService.js`.
- Whenever the device regains internet connection, `pushUnsyncedTransactions` will eventually call `await pushUnsyncedLostInventory()`.
- Failed connections gracefully do nothing and keep `synced=0` for future retries.

## Table Schema (SQLite `lost_inventories`)
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `product_id`: TEXT
- `product_name`: TEXT
- `qty`: REAL
- `loss_type`: TEXT ('hilang' | 'rusak')
- `note`: TEXT
- `reported_at`: DATETIME
- `synced`: INTEGER (0 = false, 1 = true)
- `branch_id`: TEXT

## Backend API Target
**Endpoint:** `POST /api/v1/lost-inventories-sync`
**Payload:**
```json
{
  "product_id": "string",
  "product_name": "string",
  "qty": "number",
  "loss_type": "hilang | rusak",
  "note": "string",
  "reported_at": "string (ISO-8601)",
  "branch_id": "string"
}
```

## Testing
Unit and integration tests are available in `tests/test-lost-inventory.js`. These run independently using Node to mock the NetInfo and API components to confirm correct synced transitions and fallback behavior.
# Riwayat Penjualan (Sales History)

## Overview
The Sales History screen provides a comprehensive list of all transactions made through the mobile application. It supports both online (API-based) and offline (SQLite-based) operation modes.

## Key Features
- **Tab Navigation**: Integrated into the main application footer as the "Riwayat" tab.
- **Sales List**: Displays sales with Invoice Number, Total Amount, Status (Lunas/Void), and Date.
- **Filtering**: Filter transactions by:
  - All (Semua)
  - Today (Hari Ini)
  - This Month (Bulan Ini)
  - Voided transactions
- **Search**: Search for specific invoices by invoice number.
- **Detail View**: View items within a specific transaction by clicking on the row.
- **Void Transaction**: Ability to void a transaction. 
  - If online, it sends a request to the server immediately.
  - If offline, it marks the transaction as `void_pending` and queues the request for later synchronization.

## Integration Details
- **Data Source**: 
  - API: `GET /api/v1/sales`
  - SQLite: `sales` and `sale_items` tables.
- **Syncing**: Handled via `OfflineQueueService` and background sync processes.
- **Components used**: `FlashList` for performance, `lucide-react-native` for icons.

## How to Access
1. Open the application.
2. Log in with your credentials.
3. Click the "Riwayat" icon (Scroll icon) in the bottom navigation bar.

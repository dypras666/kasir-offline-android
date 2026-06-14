# Mobile Expense Flow (Biaya Operasional)

## Overview

The Expense (Biaya Operasional) module allows users to record operational costs (electricity, water, internet, transport, salary, maintenance, etc.) and view expense history. The mobile app communicates with the Go local sync server, NOT directly to the cloud.

## Architecture

```
┌─────────────────┐       POST/GET /api/v1/expenses        ┌──────────────────┐
│  React Native   │ ────────────────────────────────────>  │  Go Local Sync   │
│  Expo App       │ <────────────────────────────────────  │  Server          │
│                 │       JSON responses                   │  (port 8081)     │
└─────────────────┘                                       └──────────────────┘
        │                                                          │
        │  Offline Fallback (SQLite / localStorage)                │
        ▼                                                          ▼
┌─────────────────┐                                       ┌──────────────────┐
│  Local DB       │                                       │  Cloud Server    │
│  (expenses      │                                       │  (sync via Go)   │
│   table)        │                                       │                  │
└─────────────────┘                                       └──────────────────┘
```

- **Mobile**: React Native Expo (`kasirofflineexpo`)
- **Server**: Go local sync server (e.g., `192.168.1.250:8081`)
- **Endpoint**: `/api/v1/expenses` (POST for create, GET for list)
- **Offline Fallback**: Local SQLite table (`expenses`) or localStorage (Web) with background sync

## Files

| File | Purpose |
|------|---------|
| `src/screens/ExpenseScreen.js` | Expense input form (judul, amount, kategori, keterangan, tanggal) |
| `src/screens/ExpenseHistoryScreen.js` | Expense list with pull-to-refresh, empty/loading/error states |
| `src/services/ExpenseService.js` | API service + offline fallback + sync + table creation |
| `App.js` | Navigation integration via `activeTab` state |
| `tests/test-expense.js` | Integration test for local storage, branch filtering, sync simulation |

## Navigation Flow

1. User taps **Biaya** in the dashboard sidebar menu.
2. `activeTab` is set to `'expenseHistory'` → renders `ExpenseHistoryScreen`.
3. In `ExpenseHistoryScreen`, tapping **Tambah** navigates to `activeTab='expense'` → renders `ExpenseScreen`.
4. After successful submission, `ExpenseScreen` navigates to `ExpenseHistoryScreen`.
5. Back buttons in both screens return to the dashboard.

## Component Details

### ExpenseScreen.js

- **Props**: `{ navigation, selectedBranch }`
- **Fields**:
  - `judul` (Text, required) — expense title
  - `amount` (Numeric, required) — cost in Rupiah
  - `kategori` (Picker/Dropdown, required) — one of: listrik, air, internet, transport, gaji, maintenance, lainnya
  - `tanggal` (Text, YYYY-MM-DD, defaults to today)
  - `keterangan` (Text, optional) — additional notes
- **Validation**: judul non-empty, amount > 0, tanggal required
- **On submit**: Calls `ExpenseService.createExpense()`, shows success toast, clears form, navigates to history
- **States**: Loading spinner during submit, error toast on failure

### ExpenseHistoryScreen.js

- **Props**: `{ navigation, selectedBranch }`
- **Features**:
  - Pull-to-refresh via `RefreshControl`
  - Loading indicator (initial load)
  - Error state with "Coba Lagi" retry button
  - Empty state ("Belum ada biaya operasional.")
  - Card-based list with reference_no, date, title, category badge, amount, status, notes
- **Header**: Back button (to dashboard), title, **Tambah** button (to ExpenseScreen)

### ExpenseService.js

- **`createExpense(data)`**: POST to `/api/v1/expenses` with dynamic base URL. Falls back to local SQLite/localsStorage if server unreachable → returns `{ offline: true }`.
- **`getExpenses(params)`**: GET `/api/v1/expenses?branch_id=...`. Falls back to local data if server unreachable.
- **`saveExpenseLocal(data)`**: Save expense to local SQLite (or localStorage on Web) with `synced=0`.
- **`getExpensesLocal(branchId)`**: Read local expenses, filtered by branch, sorted by `created_at DESC`.
- **`syncExpenses()`**: Push all unsynced expenses (`synced=0`) to server, mark as synced. Called by background sync.
- **`createExpenseTable()`**: Creates SQLite `expenses` table in `initDB()` — called from App.js.
- Uses dynamic `getBaseUrl()` (reads `local_server_ip` from storage) instead of hardcoded API URL.

## API Payload

### POST /api/v1/expenses
```json
{
  "judul": "Pembayaran Listrik Juni",
  "amount": 500000,
  "kategori": "listrik",
  "tanggal": "2025-06-15",
  "keterangan": "Tagihan bulanan",
  "branch_id": 1
}
```

### GET /api/v1/expenses?branch_id=1
```json
[
  {
    "id": 1,
    "reference_no": "EXP-20250615-001",
    "judul": "Pembayaran Listrik Juni",
    "amount": 500000,
    "kategori": "listrik",
    "tanggal": "2025-06-15",
    "keterangan": "Tagihan bulanan",
    "status": "pending",
    "branch_id": 1,
    "created_at": "2025-06-15T10:30:00Z"
  }
]
```

## Offline Queue & Sync

| Scenario | Behavior |
|----------|----------|
| Server reachable | POST/GET to Go server normally |
| Server unreachable (POST) | Save to local SQLite/localsStorage with `synced=0`. Background sync retries later. |
| Server unreachable (GET) | Return data from local SQLite/localsStorage |
| Background sync | `syncExpenses()` pushes unsynced records to `POST /api/v1/expenses` and marks `synced=1` |

### Local SQLite Schema
```sql
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_no TEXT,
  judul TEXT NOT NULL,
  amount REAL NOT NULL,
  kategori TEXT DEFAULT 'lainnya',
  tanggal TEXT NOT NULL,
  keterangan TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  branch_id TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced INTEGER DEFAULT 0
);
```

## Key Design Decisions

1. **Dynamic base URL**: Uses `getBaseUrl()` — reads `local_server_ip` from storage, constructs `http://{ip}` dynamically instead of hardcoded URL.
2. **Tab-based navigation**: Uses `activeTab` state in App.js (not React Navigation) — consistent with the rest of the app.
3. **Branch-aware**: `branch_id` is derived from `selectedBranch?.id` or `user?.branch_id`.
4. **Dark theme**: Consistent `#0f172a` background, `#1e293b` cards, `#2563eb` accent (slate blue palette).
5. **Offline-first fallback**: If server is unavailable, expense data is stored locally and auto-synced via background sync process.
6. **Web compatibility**: Uses localStorage fallback when running on Web platform (no SQLite on Web).

## Testing

```bash
# Run expense-specific test
node tests/test-expense.js

# Run all tests
npm test
```

### Test Coverage (test-expense.js)
- Saving expense locally stores correct data (judul, amount, synced=0, status=pending)
- Fetching expenses returns sorted list (newest first)
- Filtering expenses by branch_id works correctly
- Empty expense list returns empty array
- Marking local expense as synced updates correctly

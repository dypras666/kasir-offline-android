# Expo Web SQLite API Bypass & Background Sync Documentation

## Overview
Expo SQLite (`expo-sqlite`) is only compatible with native platforms (Android & iOS). For the Web platform, we implement an API bypass pattern that routes all database operations to a remote or local REST API via Axios.

Additionally, on **non-web platforms** (Android/iOS), transactions are saved locally to SQLite during checkout. A **background queue runner** (`src/services/backgroundSync.js`) automatically pushes unsynced transactions to the backend when connectivity resumes.

## Implementation Details

### 1. Database Initialization (`initDB`)
On the web, we skip SQLite table creation and directly load data from the API.
```javascript
const initDB = useCallback(() => {
  if (Platform.OS === 'web') {
    loadProducts(); // Fetch directly from API
    return;
  }
  // Native SQLite logic...
}, [loadProducts]);
```

### 2. Data Loading Fallback
All loading functions check `Platform.OS === 'web'`.
- **Native:** Fetches from local SQLite `db` using `db.getAllSync()`.
- **Web:** Fetches from REST API using `axios.get()`.

### 3. Transaction Logic (`checkout`)
When a transaction is made:
- **Native:**
  1. Sale + items saved to SQLite `sales` / `sale_items` tables with default `synced=0`.
  2. No immediate API push — queued for background sync.
- **Web:**
  1. Attempt to post directly to API via `axios.post()`.
  2. Always save the transaction to `local_sales` in `localStorage` for Dashboard stats (Omset, Today Count).
  3. Mark as `synced: 1` if API call succeeded, or `synced: 0` if failed.

### 4. Data Synchronization (`syncData`)
The manual sync function handles both native and web differently:
- **Native:** Pushes unsynced rows from SQLite to API.
- **Web:** Pushes unsynced entries from `local_sales` (localStorage) to API and updates the local status.

### 5. Background Sync Queue (`src/services/backgroundSync.js`)
New service that provides automatic offline transaction sync.

#### Architecture
```
┌─────────────┐     ┌──────────────────────┐     ┌──────────┐
│  Checkout   │────▶│  SQLite (synced=0)    │     │  NetInfo │
│  (Android/  │     │  or localStorage      │     │ Listener │
│   iOS)      │     │  (web)                │     │          │
└─────────────┘     └─────────┬────────────┘     └─────┬────┘
                              │                        │
                              │  On Connectivity        │
                              │  Resume                 │
                              ▼                        ▼
                    ┌──────────────────────┐
                    │  pushUnsyncedTxns()   │
                    │  - Read synced=0      │
                    │  - POST to API        │
                    │  - Mark synced=1      │
                    └──────────────────────┘
```

#### Key Functions

**`startBackgroundSync()`**
- Called once in `App.js` `useEffect` during app initialization.
- Registers a `NetInfo.addEventListener` callback.
- When connectivity changes to `isConnected && isInternetReachable !== false`, triggers `pushUnsyncedTransactions()`.

**`stopBackgroundSync()`**
- Called on component unmount (`useEffect` cleanup).
- Unregisters the NetInfo listener.

**`pushUnsyncedTransactions()`**
- **Concurrency guard:** Uses `isSyncing` flag to prevent parallel runs.
- **Web path:** Reads `local_sales` from localStorage, POSTs each unsynced sale to the API, marks as `synced=1`.
- **Native path:** Reads all sales with `synced=0` from SQLite, fetches their `sale_items`, POSTs to API, updates `synced=1` in DB.
- Handles API failures gracefully — leaves `synced=0` for retry.

#### Dependencies
- `@react-native-community/netinfo` — for connectivity monitoring
- `expo-sqlite` (native only) — for local SQLite access
- `axios` — for API calls

## Storage Management
We use a unified `Storage` abstraction that detects the platform:
- **Native:** Uses `expo-secure-store`.
- **Web:** Uses `window.localStorage`.

## Real-time Dashboard Updates
On the Web, the Dashboard reads from `local_sales`. By saving transactions locally during checkout, we ensure the UI reflects the latest sales immediately without waiting for a full re-sync.

## File Reference
| File | Purpose |
|------|---------|
| `src/services/backgroundSync.js` | Background queue runner (start/stop + push logic) |
| `src/services/api.js` | Storage abstraction, base URL, auth |
| `App.js` | Integrates background sync lifecycle |
| `tests/test-background-sync.js` | Integration tests (10 tests) |
| `tests/test-web-bypass.js` | Web bypass integration tests |

## Testing
Run background sync tests:
```bash
node tests/test-background-sync.js
```

Run all tests:
```bash
npm test
```

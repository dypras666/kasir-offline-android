# Daily Sales Recap (Rekap Penjualan Harian) — Mobile Screen

## Screen Structure

```
DailySalesRecapScreen
│
├── Header
│   ├── Back button (←) → navigates back to Riwayat
│   ├── Title: "Rekap Penjualan Harian"
│   ├── Subtitle: date range description (Hari Ini / Kemarin / Custom range)
│   └── Refresh button (↻)
│
├── Date Filter Bar
│   ├── [Hari Ini]  → sets datePreset = 'today'
│   ├── [Kemarin]   → sets datePreset = 'yesterday'
│   └── [Custom]    → opens modal for custom date input (YYYY-MM-DD)
│
├── Content (conditional)
│   │
│   ├── LOADING STATE
│   │   └── ActivityIndicator + "Memuat rekap penjualan..."
│   │
│   ├── ERROR STATE
│   │   ├── Error icon + error message text
│   │   └── [Coba Lagi] button → retries fetchRecap()
│   │
│   └── DATA STATE (ScrollView with RefreshControl)
│       │
│       ├── Section: "Ringkasan Penjualan"
│       │   ├── Card 1: Total Penjualan (Rp)
│       │   │   ├── Icon: TrendUp
│       │   │   └── Value: formatRp(total_sales)
│       │   ├── Card 2: Total Transaksi
│       │   │   ├── Icon: BarChart3
│       │   │   └── Value: formatNumber(total_transactions)
│       │   └── Card 3: Rata-rata Transaksi
│       │       ├── Icon: TrendUp
│       │       └── Value: formatRp(average_transaction)
│       │
│       └── Section: "Breakdown Metode Bayar"
│           ├── (Empty state) → Wallet icon + "Belum ada data pembayaran"
│           └── For each payment method:
│               ├── Method name (colored dot + label)
│               ├── Total amount (Rp)
│               ├── Transaction count
│               ├── Percentage
│               └── Progress bar (width = percentage)
│
└── Custom Date Modal (Modal overlay)
    ├── Title: "Pilih Rentang Tanggal"
    ├── Input: Tanggal Mulai (YYYY-MM-DD)
    ├── Input: Tanggal Akhir (YYYY-MM-DD)
    ├── [Batal] → closes modal, resets to 'today'
    └── [Terapkan] → closes modal, triggers re-fetch
```

## Flow Diagram (Text-Based)

```
User opens Riwayat tab
        │
        ▼
[Lihat Rekap Penjualan] button
        │
        ▼
DailySalesRecapScreen mounts
        │
        ▼
fetchRecap() called
        │
        ├── Loading → ActivityIndicator displayed
        │
        ├── Error  → Error message + Retry button
        │
        └── Success → Display:
                       • Summary cards (3 cards)
                       • Payment breakdown list
        │
        ▼
User can:
  ├── Pull down → RefreshControl triggers onRefresh → fetchRecap()
  ├── Tap date filter → changes datePreset → re-fetches
  ├── Tap [Custom] → modal for custom dates
  ├── Tap refresh icon (header) → manual re-fetch
  └── Tap back → returns to Riwayat tab
```

## API Calls

### GET /api/v1/sales/daily-recap

**Base URL:** dynamic from `getBaseUrl()` in `services/api.js`
**Auth:** Bearer token (auto-attached via axios interceptor from `api` instance)

**Request:**
```
GET {baseUrl}/api/v1/sales/daily-recap?start_date=2025-01-01&end_date=2025-01-01&branch_id=1
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter   | Type   | Description                        |
|-------------|--------|------------------------------------|
| start_date  | string | Start date (YYYY-MM-DD)            |
| end_date    | string | End date (YYYY-MM-DD)              |
| branch_id   | int    | Branch ID from selectedBranch/user |

**Expected Response Shape:**
```json
{
  "data": {
    "total_sales": 5000000,
    "total_transactions": 25,
    "average_transaction": 200000,
    "payment_breakdown": [
      {
        "method": "TUNAI",
        "amount": 3000000,
        "count": 15,
        "percentage": 60.0
      },
      {
        "method": "QRIS",
        "amount": 2000000,
        "count": 10,
        "percentage": 40.0
      }
    ]
  }
}
```

**Fallback fields** (covers various API response shapes):
- `total_sales` → fallback: `data.total` || `0`
- `total_transactions` → fallback: `data.count` || `0`
- `average_transaction` → fallback: `data.average` || `0`
- `payment_breakdown` → fallback: `data.payments` || `[]`

## Error Handling

| Scenario                   | Behavior                                                           |
|----------------------------|--------------------------------------------------------------------|
| Network error              | Shows error message from `err.message`, retry button available     |
| API returns 401            | Axios interceptor clears token (api.js)                            |
| API returns 4xx/5xx        | Shows `err.response.data.message` or generic error                 |
| Null/missing response data | All access use `?.` (optional chaining) + `??` / `||` fallbacks   |
| Empty breakdown array      | Shows "Belum ada data pembayaran" empty state                      |

**Null safety applied to:**
- `response.data?.data || response.data || {}`
- `summary?.total_sales ?? 0`
- `summary?.total_transactions ?? 0`
- `summary?.average_transaction ?? 0`
- `paymentBreakdown || []`
- `pmt.method || pmt.payment_method || pmt.name || \`Metode ${index + 1}\``
- `pmt.amount ?? pmt.total ?? 0`
- `pmt.count ?? pmt.transaction_count ?? 0`
- `pmt.percentage ?? 0`
- `selectedBranch?.id || user?.branch_id || 1`

## States

| State       | Visual Indicator                            | User Action          |
|-------------|---------------------------------------------|----------------------|
| Loading     | `ActivityIndicator` + "Memuat rekap..."     | None                 |
| Error       | Error icon + message + Retry button         | Tap [Coba Lagi]      |
| Refreshing  | Pull-to-refresh spinner                      | Pull down to refresh |
| Empty data  | Summary cards (zero values) + empty breakdown| Change date filter   |
| Success     | Full cards + payment breakdown               | Filter/refresh       |

## Navigation Registration

**File:** `App.js`

- Screen import: `import DailySalesRecapScreen from './src/screens/DailySalesRecapScreen';`
- Tab key: `'recap'` (activeTab state)
- Access: From Riwayat tab → "Lihat Rekap Penjualan" button → sets `activeTab('recap')`
- Back: `navigation.goBack()` → sets `activeTab('riwayat')`

## Files Created/Modified

| File                                            | Action   | Description                                   |
|------------------------------------------------|----------|-----------------------------------------------|
| `src/screens/DailySalesRecapScreen.js`         | Created  | New daily sales recap screen                  |
| `App.js`                                        | Modified | Added import, state, tab rendering, button    |
| `docs/daily-sales-recap-mobile.md`             | Created  | This documentation file                       |

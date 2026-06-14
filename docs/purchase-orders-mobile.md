# Purchase Orders Mobile — Dokumentasi

## Flowchart

```
┌─────────────────────────────────────────────────────────────────┐
│                       App.js (State-based Nav)                  │
│                                                                 │
│  Tab Bar                                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Dashboard │ Kasir │ Stok │ Retur │ PO │ Kejadian │ ...  │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│         ▼ activeTab='purchaseOrder'                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PurchaseOrderScreen                         │    │
│  │  ┌──────┬────────────────────────────────────────┐      │    │
│  │  │Filters│ Semua │ Draft │ Approved │ ... │      │      │    │
│  │  ├──────┴────────────────────────────────────────┤      │    │
│  │  │ [PO-001]                        [APPROVED]   │      │    │
│  │  │ Supplier A                                    │      │    │
│  │  │ 2024-01-15            3 item                  │      │    │
│  │  │ Rp 1.500.000                                  │      │    │
│  │  ├───────────────────────────────────────────────┤      │    │
│  │  │ [PO-002]                        [DRAFT]       │      │    │
│  │  │ Supplier B                                    │      │    │
│  │  │ ...                                           │      │    │
│  │  └───────────────────────────────────────────────┘      │    │
│  │                 [ + ] FAB                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                        │                                │
│         ▼ tap item               ▼ tap +                          │
│  ┌──────────────────┐    ┌───────────────────────────┐           │
│  │PurchaseOrderDetail│    │  PurchaseOrderFormScreen  │           │
│  │                   │    │  (Create or Edit mode)    │           │
│  │ Header: PO-001   │    │                           │           │
│  │ Status: APPROVED │    │ Supplier picker (search)  │           │
│  │                   │    │ Branch (display only)    │           │
│  │ Info Section:    │    │ Order Date               │           │
│  │  Supplier: A    │    │ Expected Date            │           │
│  │  Branch: Cab X  │    │ Notes (textarea)         │           │
│  │  Order: ...     │    │                           │           │
│  │                   │    │ Items:                    │           │
│  │ Items List:      │    │  [Product Search Select]  │           │
│  │  Product A       │    │  [Qty] [Unit Price] [×]  │           │
│  │  5 x Rp 10.000  │    │  Subtotal: Rp 50.000     │           │
│  │  = Rp 50.000    │    │  [+] Tambah Item          │           │
│  │                   │    │                           │           │
│  │ Actions:         │    │ Total: Rp XXX            │           │
│  │ [Approve]        │    │ [Buat Purchase Order]    │           │
│  │ [Cancel]         │    └───────────────────────────┘           │
│  │ [→ Invoice]      │                                            │
│  └──────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Screen Descriptions

### 1. PurchaseOrderScreen
- **Path**: `src/screens/purchase-order/PurchaseOrderScreen.js`
- **Purpose**: Lists all Purchase Orders with filtering, pagination, and pull-to-refresh
- **Key Features**:
  - FlashList for performant rendering
  - Filter chips: Semua, Draft, Approved, Partial, Completed, Cancelled
  - Pull-to-refresh via RefreshControl
  - Infinite scroll pagination (load more on `onEndReached`)
  - Status badges with color-coded backgrounds
  - FAB button (+) to create new PO
  - Empty state with icon and guidance text
  - Loading, error, and retry states
- **Navigation**: On item tap → `PurchaseOrderDetail`; On + tap → `PurchaseOrderForm`

### 2. PurchaseOrderDetailScreen
- **Path**: `src/screens/purchase-order/PurchaseOrderDetailScreen.js`
- **Purpose**: Shows full detail of a single Purchase Order with action buttons
- **Key Features**:
  - Header with PO number and status badge
  - Info section: Supplier, Branch, Order Date, Expected Date, Notes
  - Items list: product name, qty_ordered, qty_received, unit_price, subtotal
  - Total amount at bottom of items
  - Conditional action buttons:
    - **Approve** (status=draft) — green, calls `approvePurchaseOrder`
    - **Cancel** (status=draft|approved) — red, calls `cancelPurchaseOrder`
    - **Convert to Invoice** (status=approved|partially_received) — blue, calls `convertToInvoice`
  - Alert confirmation dialogs before destructive actions
  - Loading/error states with retry

### 3. PurchaseOrderFormScreen
- **Path**: `src/screens/purchase-order/PurchaseOrderFormScreen.js`
- **Purpose**: Create new or edit existing Purchase Order
- **Two modes**: Create (no `editPurchaseOrder` prop) / Edit (has `editPurchaseOrder`)
- **Key Features**:
  - **Supplier Picker**: Toggleable searchable dropdown, loads from `getSuppliers` API, shows results in a scroll list
  - **Branch**: Read-only display from `selectedBranch` or user context
  - **Order Date**: Text input formatted YYYY-MM-DD
  - **Expected Date**: Optional date input
  - **Notes**: Multiline textarea
  - **Items Section**:
    - "Tambah Item" button to add rows
    - Each row: Product search/select dropdown (from `getProducts` API), Qty numeric input, Unit Price numeric input, Remove button
    - Shows subtotal per item
    - Inline product picker with search/filter
  - **Total Amount**: Calculated sum of all item subtotals
  - **Submit Button**: Validates then calls `createPurchaseOrder` or `updatePurchaseOrder`
  - **Form Validation**: supplier required, date required, at least 1 item, qty > 0, price >= 0
  - **Success Toast**: On success, navigates back to list

## State Management Explanation

The project uses **state-based navigation** (no React Navigation library). Navigation is controlled by boolean/string state variables in `App.js`.

### Pattern:

```jsx
// In App.js — tab-based navigation
const [activeTab, setActiveTab] = useState('dashboard');

// Each screen receives a mock navigation object
navigation={{
  goBack: () => setActiveTab('previousTab'),
  navigate: (route, params) => {
    if (route === 'SomeScreen') {
      setSomeData(params?.data);
      setActiveTab('someScreenTab');
    }
  }
}}
```

### Purchase Order State Variables in App.js

| Variable | Type | Purpose |
|----------|------|---------|
| `selectedPO` | object/null | Holds the PO data passed to detail screen |
| `editPO` | object/null | Holds PO data when editing (null = create mode) |

### Tab Navigation

The `activeTab` string controls which screen is rendered:
- `'purchaseOrder'` → `PurchaseOrderScreen`
- `'purchaseOrderDetail'` → `PurchaseOrderDetailScreen`
- `'purchaseOrderForm'` → `PurchaseOrderFormScreen`

### Data Flow

1. User taps "PO" in tab bar → `setActiveTab('purchaseOrder')` → PurchaseOrderScreen renders
2. User taps a PO card → `navigation.navigate('PurchaseOrderDetail', { purchaseOrder: item })` → sets `selectedPO` + `activeTab('purchaseOrderDetail')`
3. User taps + → `navigation.navigate('PurchaseOrderForm')` → clears `editPO` + `activeTab('purchaseOrderForm')`
4. From detail, user taps "Edit" → `setEditPO(selectedPO)` + `activeTab('purchaseOrderForm')` → form in edit mode
5. Form submit success → `navigation.goBack()` → returns to list with new data

## Service Methods Table

| Method | HTTP | Endpoint | Parameters | Purpose |
|--------|------|----------|------------|---------|
| `getPurchaseOrders(params)` | GET | `/api/v1/purchase-orders` | `status`, `supplier_id`, `page`, `per_page`, `branch_id` | List PO with filters & pagination |
| `getPurchaseOrder(id)` | GET | `/api/v1/purchase-orders/{id}` | — | Get single PO detail |
| `createPurchaseOrder(data)` | POST | `/api/v1/purchase-orders` | PO payload (see below) | Create new PO |
| `updatePurchaseOrder(id, data)` | PUT | `/api/v1/purchase-orders/{id}` | PO payload | Update existing PO |
| `approvePurchaseOrder(id)` | POST | `/api/v1/purchase-orders/{id}/approve` | — | Approve draft PO |
| `cancelPurchaseOrder(id)` | POST | `/api/v1/purchase-orders/{id}/cancel` | — | Cancel PO |
| `convertToInvoice(id)` | POST | `/api/v1/purchase-orders/{id}/convert-to-invoice` | — | Convert approved PO to invoice |
| `getSuppliers(params)` | GET | `/api/v1/suppliers` | `search` | List suppliers for picker |
| `getProducts(params)` | GET | `/api/v1/products` | `branch_id`, `search` | List products for item picker |

## Payload Examples

### Create Purchase Order

```json
{
  "supplier_id": 1,
  "branch_id": 1,
  "order_date": "2024-01-15",
  "expected_delivery_date": "2024-01-22",
  "notes": "PO untuk restock bulan Januari",
  "items": [
    {
      "product_id": 101,
      "qty_ordered": 10,
      "unit_price": 15000
    },
    {
      "product_id": 102,
      "qty_ordered": 5,
      "unit_price": 25000
    }
  ]
}
```

### Update Purchase Order

Same structure as create, sent as PUT to `/api/v1/purchase-orders/{id}`.

### Response Shape (GET /api/v1/purchase-orders)

```json
{
  "data": [
    {
      "id": 1,
      "po_number": "PO-202401-001",
      "supplier": { "id": 1, "name": "Supplier A" },
      "branch": { "id": 1, "name": "Cabang Pusat" },
      "order_date": "2024-01-15",
      "expected_delivery_date": "2024-01-22",
      "status": "draft",
      "total_amount": 200000,
      "notes": "Catatan PO",
      "items": [
        {
          "id": 1,
          "product": { "id": 101, "name": "Produk A" },
          "qty_ordered": 10,
          "qty_received": 0,
          "unit_price": 15000,
          "subtotal": 150000
        }
      ],
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "current_page": 1,
  "per_page": 20,
  "total": 1,
  "last_page": 1
}
```

## Status Values & Color Mapping

| Status | Indonesian | Badge Bg | Badge Text |
|--------|-----------|----------|------------|
| `draft` | Draft | `#fef9c7` (yellow) | `#a16207` |
| `approved` | Disetujui | `#dbeafe` (blue) | `#1e40af` |
| `partially_received` | Diterima Sebagian | `#fef08a` (amber) | `#854d0e` |
| `completed` | Selesai | `#bbf7d0` (green) | `#166534` |
| `cancelled` | Dibatalkan | `#fecaca` (red) | `#991b1b` |

## File Structure

```
src/
├── services/
│   └── PurchaseOrderService.js       ← API service for PO operations
├── screens/
│   └── purchase-order/
│       ├── PurchaseOrderScreen.js    ← List screen with filters
│       ├── PurchaseOrderDetailScreen.js ← Detail screen with actions
│       └── PurchaseOrderFormScreen.js   ← Create/Edit form
App.js                                 ← Integration (imports, state, tab bar)
docs/
└── purchase-orders-mobile.md         ← This documentation
```

## Dependencies Required

All dependencies are already present in the project:
- `@shopify/flash-list` — performant list rendering
- `lucide-react-native` — icons (ClipboardList, CheckCircle, XCircle, FileInput, etc.)
- `sonner-native` — toast notifications
- Standard React Native components (StyleSheet, TouchableOpacity, TextInput, etc.)

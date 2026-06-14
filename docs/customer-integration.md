# Customer Integration — Mobile App

Documentation for Offline-First Customer Management and POS Integration.

## 1. Overview

The customer module consists of three main parts:
1. **CustomerScreen**: Full CRUD interface for managing customers offline.
2. **CustomerPicker**: Modal component for selecting customers during the checkout process.
3. **CustomerService & Sync**: Data persistence layer with SQLite/Web storage and server synchronization.

## 2. Technical Stack

- **Persistence**: 
  - **Native**: SQLite via `expo-sqlite` (table: `customers`).
  - **Web**: `localStorage` (key: `customers_local`).
- **Sync**: `CustomerSyncQueue` for buffering offline CRUD operations and pushing to `/api/v1/customers`.
- **UI Components**: `lucide-react-native` for icons, `FlashList` for performance, and standard React Native components.

## 3. Integration Details

### Navigation Wiring
The `CustomerScreen` is wired into the main tab navigation in `App.js` under the ID `pelanggan`. 
- Access via Bottom Tab: **Pelanggan** (User icon).
- Header Title: "Data Pelanggan".

### POS Integration
- **State**: Managed in `App.js` via `selectedCustomer` and `showCustomerPicker`.
- **UI**: A customer selection bar appears in the POS (Kasir tab) when the cart has items.
- **Payload**: The `customer_id` is automatically included in the sale payload (SQLite and API).

### Offline CRUD & Sync
- **CRUD Operations**: Handled by `CustomerService`.
- **Automatic Sync**: `BackgroundSyncService` calls `CustomerSyncQueue.pushUnsynced()` when connectivity is restored.
- **Sales Sync**: Both Web and Native sync logic includes `customer_id` in the `POST /api/v1/sales` payload.

## 4. Usage Flow

1. **Management**: Navigate to the **Pelanggan** tab to add, edit, or delete customers. Search by name, phone, or email.
2. **Checkout**: 
   - Add products to the cart in the **Kasir** tab.
   - Tap the customer selection bar (User icon) at the bottom.
   - Select a customer or clear the selection.
   - Complete the payment. The sale will be linked to the selected customer.

## 5. Testing & Verification

- **Unit Tests**: `__tests__/customerUI.test.js` covers 9 core scenarios.
- **Run Tests**: `npx jest __tests__/customerUI.test.js`
- **Verification**: `npx expo-doctor` verified for configuration and dependency health.

---
*Last updated: 2026-06-14*

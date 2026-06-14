# Mobile Multi-Payment / Split Payment Flow

## 1. Overview
The Multi-Payment feature allows users to settle a sale using multiple payment methods (e.g., Cash Rp50,000 + QRIS Rp20,000) instead of a single payment method. It handles validation, UI feedback, and offline sync.

## 2. Components
### PaymentMethodPicker
- **File:** `src/components/PaymentMethodPicker.js`
- **Purpose:** A modal component to select a payment method from available options (CASH, QRIS, TRANSFER, CARD).
- **Behavior:** On selection, it appends the method to the checkout payments array with the remaining amount.

## 3. Implementation Details (App.js)
- **State Management:**
  - `payments[]`: Array of `{ payment_method_id, amount }`.
  - `showPaymentPicker`: Controls the picker modal.
- **Validation Logic:**
  - `sum(payments.amount)` must equal the total sale amount.
  - Real-time feedback: Shows "Sisa: RpX" if under-paid, or a green checkmark if exact.
- **Checkout Process:**
  - If `payments` is empty, defaults to a single "CASH" payment.
  - If multiple payments exist, `payment_method` string is set to `'SPLIT'`.
  - SQLite (Native): Stores payments as a JSON string in the `payments` column.
  - LocalStorage (Web): Stores as a JSON array.

## 4. Sync Mechanism
### OfflineQueueService & backgroundSync
- Both services send the `payments` array in the JSON payload to the Laravel/Go-Sync API.
- Native path parses the SQLite JSON string back into an object before sending.
- Web path sends the stored array directly.

## 5. Refunds (Returns)
- **Screen:** `src/screens/retur/ReturnFormScreen.js`
- **Logic:**
  - When returning a sale, the component reads the original sale's `payments` array.
  - The user must select which payment method should be used for the refund (from the original methods used).
  - Passes `refund_type` to `ReturnService`.

## 6. Testing Instructions
1. Add items to cart in POS.
2. Open checkout modal.
3. Tap "Tambah Metode Bayar" and select a second method.
4. Adjust amounts until they match the total.
5. Tap "SELESAIKAN PEMBAYARAN".
6. Verify in "Riwayat" that the sale shows multiple payments.
7. Verify sync to cloud API.
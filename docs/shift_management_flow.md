# Shift Management Flow

This document describes the Shift Management (Buka/Tutup Kasir) flow in the Expo application.

## 1. Shift Detection on Login
- When a user logs in, the app checks their role. If the role is `Kasir` or `Kasir Cabang`, the `App.js` triggers `checkCurrentShift()`.
- The system checks the backend using `ShiftService.getCurrentShift()`.
- **Active Shift found:** Updates the `currentShift` state, allowing the Kasir to operate normally. An indicator is shown on the top bar.
- **No Active Shift found:** The app sets `showOpenShiftModal` to `true`, presenting the `OpenShiftScreen`.

## 2. Buka Shift (Open Shift)
- **Component:** `OpenShiftScreen` (`src/screens/shift/OpenShiftScreen.js`)
- **Action:** Cashier enters the starting cash amount (`initial_cash`).
- **API Call:** Sends data to `/api/v1/shifts/open` with `branch_id` and `initial_cash`.
- **Result:** Upon successful API response, updates `currentShift` state and hides the modal.

## 3. Tutup Shift (Close Shift)
- **Component:** `CloseShiftScreen` (`src/screens/shift/CloseShiftScreen.js`)
- **Trigger:** Accessible via the "Tutup Shift" button in the app header for users with an active shift.
- **Pre-fill Data:** Before showing the form, it calls `ShiftService.getCurrentShiftSummary()` to get an overview:
  - Initial Cash
  - Total Cash Sales
  - Total Non-Cash Sales
  - Expected Cash in Drawer
- **Action:** Cashier enters the actual physical cash amount in the drawer (`actual_cash`).
- **Validation:** Compares the actual cash against the expected cash and shows the difference (deficit/surplus).
- **API Call:** Closes the shift via `/api/v1/shifts/close` with `actual_cash`.
- **Result:** After success, clears the `currentShift` state and closes the modal. The user can still navigate the app but will be prompted to open a new shift if they try to proceed as a Kasir (handled by re-mounting or re-logging).

## 4. Riwayat Shift (Shift History)
- **Component:** `ShiftHistoryScreen` (`src/screens/shift/ShiftHistoryScreen.js`)
- **Navigation:** Accessible via the new `Shift` tab in the bottom navigation bar.
- **Data Displayed:**
  - Date and time (Start and End)
  - Status (`Open` or `Closed`)
  - Initial Cash
  - Actual Cash
  - Difference (Surplus or deficit colored green or red)
- **API Call:** Fetches historical data from `/api/v1/shifts/history`.

## 5. Endpoints Assumed
- `GET /api/v1/shifts/current` - Check for currently active shift.
- `GET /api/v1/shifts/current/summary` - Get sales summary for closing.
- `POST /api/v1/shifts/open` - Open a shift.
- `POST /api/v1/shifts/close` - Close a shift.
- `GET /api/v1/shifts/history` - List past shifts.

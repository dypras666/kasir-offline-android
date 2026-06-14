# Mobile Sales Return Flow

This document describes the offline-first implementation of the Sales Return feature in the Expo mobile application.

## Overview

The Sales Return feature allows staff to process returns for previously sold items. It is designed with an offline-first approach, supporting both local synchronization via the Go Sync Server and direct cloud API interaction.

## UI Flow: `SalesReturnScreen`

The `SalesReturnScreen` is a unified interface that manages the entire return process in two primary steps:

### 1. Invoice Selection
- **Search**: Users can search for sales by invoice number or ID.
- **Local Source**: Sales are loaded from the local SQLite database (Android/iOS) or AsyncStorage (Web).
- **Selection**: Selecting an invoice transitions the user to the item selection step.

### 2. Item & Quantity Selection
- **Item List**: Displays all items from the selected invoice.
- **Quantity Controls**: Users select how many units of each item to return, with safety checks against the original sold quantity.
- **Reason**: A mandatory reason for the return must be provided.
- **Submission**: Processes the return through the `ReturnService`.

## Technical Implementation

### Routing Logic (`ReturnService.js`)

The service implements "offline-first routing" by checking the `server_mode`:

1.  **Local Mode (`serverMode === 'local'`)**:
    - **Endpoint**: `http://{STB_IP}:8081/api/v1/sales-returns-sync`
    - **Routing**: Sends the return data to the local Go Sync Server (STB).
2.  **Cloud Mode**:
    - **Endpoint**: `{baseUrl}/api/v1/sales/{sale_id}/return`
    - **Routing**: Directly communicates with the cloud backend.

### Offline & Sync Queue

- **Offline Processing**: If the device is offline or the server is unreachable, the return is saved locally with `synced: 0`.
- **Background Sync**: The `pushUnsyncedReturns` function is integrated into `backgroundSync.js` and `OfflineQueueService.js`. 
- **Auto-Sync**: When a network connection is detected or during regular sync intervals, the app automatically pushes queued returns using the appropriate routing logic (local vs. cloud).

## Files Created/Modified

- `src/screens/retur/SalesReturnScreen.js`: Unified return UI (New).
- `src/services/ReturnService.js`: Updated with local mode routing and Go Sync Server payload formats.
- `src/services/backgroundSync.js` & `src/services/OfflineQueueService.js`: Integrated returns into the global sync queue.
- `App.js`: Updated navigation to include `SalesReturnScreen`.

## Null Safety & Loading States

- **Loading Spinners**: Provided during invoice search and return submission.
- **Data Validation**: 
    - Prevents returning more than the original sold quantity.
    - Ensures at least one item is selected.
    - Requires a return reason.
- **Error Handling**: Graceful fallbacks to offline mode if API calls fail.

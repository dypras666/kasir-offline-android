/**
 * PurchaseReturn Service Tests
 * 
 * Tests for PurchaseReturnService.
 * The test environment (jsdom) sets Platform.OS = 'web',
 * so the service uses localStorage (via Storage) instead of SQLite.
 */

// Mock axios before requiring the service
jest.mock('axios');

const mockStorage = {
  _data: {},
  getItemAsync: jest.fn(async (key) => {
    if (key === 'user_token') return 'mock-token';
    if (key === 'selected_branch_id') return '1';
    if (key === 'server_mode') return 'cloud';
    if (key === 'local_server_ip') return '192.168.1.250:8081';
    if (key === 'purchase_returns_local') return mockStorage._data['purchase_returns_local'] || '[]';
    return null;
  }),
  setItemAsync: jest.fn(async (key, val) => {
    mockStorage._data[key] = val;
  }),
  removeItemAsync: jest.fn(async () => {}),
};

jest.mock('../src/services/api', () => {
  return {
    Storage: mockStorage,
    getBaseUrl: jest.fn().mockResolvedValue('https://api.example.com'),
  };
});

// Mock netinfo for the jsdom environment
jest.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: jest.fn().mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    }),
  },
}));

const axios = require('axios');
const { PurchaseReturnService } = require('../src/services/PurchaseReturnService');

describe('PurchaseReturnService (web platform)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage._data = {};
  });

  describe('createTable', () => {
    it('should do nothing on web platform (no-op)', () => {
      // On web, createTable returns early without calling SQLite
      const result = PurchaseReturnService.createTable();
      expect(result).toBeUndefined();
      // No error is the success case on web
    });
  });

  describe('getPurchaseReturnsLocal', () => {
    it('should return empty array when no returns saved', async () => {
      mockStorage._data['purchase_returns_local'] = '[]';
      const result = await PurchaseReturnService.getPurchaseReturnsLocal();
      expect(result).toEqual([]);
      expect(mockStorage.getItemAsync).toHaveBeenCalledWith('purchase_returns_local');
    });

    it('should return purchase returns from localStorage', async () => {
      const mockReturns = [
        { id: 1, purchase_invoice_id: 1, invoice_number: 'PO-001', reason: 'Rusak', total_return: 50000, synced: 1 },
      ];
      mockStorage._data['purchase_returns_local'] = JSON.stringify(mockReturns);

      const result = await PurchaseReturnService.getPurchaseReturnsLocal();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });

  describe('savePurchaseReturnLocal', () => {
    it('should save purchase return to localStorage', async () => {
      const invoice = { id: 1, invoice_number: 'PO-001', supplier_id: '2', supplier_name: 'PT Supplier' };
      const items = [
        { product_id: '10', product_name: 'Barang A', qty: 2, price: 15000, subtotal: 30000 },
      ];
      const reason = 'Barang rusak';

      const result = await PurchaseReturnService.savePurchaseReturnLocal(invoice, items, reason);

      expect(result).toBe(1); // first item gets ID 1
      expect(mockStorage.setItemAsync).toHaveBeenCalledWith(
        'purchase_returns_local',
        expect.any(String)
      );
      // Verify the saved data
      const savedData = JSON.parse(mockStorage._data['purchase_returns_local']);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].reason).toBe('Barang rusak');
      expect(savedData[0].total_return).toBe(30000);
    });
  });

  describe('submitPurchaseReturn', () => {
    it('should sync purchase return via API when online', async () => {
      axios.post.mockResolvedValue({ data: { success: true } });

      const invoice = { id: 1, invoice_number: 'PO-001', supplier_id: '2', supplier_name: 'PT Supplier' };
      const items = [
        { product_id: '10', product_name: 'Barang A', qty: 2, price: 15000, subtotal: 30000 },
      ];
      const reason = 'Barang rusak';

      await PurchaseReturnService.submitPurchaseReturn(invoice, items, reason);

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/purchase-returns',
        expect.objectContaining({
          purchase_invoice_id: 1,
          reason: 'Barang rusak',
          items: expect.arrayContaining([
            expect.objectContaining({ product_id: '10', qty: 2 }),
          ]),
        }),
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-token' },
        })
      );
    });

    it('should save locally when API fails', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      const invoice = { id: 1, invoice_number: 'PO-001', supplier_id: '2', supplier_name: 'PT Supplier' };
      const items = [
        { product_id: '10', product_name: 'Barang A', qty: 2, price: 15000, subtotal: 30000 },
      ];
      const reason = 'Barang rusak';

      await PurchaseReturnService.submitPurchaseReturn(invoice, items, reason);

      // Should have saved locally as fallback
      expect(mockStorage.setItemAsync).toHaveBeenCalledWith(
        'purchase_returns_local',
        expect.any(String)
      );
    });
  });

  describe('pushUnsyncedPurchaseReturns', () => {
    it('should push unsynced purchase returns to API', async () => {
      // Save an unsynced return first
      const unsyncedReturns = [
        { id: 1, purchase_invoice_id: 1, invoice_number: 'PO-001', reason: 'Rusak', total_return: 50000, branch_id: '1', synced: 0,
          items: [{ product_id: '10', product_name: 'Barang A', qty: 2, price: 15000, subtotal: 30000 }] },
      ];
      mockStorage._data['purchase_returns_local'] = JSON.stringify(unsyncedReturns);

      axios.post.mockResolvedValue({ data: { success: true } });

      await PurchaseReturnService.pushUnsyncedPurchaseReturns();

      expect(axios.post).toHaveBeenCalled();
    });

    it('should do nothing if no unsynced returns', async () => {
      mockStorage._data['purchase_returns_local'] = '[]';

      await PurchaseReturnService.pushUnsyncedPurchaseReturns();

      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});

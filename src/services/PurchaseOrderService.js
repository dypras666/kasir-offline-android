import api from './api';

export const PurchaseOrderService = {
  async getPurchaseOrders(params = {}) {
    try {
      const response = await api.get('/api/v1/purchase-orders', { params });
      return response.data;
    } catch (error) {
      console.error('Error getting purchase orders:', error);
      throw error;
    }
  },

  async getPurchaseOrder(id) {
    try {
      const response = await api.get(`/api/v1/purchase-orders/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error getting purchase order:', error);
      throw error;
    }
  },

  async createPurchaseOrder(data) {
    try {
      const response = await api.post('/api/v1/purchase-orders', data);
      return response.data;
    } catch (error) {
      console.error('Error creating purchase order:', error);
      throw error;
    }
  },

  async updatePurchaseOrder(id, data) {
    try {
      const response = await api.put(`/api/v1/purchase-orders/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating purchase order:', error);
      throw error;
    }
  },

  async approvePurchaseOrder(id) {
    try {
      const response = await api.post(`/api/v1/purchase-orders/${id}/approve`);
      return response.data;
    } catch (error) {
      console.error('Error approving purchase order:', error);
      throw error;
    }
  },

  async cancelPurchaseOrder(id) {
    try {
      const response = await api.post(`/api/v1/purchase-orders/${id}/cancel`);
      return response.data;
    } catch (error) {
      console.error('Error cancelling purchase order:', error);
      throw error;
    }
  },

  async convertToInvoice(id) {
    try {
      const response = await api.post(`/api/v1/purchase-orders/${id}/convert-to-invoice`);
      return response.data;
    } catch (error) {
      console.error('Error converting to invoice:', error);
      throw error;
    }
  },

  async getSuppliers(params = {}) {
    try {
      const response = await api.get('/api/v1/suppliers', { params });
      return response.data;
    } catch (error) {
      console.error('Error getting suppliers:', error);
      throw error;
    }
  },

  async getProducts(params = {}) {
    try {
      const response = await api.get('/api/v1/products', { params });
      return response.data;
    } catch (error) {
      console.error('Error getting products:', error);
      throw error;
    }
  }
};

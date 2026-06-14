import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, Alert, Platform
} from 'react-native';
import { Search, ArrowLeft, RefreshCw, Save, FileText, RotateCcw } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { formatRp, formatDate } from '../../utils/format';
import { PurchaseReturnService } from '../../services/PurchaseReturnService';
import { toast } from 'sonner-native';
import { Storage } from '../../services/api';
import axios from 'axios';

const loadPurchaseInvoices = async (searchQuery) => {
  try {
    const token = await Storage.getItemAsync('user_token');
    const baseUrl = (await import('../../services/api')).getBaseUrl;
    const url = await baseUrl();
    const branchId = (await Storage.getItemAsync('selected_branch_id')) || '1';

    if (token) {
      const resp = await axios.get(`${url}/api/v1/purchase-invoices?branch_id=${branchId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000
      });

      if (resp.data) {
        let invoices = Array.isArray(resp.data) ? resp.data : (resp.data.data || []);
        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          invoices = invoices.filter(inv =>
            (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
            (inv.supplier && inv.supplier.name && inv.supplier.name.toLowerCase().includes(q)) ||
            String(inv.id).includes(q)
          );
        }
        return invoices.map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number || `PO-${inv.id}`,
          supplier_id: inv.supplier?.id || inv.supplier_id || '',
          supplier_name: inv.supplier?.name || inv.supplier_name || 'Supplier',
          total: inv.total_amount || inv.total || 0,
          status: inv.status || 'completed',
          created_at: inv.created_at || new Date().toISOString(),
          items: (inv.items || []).map(item => ({
            id: item.id || `${item.product_id}-${Date.now()}`,
            product_id: item.product_id,
            product_name: item.product_name || item.name || `Produk #${item.product_id}`,
            qty: item.qty || item.quantity || 0,
            price: item.price || 0,
            subtotal: item.subtotal || (item.qty * item.price) || 0,
          }))
        }));
      }
    }
  } catch (e) {
    console.warn('loadPurchaseInvoices API error, fallback to local:', e);
  }

  // Fallback to local
  if (Platform.OS !== 'web') {
    try {
      const SQLite = require('expo-sqlite');
      const db = SQLite.openDatabaseSync('kasir_offline_v2.db');
      const localInvoice = db.getAllSync('SELECT * FROM purchase_orders ORDER BY created_at DESC');
      let invoices = localInvoice.map(po => ({
        id: po.id,
        invoice_number: po.invoice_number || `PO-${po.id}`,
        supplier_id: po.supplier_id || '',
        supplier_name: po.supplier_name || 'Supplier',
        total: po.total || 0,
        status: po.status || 'completed',
        created_at: po.created_at || new Date().toISOString(),
        items: []
      }));

      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        invoices = invoices.filter(inv =>
          (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
          (inv.supplier_name && inv.supplier_name.toLowerCase().includes(q))
        );
      }
      return invoices;
    } catch (e2) {
      console.warn('loadPurchaseInvoices local fallback error:', e2);
    }
  }

  return [];
};

const PurchaseReturnFormScreen = ({ navigation, onSuccess }) => {
  const [step, setStep] = useState('select'); // 'select' | 'items'
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [reason, setReason] = useState('');

  // Return quantities per item
  const [returnItems, setReturnItems] = useState([]);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadPurchaseInvoices(searchQuery);
      setInvoices(data);
    } catch (e) {
      console.error('fetchInvoices error:', e);
      toast.error('Gagal memuat invoice pembelian');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const handleSelectInvoice = async (invoice) => {
    // If invoice has items from API, use them directly
    if (invoice.items && invoice.items.length > 0) {
      const mapped = invoice.items.map(i => ({
        id: i.id || `${i.product_id}-${Date.now()}`,
        product_id: i.product_id,
        product_name: i.product_name || `Produk #${i.product_id}`,
        qty: i.qty,
        price: i.price,
        subtotal: i.subtotal || (i.qty * i.price),
        returnQty: 0,
        maxQty: i.qty
      }));
      setSelectedInvoice(invoice);
      setReturnItems(mapped);
      setReason('');
      setStep('items');
      return;
    }

    // Otherwise try to load items from local DB
    setLoading(true);
    try {
      let items = [];
      if (Platform.OS !== 'web') {
        try {
          const SQLite = require('expo-sqlite');
          const db = SQLite.openDatabaseSync('kasir_offline_v2.db');
          items = db.getAllSync('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?', [invoice.id]);
        } catch (e) {
          console.warn('loadItems local error:', e);
        }
      }

      const mapped = items.map(i => ({
        id: i.id || `${i.product_id}-${Date.now()}`,
        product_id: i.product_id,
        product_name: i.product_name || `Produk #${i.product_id}`,
        qty: i.qty,
        price: i.price,
        subtotal: i.subtotal || (i.qty * i.price),
        returnQty: 0,
        maxQty: i.qty
      }));

      if (mapped.length === 0) {
        // Fallback: create a dummy item
        mapped.push({
          id: `item-${Date.now()}`,
          product_id: '0',
          product_name: 'Item pembelian',
          qty: 1,
          price: invoice.total || 0,
          subtotal: invoice.total || 0,
          returnQty: 0,
          maxQty: 1
        });
      }

      setSelectedInvoice(invoice);
      setReturnItems(mapped);
      setReason('');
      setStep('items');
    } catch (e) {
      console.error('handleSelectInvoice error:', e);
      toast.error('Gagal memuat detail invoice');
    } finally {
      setLoading(false);
    }
  };

  const updateQty = (id, change) => {
    setReturnItems(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, Math.min(item.maxQty, item.returnQty + change));
        return { ...item, returnQty: newQty };
      }
      return item;
    }));
  };

  const handleSelectAll = () => {
    const isAllSelected = returnItems.every(i => i.returnQty === i.maxQty);
    setReturnItems(prev => prev.map(item => ({
      ...item,
      returnQty: isAllSelected ? 0 : item.maxQty
    })));
  };

  const submitReturn = async () => {
    const itemsToReturn = returnItems
      .filter(i => i.returnQty > 0)
      .map(i => ({
        ...i,
        qty: i.returnQty,
        subtotal: i.returnQty * i.price
      }));

    if (itemsToReturn.length === 0) {
      toast.error('Pilih minimal 1 barang untuk diretur');
      return;
    }

    if (!reason.trim()) {
      toast.error('Alasan retur harus diisi');
      return;
    }

    Alert.alert(
      'Konfirmasi Retur Pembelian',
      `Yakin ingin meretur ${itemsToReturn.length} jenis barang dari invoice ${selectedInvoice.invoice_number} ke supplier?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Retur',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await PurchaseReturnService.submitPurchaseReturn(selectedInvoice, itemsToReturn, reason);
              toast.success('Retur pembelian berhasil diproses');
              // Reset
              setStep('select');
              setSelectedInvoice(null);
              setReturnItems([]);
              setReason('');
              fetchInvoices();
              onSuccess && onSuccess();
            } catch (e) {
              console.error(e);
              toast.error('Gagal memproses retur');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const totalRefund = returnItems.reduce((sum, item) => sum + (item.returnQty * item.price), 0);
  const totalItems = returnItems.reduce((sum, item) => sum + item.returnQty, 0);

  // ── Step: Select Invoice ─────────────────────────────────────────────
  const renderSelectStep = () => (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Search size={18} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari invoice / supplier..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={fetchInvoices}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity onPress={fetchInvoices} style={styles.refreshBtn}>
          <RefreshCw size={20} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Pilih invoice pembelian untuk memulai retur barang ke supplier. Cari berdasarkan nomor invoice atau nama supplier.
        </Text>
      </View>

      {/* Invoice list */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Memuat data...</Text>
        </View>
      ) : (
        <FlashList
          data={invoices}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={80}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.invoiceCard}
              onPress={() => handleSelectInvoice(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.invoiceNumber}>{item.invoice_number}</Text>
                <View style={[
                  styles.badge,
                  { backgroundColor: item.status === 'completed' ? '#dcfce7' : '#fef3c7' }
                ]}>
                  <Text style={[
                    styles.badgeText,
                    { color: item.status === 'completed' ? '#15803d' : '#b45309' }
                  ]}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.supplierName}>{item.supplier_name}</Text>
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.itemCount}>
                  {item.items ? item.items.length : 0} item
                </Text>
                <Text style={styles.totalValue}>{formatRp(item.total)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <FileText size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'Tidak ada invoice yang cocok' : 'Belum ada invoice pembelian'}
              </Text>
              {!searchQuery && (
                <Text style={styles.emptySubtext}>
                  Lakukan pembelian terlebih dahulu
                </Text>
              )}
            </View>
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
        />
      )}
    </View>
  );

  // ── Step: Select Items & Quantities ────────────────────────────────────
  const renderItemsStep = () => (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            setStep('select');
            setSelectedInvoice(null);
          }}
          style={styles.backBtn}
        >
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Retur Barang</Text>
          <Text style={styles.headerSubtitle}>{selectedInvoice?.invoice_number} - {selectedInvoice?.supplier_name}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Reason input */}
        <View style={styles.infoCard}>
          <Text style={styles.fieldLabel}>Alasan Retur</Text>
          <TextInput
            style={styles.input}
            placeholder="Contoh: Barang rusak, salah kirim, kadaluarsa..."
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Item list header */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Pilih Barang</Text>
          <TouchableOpacity onPress={handleSelectAll}>
            <Text style={styles.selectAllText}>
              {returnItems.every(i => i.returnQty === i.maxQty) ? 'Reset' : 'Pilih Semua'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Items */}
        {returnItems.map((item, index) => (
          <View key={item.id || index} style={styles.itemCard}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.product_name}</Text>
              <Text style={styles.itemPrice}>{formatRp(item.price)} / pcs</Text>
              <Text style={styles.itemMax}>Max: {item.maxQty}</Text>
            </View>

            <View style={styles.qtyControl}>
              <TouchableOpacity
                style={[styles.qtyBtn, item.returnQty === 0 && styles.qtyBtnDisabled]}
                onPress={() => updateQty(item.id, -1)}
                disabled={item.returnQty === 0}
              >
                <Text style={styles.qtyBtnText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.returnQty}</Text>
              <TouchableOpacity
                style={[styles.qtyBtn, item.returnQty === item.maxQty && styles.qtyBtnDisabled]}
                onPress={() => updateQty(item.id, 1)}
                disabled={item.returnQty === item.maxQty}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Retur ({totalItems} item):</Text>
          <Text style={styles.summaryValue}>{formatRp(totalRefund)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.submitBtn, (loading || totalItems === 0) && styles.submitBtnDisabled]}
          onPress={submitReturn}
          disabled={loading || totalItems === 0}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Save size={20} color="#fff" />
              <Text style={styles.submitBtnText}>Proses Retur</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.mainHeader}>
        <RotateCcw size={22} color="#0f172a" />
        <Text style={styles.mainTitle}>Retur Pembelian</Text>
      </View>
      {step === 'select' ? renderSelectStep() : renderItemsStep()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  // Main header
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  mainTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },

  // Header (items step)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a' },
  refreshBtn: { padding: 10 },

  // Info
  infoBox: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderColor: '#22c55e',
  },
  infoText: { fontSize: 13, color: '#166534', lineHeight: 18 },

  // Invoice cards
  invoiceCard: {
    backgroundColor: '#fff',
    marginBottom: 10,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  invoiceNumber: { fontWeight: 'bold', fontSize: 15, color: '#0f172a' },
  supplierName: { fontSize: 13, color: '#3b82f6', fontWeight: '600', marginBottom: 2 },
  date: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderColor: '#f1f5f9' },
  itemCount: { fontSize: 12, color: '#64748b' },
  totalValue: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },

  // Loading
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#64748b', fontSize: 14 },

  // Empty
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { marginTop: 12, color: '#94a3b8', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  emptySubtext: { marginTop: 6, color: '#cbd5e1', fontSize: 12, textAlign: 'center' },

  // Form fields
  infoCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 20, elevation: 1 },
  fieldLabel: { fontSize: 13, color: '#64748b', marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, backgroundColor: '#f8fafc', fontSize: 14, textAlignVertical: 'top' },

  // Item list
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  selectAllText: { color: '#3b82f6', fontWeight: '600', fontSize: 14 },

  itemCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 1 },
  itemInfo: { flex: 1, marginRight: 10 },
  itemName: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  itemPrice: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },
  itemMax: { fontSize: 12, color: '#64748b', marginTop: 4 },

  qtyControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 4 },
  qtyBtn: { width: 32, height: 32, backgroundColor: '#fff', borderRadius: 6, justifyContent: 'center', alignItems: 'center', elevation: 1 },
  qtyBtnDisabled: { backgroundColor: '#e2e8f0', elevation: 0 },
  qtyBtnText: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  qtyText: { width: 40, textAlign: 'center', fontSize: 16, fontWeight: 'bold' },

  // Footer
  footer: { backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderColor: '#e2e8f0' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  summaryLabel: { fontSize: 14, color: '#64748b' },
  summaryValue: { fontSize: 18, fontWeight: 'bold', color: '#ef4444' },
  submitBtn: { backgroundColor: '#ef4444', padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  submitBtnDisabled: { backgroundColor: '#fca5a5' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export default PurchaseReturnFormScreen;

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput, 
  ActivityIndicator, ScrollView, Alert, Platform
} from 'react-native';
import { Search, ArrowLeft, RefreshCw, Save, FileText, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { formatRp, formatDate } from '../../utils/format';
import { ReturnService } from '../../services/ReturnService';
import { toast } from 'sonner-native';

// ─── Sales Invoices are fetched from local db / api ───────────────────────
const loadLocalSales = async (searchQuery) => {
  let sales = [];
  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('local_sales') || '[]';
    sales = JSON.parse(raw);
  } else {
    let db = null;
    try {
      const SQLite = require('expo-sqlite');
      db = SQLite.openDatabaseSync('kasir_offline_v2.db');
      sales = db.getAllSync('SELECT * FROM sales ORDER BY created_at DESC');
    } catch (e) {
      console.warn('loadLocalSales sqlite error:', e);
    }
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    sales = sales.filter(s => 
      (s.invoice_number && s.invoice_number.toLowerCase().includes(q)) ||
      String(s.id).includes(q)
    );
  }
  return sales.map(s => ({
    id: s.id,
    invoice_number: s.invoice_number || `INV-${s.id}`,
    total: s.total_amount || s.total || 0,
    status: s.status || (s.synced === 0 ? 'pending_sync' : 'completed'),
    created_at: s.created_at || new Date().toISOString(),
    payment_method: s.payment_method || 'CASH',
    payments: s.payments || [],
    synced: s.synced || 0
  }));
};

const loadSaleItems = async (saleId) => {
  if (Platform.OS === 'web') {
    const raw = await Storage.getItemAsync('local_sales') || '[]';
    const sales = JSON.parse(raw);
    const sale = sales.find(s => s.id === saleId);
    if (sale && sale.items) return sale.items;
    return [];
  }
  try {
    const SQLite = require('expo-sqlite');
    const db = SQLite.openDatabaseSync('kasir_offline_v2.db');
    return db.getAllSync('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
  } catch (e) {
    console.warn('loadSaleItems error:', e);
    return [];
  }
};

import { Storage } from '../../services/api';

const SalesReturnScreen = ({ navigation }) => {
  // Step tracking: 'select' | 'items' | 'summary'
  const [step, setStep] = useState('select');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sales, setSales] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);
  const [reason, setReason] = useState('');

  // Return quantities per item
  const [returnItems, setReturnItems] = useState([]);

  // Load sales on mount
  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadLocalSales(searchQuery);
      setSales(data);
    } catch (e) {
      console.error('fetchSales error:', e);
      toast.error('Gagal memuat daftar penjualan');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const handleSelectSale = async (sale) => {
    setLoading(true);
    try {
      const items = await loadSaleItems(sale.id);
      const mapped = items.map(i => ({
        id: i.id || `${i.product_id}-${Date.now()}`,
        product_id: i.product_id,
        product_name: i.product_name || i.name || `Produk #${i.product_id}`,
        qty: i.qty,
        price: i.price,
        subtotal: i.subtotal || (i.qty * i.price),
        returnQty: 0,
        maxQty: i.qty
      }));
      setSelectedSale(sale);
      setSaleItems(mapped);
      setReturnItems(mapped);
      setReason('');
      setStep('items');
    } catch (e) {
      console.error('handleSelectSale error:', e);
      toast.error('Gagal memuat detail penjualan');
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
      'Konfirmasi Retur',
      `Yakin ingin meretur ${itemsToReturn.length} jenis barang dari invoice ${selectedSale.invoice_number}?`,
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Ya, Retur', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await ReturnService.submitReturn(selectedSale, itemsToReturn, reason);
              toast.success('Retur berhasil diproses');
              // Navigate back to select step
              setStep('select');
              setSelectedSale(null);
              setSaleItems([]);
              setReturnItems([]);
              setReason('');
              fetchSales();
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

  // ── Step: Select Invoice ─────────────────────────────────────────────────
  const renderSelectStep = () => (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Search size={18} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari invoice / ID..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={fetchSales}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity onPress={fetchSales} style={styles.refreshBtn}>
          <RefreshCw size={20} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Pilih invoice penjualan untuk memulai proses retur barang. Cari berdasarkan nomor invoice atau ID.
        </Text>
      </View>

      {/* Sales list */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Memuat data...</Text>
        </View>
      ) : (
        <FlashList
          data={sales}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={80}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.saleCard}
              onPress={() => handleSelectSale(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.invoice}>{item.invoice_number}</Text>
                <View style={[
                  styles.badge, 
                  { backgroundColor: item.status === 'voided' ? '#fef2f2' : '#dcfce7' }
                ]}>
                  <Text style={[
                    styles.badgeText, 
                    { color: item.status === 'voided' ? '#dc2626' : '#15803d' }
                  ]}>
                    {item.status === 'voided' ? 'VOID' : 'ACTIVE'}
                  </Text>
                </View>
              </View>
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
              <View style={styles.cardFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentLabel}>
                    {item.payment_method}
                    {item.payments && item.payments.length > 1 ? ' (Split)' : ''}
                  </Text>
                  {item.payments && item.payments.length > 1 && (
                    <View style={{ marginTop: 4 }}>
                      {(() => {
                        let arr = item.payments;
                        if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch(e) { arr = []; } }
                        return arr.map((pmt, idx) => (
                          <Text key={idx} style={{ fontSize: 11, color: '#64748b' }}>
                            {pmt.payment_method_id}: {formatRp(pmt.amount)}
                          </Text>
                        ));
                      })()}
                    </View>
                  )}
                </View>
                <Text style={styles.totalValue}>{formatRp(item.total)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <FileText size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'Tidak ada invoice yang cocok' : 'Belum ada transaksi penjualan'}
              </Text>
              {!searchQuery && (
                <Text style={styles.emptySubtext}>
                  Lakukan transaksi penjualan terlebih dahulu
                </Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );

  // ── Step: Select Items & Quantities ──────────────────────────────────────
  const renderItemsStep = () => (
    <View style={{ flex: 1 }}>
      {/* Sale info header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            setStep('select');
            setSelectedSale(null);
          }} 
          style={styles.backBtn}
        >
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Retur Barang</Text>
          <Text style={styles.subtitle}>{selectedSale?.invoice_number}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Reason input */}
        <View style={styles.infoCard}>
          <Text style={styles.fieldLabel}>Alasan Retur</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Contoh: Barang rusak, salah ukuran..." 
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

      {/* Footer with summary & submit */}
      <View style={styles.footer}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Refund ({totalItems} item):</Text>
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
      {step === 'select' ? renderSelectStep() : renderItemsStep()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  
  // Header
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0'
  },
  backBtn: { marginRight: 15 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },

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
  infoBox: { margin: 12, padding: 14, backgroundColor: '#eff6ff', borderRadius: 10, borderLeftWidth: 4, borderColor: '#3b82f6' },
  infoText: { fontSize: 13, color: '#1e40af', lineHeight: 18 },

  // Sales list cards
  saleCard: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 10, padding: 16, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  invoice: { fontWeight: 'bold', fontSize: 15, color: '#0f172a' },
  date: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderColor: '#f1f5f9' },
  paymentLabel: { fontSize: 13, color: '#64748b' },
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
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});

export default SalesReturnScreen;

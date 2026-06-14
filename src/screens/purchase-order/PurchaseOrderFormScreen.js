import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform
} from 'react-native';
import { toast } from 'sonner-native';
import { ArrowLeft, Plus, Trash2, Search, X } from 'lucide-react-native';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import { useAuthStore } from '../../stores/authStore';
import { formatRp } from '../../utils/format';

export default function PurchaseOrderFormScreen({ navigation, selectedBranch, editPurchaseOrder }) {
  const { user } = useAuthStore();
  const isEdit = !!editPurchaseOrder;

  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  
  // Form fields
  const [supplierId, setSupplierId] = useState(editPurchaseOrder?.supplier_id || editPurchaseOrder?.supplier?.id || '');
  const [orderDate, setOrderDate] = useState(editPurchaseOrder?.order_date || new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState(editPurchaseOrder?.expected_delivery_date || '');
  const [notes, setNotes] = useState(editPurchaseOrder?.notes || '');
  const [items, setItems] = useState(
    editPurchaseOrder?.items?.map(i => ({
      product_id: i.product_id || i.product?.id || '',
      product_name: i.product?.name || i.product_name || '',
      qty: String(i.qty_ordered || i.qty || 0),
      unit_price: String(i.unit_price || 0),
    })) || []
  );

  // Supplier picker
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Product picker
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(null);

  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const data = await PurchaseOrderService.getSuppliers();
      setSuppliers(data?.data || data || []);
    } catch (err) {
      console.error('Load suppliers error:', err);
      toast.error('Gagal memuat data supplier');
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const branchId = selectedBranch?.id || user?.branch_id || 1;
      const data = await PurchaseOrderService.getProducts({ branch_id: branchId });
      setProducts(data?.data || data || []);
    } catch (err) {
      console.error('Load products error:', err);
      toast.error('Gagal memuat data produk');
    } finally {
      setLoadingProducts(false);
    }
  }, [selectedBranch, user]);

  useEffect(() => {
    loadSuppliers();
    loadProducts();
  }, [loadSuppliers, loadProducts]);

  const selectedSupplierName = suppliers.find(s => 
    s.id === supplierId || String(s.id) === String(supplierId)
  )?.name || editPurchaseOrder?.supplier?.name || '';

  const filteredSuppliers = suppliers.filter(s =>
    s.name?.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredProducts = products.filter(p =>
    (p.name || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = () => {
    setItems(prev => [...prev, {
      product_id: '',
      product_name: '',
      qty: '1',
      unit_price: '0',
    }]);
  };

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const selectProductForItem = (index, product) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      product_id: product.id,
      product_name: product.name,
      unit_price: String(product.buy_price || product.modal_price || product.sell_price || 0),
    };
    setItems(updated);
    setShowProductPicker(false);
    setSelectedItemIndex(null);
  };

  const updateItemField = (index, field, value) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const calculateSubtotal = (item) => {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return qty * price;
  };

  const totalAmount = items.reduce((sum, item) => sum + calculateSubtotal(item), 0);

  const validate = () => {
    if (!supplierId) {
      toast.error('Pilih supplier terlebih dahulu');
      return false;
    }
    if (!orderDate.trim()) {
      toast.error('Tanggal order harus diisi');
      return false;
    }
    if (items.length === 0) {
      toast.error('Tambahkan minimal 1 item produk');
      return false;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_id) {
        toast.error(`Item ke-${i + 1}: pilih produk`);
        return false;
      }
      const qty = parseFloat(item.qty);
      if (isNaN(qty) || qty <= 0) {
        toast.error(`Item ke-${i + 1}: qty harus lebih dari 0`);
        return false;
      }
      const price = parseFloat(item.unit_price);
      if (isNaN(price) || price < 0) {
        toast.error(`Item ke-${i + 1}: harga tidak valid`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const branchId = selectedBranch?.id || user?.branch_id || 1;
      const payload = {
        supplier_id: supplierId,
        branch_id: branchId,
        order_date: orderDate,
        expected_delivery_date: expectedDate || undefined,
        notes: notes.trim(),
        items: items.map(item => ({
          product_id: item.product_id,
          qty_ordered: parseFloat(item.qty),
          unit_price: parseFloat(item.unit_price),
        })),
      };

      if (isEdit) {
        await PurchaseOrderService.updatePurchaseOrder(editPurchaseOrder.id, payload);
        toast.success('Purchase Order berhasil diperbarui!');
      } else {
        await PurchaseOrderService.createPurchaseOrder(payload);
        toast.success('Purchase Order berhasil dibuat!');
      }

      if (navigation) {
        navigation.goBack();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Gagal menyimpan Purchase Order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>{isEdit ? 'Edit Purchase Order' : 'Buat Purchase Order'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.form}>
          {/* Supplier Picker */}
          <Text style={styles.label}>Supplier *</Text>
          {!showSupplierPicker ? (
            <TouchableOpacity style={styles.pickerButton} onPress={() => { setShowSupplierPicker(true); loadSuppliers(); }}>
              <Text style={selectedSupplierName ? styles.pickerButtonText : styles.pickerPlaceholder}>
                {selectedSupplierName || 'Pilih Supplier'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.pickerDropdownContainer}>
              <View style={styles.pickerSearchRow}>
                <Search size={16} color="#94a3b8" />
                <TextInput
                  style={styles.pickerSearchInput}
                  placeholder="Cari supplier..."
                  placeholderTextColor="#64748b"
                  value={supplierSearch}
                  onChangeText={setSupplierSearch}
                />
                <TouchableOpacity onPress={() => setShowSupplierPicker(false)}>
                  <X size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              {loadingSuppliers ? (
                <ActivityIndicator color="#2563eb" style={{ padding: 20 }} />
              ) : (
                <ScrollView style={styles.pickerList} nestedScrollEnabled>
                  {filteredSuppliers.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.pickerItem, supplierId === s.id && styles.pickerItemActive]}
                      onPress={() => {
                        setSupplierId(s.id);
                        setShowSupplierPicker(false);
                        setSupplierSearch('');
                      }}
                    >
                      <Text style={[styles.pickerItemText, supplierId === s.id && styles.pickerItemTextActive]}>
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {filteredSuppliers.length === 0 && (
                    <Text style={styles.pickerEmpty}>Tidak ada supplier ditemukan</Text>
                  )}
                </ScrollView>
              )}
            </View>
          )}

          <Text style={styles.label}>Cabang</Text>
          <Text style={styles.branchText}>
            {selectedBranch?.name || user?.branch?.name || `Cabang ID: ${selectedBranch?.id || user?.branch_id || 1}`}
          </Text>

          <Text style={styles.label}>Tanggal Order *</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94a3b8"
            value={orderDate}
            onChangeText={setOrderDate}
          />

          <Text style={styles.label}>Estimasi Datang</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD (opsional)"
            placeholderTextColor="#94a3b8"
            value={expectedDate}
            onChangeText={setExpectedDate}
          />

          <Text style={styles.label}>Catatan</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Catatan untuk PO..."
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={3}
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Items Section */}
        <View style={styles.form}>
          <View style={styles.itemsHeader}>
            <Text style={styles.label}>Item Produk</Text>
            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Plus size={18} color="#fff" />
              <Text style={styles.addItemBtnText}>Tambah Item</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <Text style={styles.emptyItems}>Belum ada item. Tekan "Tambah Item"</Text>
          ) : (
            items.map((item, index) => (
              <View key={index} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    {item.product_name ? (
                      <View style={styles.selectedProduct}>
                        <Text style={styles.selectedProductText}>{item.product_name}</Text>
                        <TouchableOpacity onPress={() => {
                          setSelectedItemIndex(index);
                          setShowProductPicker(true);
                          setProductSearch('');
                        }}>
                          <Text style={styles.changeLink}>Ganti</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.selectProductBtn}
                        onPress={() => {
                          setSelectedItemIndex(index);
                          setShowProductPicker(true);
                          setProductSearch('');
                        }}
                      >
                        <Search size={16} color="#94a3b8" />
                        <Text style={styles.selectProductText}>Pilih Produk</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}>
                    <Trash2 size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                <View style={styles.itemFieldsRow}>
                  <View style={styles.itemField}>
                    <Text style={styles.fieldLabel}>Qty</Text>
                    <TextInput
                      style={styles.itemInput}
                      keyboardType="numeric"
                      value={item.qty}
                      onChangeText={(v) => updateItemField(index, 'qty', v)}
                    />
                  </View>
                  <View style={[styles.itemField, { flex: 1.5 }]}>
                    <Text style={styles.fieldLabel}>Harga Satuan</Text>
                    <TextInput
                      style={styles.itemInput}
                      keyboardType="numeric"
                      value={item.unit_price}
                      onChangeText={(v) => updateItemField(index, 'unit_price', v)}
                    />
                  </View>
                </View>

                <Text style={styles.subtotalText}>
                  Subtotal: {formatRp(calculateSubtotal(item))}
                </Text>
              </View>
            ))
          )}

          {/* Product Picker Modal */}
          {showProductPicker && (
            <View style={styles.productPickerContainer}>
              <View style={styles.pickerSearchRow}>
                <Search size={16} color="#94a3b8" />
                <TextInput
                  style={styles.pickerSearchInput}
                  placeholder="Cari produk..."
                  placeholderTextColor="#64748b"
                  value={productSearch}
                  onChangeText={setProductSearch}
                />
                <TouchableOpacity onPress={() => setShowProductPicker(false)}>
                  <X size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              {loadingProducts ? (
                <ActivityIndicator color="#2563eb" style={{ padding: 20 }} />
              ) : (
                <ScrollView style={styles.productPickerList} nestedScrollEnabled>
                  {filteredProducts.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.productItem}
                      onPress={() => selectProductForItem(selectedItemIndex, p)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.productItemName}>{p.name}</Text>
                        <Text style={styles.productItemDetail}>
                          Harga: {formatRp(p.buy_price || p.modal_price || p.sell_price || 0)} | Stok: {p.stock || 0}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {filteredProducts.length === 0 && (
                    <Text style={styles.pickerEmpty}>Tidak ada produk ditemukan</Text>
                  )}
                </ScrollView>
              )}
            </View>
          )}

          {items.length > 0 && (
            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Total Keseluruhan</Text>
              <Text style={styles.totalValue}>{formatRp(totalAmount)}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>
              {isEdit ? 'Perbarui Purchase Order' : 'Buat Purchase Order'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 40 : 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  form: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerButton: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#94a3b8',
  },
  pickerDropdownContainer: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 8,
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 8,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
  },
  pickerList: {
    maxHeight: 200,
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  pickerItemActive: {
    backgroundColor: '#2563eb',
  },
  pickerItemText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  pickerItemTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  pickerEmpty: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  branchText: {
    color: '#94a3b8',
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addItemBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyItems: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  itemCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  selectedProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  selectedProductText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    flex: 1,
  },
  changeLink: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  selectProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  selectProductText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  removeBtn: {
    padding: 6,
  },
  itemFieldsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  itemField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 4,
  },
  itemInput: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  subtotalText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 8,
  },
  productPickerContainer: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  productPickerList: {
    maxHeight: 200,
  },
  productItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  productItemName: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  productItemDetail: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#1e3a8a',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});

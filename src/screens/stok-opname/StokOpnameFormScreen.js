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
import { ArrowLeft, Plus, Trash2, Search, X, ClipboardCheck } from 'lucide-react-native';
import { submitStokOpname } from '../../services/StokOpnameService';
import { useAuthStore } from '../../stores/authStore';
import { formatRp } from '../../utils/format';
import api from '../../services/api';

export default function StokOpnameFormScreen({ navigation, selectedBranch }) {
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);

  // Form fields
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);

  // Product picker
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(null);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const branchId = selectedBranch?.id || user?.branch_id || 1;
      const response = await api.get('/api/v1/products', { params: { branch_id: branchId } });
      setProducts(response.data?.data || response.data || []);
    } catch (err) {
      console.error('Load products error:', err);
      toast.error('Gagal memuat data produk');
    } finally {
      setLoadingProducts(false);
    }
  }, [selectedBranch, user]);

  const filteredProducts = products.filter(p =>
    (p.name || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = () => {
    setItems(prev => [...prev, {
      product_id: '',
      product_name: '',
      system_qty: '0',
      actual_qty: '0',
      unit_name: '',
      notes: '',
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
      system_qty: String(product.stock || 0),
      actual_qty: String(product.stock || 0),
      unit_name: product.unit_name || product.unit || '',
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

  const calculateDifference = (item) => {
    const actual = parseFloat(item.actual_qty) || 0;
    const system = parseFloat(item.system_qty) || 0;
    return actual - system;
  };

  const totalAdjustment = items.reduce((sum, item) => sum + calculateDifference(item), 0);

  const validate = () => {
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
      const actual = parseFloat(item.actual_qty);
      if (isNaN(actual) || actual < 0) {
        toast.error(`Item ke-${i + 1}: qty aktual tidak valid`);
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
        branch_id: branchId,
        notes: notes.trim(),
        items: items.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          system_qty: parseFloat(item.system_qty) || 0,
          actual_qty: parseFloat(item.actual_qty) || 0,
          unit_name: item.unit_name || '',
          notes: item.notes || '',
        })),
      };

      await submitStokOpname(payload);
      toast.success('Stok Opname berhasil disimpan!');

      if (navigation) {
        navigation.goBack();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Gagal menyimpan Stok Opname');
    } finally {
      setLoading(false);
    }
  };

  // Set system qty when product is selected for all items that have product_id set
  const handleCompleteProductSelection = (index, product) => {
    selectProductForItem(index, product);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Buat Stok Opname</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.form}>
          <Text style={styles.label}>Cabang</Text>
          <Text style={styles.branchText}>
            {selectedBranch?.name || user?.branch?.name || `Cabang ID: ${selectedBranch?.id || user?.branch_id || 1}`}
          </Text>

          <Text style={styles.label}>Catatan</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Catatan untuk stok opname..."
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
            <TouchableOpacity style={styles.addItemBtn} onPress={() => {
              setShowProductPicker(true);
              setSelectedItemIndex(null);
            }}>
              <Plus size={18} color="#fff" />
              <Text style={styles.addItemBtnText}>Tambah Item</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <Text style={styles.emptyItems}>Belum ada item. Tekan "Tambah Item"</Text>
          ) : (
            items.map((item, index) => {
              const diff = calculateDifference(item);
              return (
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
                            loadProducts();
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
                            loadProducts();
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
                      <Text style={styles.fieldLabel}>Sistem</Text>
                      <TextInput
                        style={styles.itemInput}
                        keyboardType="numeric"
                        value={item.system_qty}
                        onChangeText={(v) => updateItemField(index, 'system_qty', v)}
                      />
                    </View>
                    <View style={styles.itemField}>
                      <Text style={styles.fieldLabel}>Aktual</Text>
                      <TextInput
                        style={styles.itemInput}
                        keyboardType="numeric"
                        value={item.actual_qty}
                        onChangeText={(v) => updateItemField(index, 'actual_qty', v)}
                      />
                    </View>
                    <View style={styles.itemField}>
                      <Text style={styles.fieldLabel}>Selisih</Text>
                      <View style={[styles.diffBadge, { backgroundColor: diff === 0 ? '#1e293b' : diff > 0 ? '#052e16' : '#450a0a' }]}>
                        <Text style={[styles.diffText, { color: diff === 0 ? '#94a3b8' : diff > 0 ? '#22c55e' : '#ef4444' }]}>
                          {diff > 0 ? '+' : ''}{diff}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <TextInput
                    style={styles.itemNoteInput}
                    placeholder="Catatan item (opsional)"
                    placeholderTextColor="#64748b"
                    value={item.notes}
                    onChangeText={(v) => updateItemField(index, 'notes', v)}
                  />
                </View>
              );
            })
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
                      onPress={() => {
                        if (selectedItemIndex !== null && selectedItemIndex < items.length) {
                          selectProductForItem(selectedItemIndex, p);
                        } else {
                          // Add new item with this product
                          handleCompleteProductSelection(items.length, p);
                          addItem();
                        }
                        setShowProductPicker(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.productItemName}>{p.name}</Text>
                        <Text style={styles.productItemDetail}>
                          Stok: {p.stock || 0} {p.unit_name || 'unit'}
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
              <Text style={styles.totalLabel}>Total Selisih</Text>
              <Text style={[styles.totalValue, { color: totalAdjustment === 0 ? '#94a3b8' : totalAdjustment > 0 ? '#22c55e' : '#ef4444' }]}>
                {totalAdjustment > 0 ? '+' : ''}{totalAdjustment} unit
              </Text>
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
              Simpan Stok Opname
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
  branchText: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '600',
    marginBottom: 4,
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
    fontWeight: '600',
  },
  emptyItems: {
    color: '#64748b',
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 12,
    textAlign: 'center',
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
  },
  selectedProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedProductText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  changeLink: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
  },
  selectProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  selectProductText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  removeBtn: {
    padding: 6,
    marginLeft: 8,
  },
  itemFieldsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  itemField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '600',
  },
  itemInput: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
    textAlign: 'center',
  },
  diffBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  diffText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  itemNoteInput: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#94a3b8',
    borderWidth: 1,
    borderColor: '#334155',
  },
  productPickerContainer: {
    marginTop: 8,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 8,
    gap: 8,
  },
  pickerSearchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  productPickerList: {
    maxHeight: 300,
    marginTop: 8,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  productItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
  productItemDetail: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  pickerEmpty: {
    color: '#64748b',
    fontSize: 13,
    padding: 16,
    textAlign: 'center',
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#475569',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

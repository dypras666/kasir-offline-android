import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput, 
  ActivityIndicator, ScrollView, Alert, Platform
} from 'react-native';
import { ArrowLeft, CheckSquare, Square, Save } from 'lucide-react-native';
import { formatRp } from '../../utils/format';
import { ReturnService } from '../../services/ReturnService';
import { toast } from 'sonner-native';

const ReturnFormScreen = ({ sale, saleItems, navigation, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  
  // Determine refund types based on original sale's payments
  const originalPayments = sale.payments ? (typeof sale.payments === 'string' ? JSON.parse(sale.payments) : sale.payments) : [{ payment_method_id: sale.payment_method || 'CASH' }];
  const defaultRefundType = originalPayments.length > 0 ? originalPayments[0].payment_method_id : 'CASH';
  const [refundType, setRefundType] = useState(defaultRefundType);
  
  // Track qty to return for each item
  const [returnItems, setReturnItems] = useState(
    saleItems.map(i => ({ ...i, returnQty: 0, maxQty: i.qty }))
  );

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
      `Yakin ingin meretur ${itemsToReturn.length} jenis barang?`,
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Ya, Retur', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await ReturnService.submitReturn(sale, itemsToReturn, reason, { refund_type: refundType });
              toast.success('Retur berhasil diproses');
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>Form Retur Penjualan</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <View style={styles.infoCard}>
          <Text style={styles.label}>Invoice</Text>
          <Text style={styles.value}>{sale.invoice_number}</Text>
          <Text style={[styles.label, { marginTop: 10 }]}>Alasan Retur</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Contoh: Barang rusak, salah ukuran..." 
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={2}
          />

          {/* Refund type based on original payment */}
          <Text style={[styles.label, { marginTop: 12 }]}>Metode Refund</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {originalPayments.map((pmt, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.refundTypeBtn,
                  refundType === pmt.payment_method_id && styles.refundTypeBtnActive
                ]}
                onPress={() => setRefundType(pmt.payment_method_id)}
              >
                <Text style={[
                  styles.refundTypeBtnText,
                  refundType === pmt.payment_method_id && styles.refundTypeBtnTextActive
                ]}>
                  {pmt.payment_method_id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {originalPayments.length > 1 && (
            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              Transaksi ini menggunakan {originalPayments.length} metode pembayaran. Pilih metode refund.
            </Text>
          )}
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Pilih Barang</Text>
          <TouchableOpacity onPress={handleSelectAll}>
            <Text style={styles.selectAllText}>Pilih Semua</Text>
          </TouchableOpacity>
        </View>

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
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
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
  infoCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 20, elevation: 1 },
  label: { fontSize: 13, color: '#64748b', marginBottom: 4 },
  value: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, backgroundColor: '#f8fafc', fontSize: 14, textAlignVertical: 'top' },
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
  footer: { backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderColor: '#e2e8f0' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  summaryLabel: { fontSize: 14, color: '#64748b' },
  summaryValue: { fontSize: 18, fontWeight: 'bold', color: '#ef4444' },
  submitBtn: { backgroundColor: '#ef4444', padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  submitBtnDisabled: { backgroundColor: '#fca5a5' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  refundTypeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  refundTypeBtnActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  refundTypeBtnText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  refundTypeBtnTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});

export default ReturnFormScreen;

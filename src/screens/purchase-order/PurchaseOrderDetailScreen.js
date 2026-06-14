import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { toast } from 'sonner-native';
import { ArrowLeft, FileText, CheckCircle, XCircle, FileInput, Calendar, MapPin, User, Info } from 'lucide-react-native';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import { useAuthStore } from '../../stores/authStore';
import { formatRp, formatDate } from '../../utils/format';

const STATUS_COLORS = {
  draft: { bg: '#fef9c7', text: '#a16207' },
  approved: { bg: '#dbeafe', text: '#1e40af' },
  partially_received: { bg: '#fef08a', text: '#854d0e' },
  completed: { bg: '#bbf7d0', text: '#166534' },
  cancelled: { bg: '#fecaca', text: '#991b1b' },
};

export default function PurchaseOrderDetailScreen({ navigation, route, purchaseOrderId }) {
  const { user } = useAuthStore();
  const [po, setPo] = useState(route?.params?.purchaseOrder || null);
  const [loading, setLoading] = useState(!po);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const id = po?.id || purchaseOrderId || route?.params?.purchaseOrderId;

  const fetchPODetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await PurchaseOrderService.getPurchaseOrder(id);
      setPo(data?.data || data);
    } catch (err) {
      console.error(err);
      setError('Gagal memuat detail purchase order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPODetail();
  }, [fetchPODetail]);

  const handleApprove = async () => {
    Alert.alert('Konfirmasi', 'Setujui Purchase Order ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Setujui',
        onPress: async () => {
          setActionLoading(true);
          try {
            await PurchaseOrderService.approvePurchaseOrder(id);
            toast.success('Purchase Order berhasil disetujui');
            fetchPODetail();
          } catch (err) {
            toast.error(err?.response?.data?.message || 'Gagal menyetujui PO');
          } finally {
            setActionLoading(false);
          }
        }
      }
    ]);
  };

  const handleCancel = async () => {
    Alert.alert('Konfirmasi', 'Batalkan Purchase Order ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Batalkan',
        onPress: async () => {
          setActionLoading(true);
          try {
            await PurchaseOrderService.cancelPurchaseOrder(id);
            toast.success('Purchase Order berhasil dibatalkan');
            fetchPODetail();
          } catch (err) {
            toast.error(err?.response?.data?.message || 'Gagal membatalkan PO');
          } finally {
            setActionLoading(false);
          }
        }
      }
    ]);
  };

  const handleConvertToInvoice = async () => {
    Alert.alert('Konfirmasi', 'Konversi PO ini menjadi Faktur Pembelian (Invoice)?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Konversi',
        onPress: async () => {
          setActionLoading(true);
          try {
            await PurchaseOrderService.convertToInvoice(id);
            toast.success('Berhasil dikonversi ke Invoice');
            fetchPODetail();
          } catch (err) {
            toast.error(err?.response?.data?.message || 'Gagal konversi ke Invoice');
          } finally {
            setActionLoading(false);
          }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error || !po) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Data tidak ditemukan'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={{ color: '#fff' }}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusStyle = STATUS_COLORS[po.status] || { bg: '#e2e8f0', text: '#475569' };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{po.po_number || `PO #${po.id}`}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {(po.status || 'draft').toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <User size={18} color="#94a3b8" />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Supplier</Text>
              <Text style={styles.infoValue}>{po.supplier?.name || po.supplier_name || '-'}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <MapPin size={18} color="#94a3b8" />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Cabang</Text>
              <Text style={styles.infoValue}>{po.branch?.name || po.branch_name || '-'}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Calendar size={18} color="#94a3b8" />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Tanggal Order</Text>
              <Text style={styles.infoValue}>{formatDate(po.order_date)}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Calendar size={18} color="#94a3b8" />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Estimasi Datang</Text>
              <Text style={styles.infoValue}>{po.expected_delivery_date ? formatDate(po.expected_delivery_date) : '-'}</Text>
            </View>
          </View>
          {po.notes && (
            <View style={styles.infoRow}>
              <Info size={18} color="#94a3b8" />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Catatan</Text>
                <Text style={styles.infoValue}>{po.notes}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>Item Produk</Text>
          {po.items?.map((item, idx) => (
            <View key={item.id || idx} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.productName}>{item.product?.name || item.product_name || `Produk #${item.product_id}`}</Text>
                <Text style={styles.itemSubtotal}>{formatRp(item.subtotal || (item.qty_ordered * item.unit_price))}</Text>
              </View>
              <View style={styles.itemDetails}>
                <Text style={styles.itemQty}>
                  Qty: {item.qty_ordered} {item.unit_name || 'unit'} 
                  {item.qty_received > 0 && ` (Diterima: ${item.qty_received})`}
                </Text>
                <Text style={styles.itemPrice}>@ {formatRp(item.unit_price)}</Text>
              </View>
            </View>
          ))}
          
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Keseluruhan</Text>
            <Text style={styles.totalValue}>{formatRp(po.total_amount)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {po.status === 'draft' && (
            <TouchableOpacity 
              style={[styles.actionBtn, styles.approveBtn]} 
              onPress={handleApprove}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <CheckCircle color="#fff" size={20} />
                  <Text style={styles.actionBtnText}>Setujui PO</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {(po.status === 'draft' || po.status === 'approved') && (
            <TouchableOpacity 
              style={[styles.actionBtn, styles.cancelBtn]} 
              onPress={handleCancel}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <XCircle color="#fff" size={20} />
                  <Text style={styles.actionBtnText}>Batalkan PO</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {(po.status === 'approved' || po.status === 'partially_received') && (
            <TouchableOpacity 
              style={[styles.actionBtn, styles.convertBtn]} 
              onPress={handleConvertToInvoice}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <FileInput color="#fff" size={20} />
                  <Text style={styles.actionBtnText}>Konversi ke Invoice</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
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
  backBtn: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoCol: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  infoValue: {
    fontSize: 14,
    color: '#f8fafc',
    fontWeight: '600',
  },
  itemsSection: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  itemCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
    flex: 1,
  },
  itemSubtotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemQty: {
    fontSize: 12,
    color: '#94a3b8',
  },
  itemPrice: {
    fontSize: 12,
    color: '#94a3b8',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
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
    color: '#2563eb',
  },
  actions: {
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  approveBtn: {
    backgroundColor: '#16a34a',
  },
  cancelBtn: {
    backgroundColor: '#dc2626',
  },
  convertBtn: {
    backgroundColor: '#2563eb',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});

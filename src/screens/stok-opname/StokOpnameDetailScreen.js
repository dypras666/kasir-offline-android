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
import { ArrowLeft, CheckCircle, XCircle, ClipboardList, Calendar, MapPin, Info } from 'lucide-react-native';
import { getStokOpnameDetailLocal, completeStokOpnameLocal, cancelStokOpnameLocal } from '../../services/StokOpnameService';
import { formatDate } from '../../utils/format';

const STATUS_COLORS = {
  draft: { bg: '#fef9c7', text: '#a16207' },
  completed: { bg: '#bbf7d0', text: '#166534' },
  cancelled: { bg: '#fecaca', text: '#991b1b' },
};

export default function StokOpnameDetailScreen({ navigation, route, stokOpnameId }) {
  const [so, setSo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const id = stokOpnameId || route?.params?.stokOpnameId;

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getStokOpnameDetailLocal(id);
      setSo(data);
    } catch (err) {
      console.error(err);
      setError('Gagal memuat detail stok opname.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleComplete = async () => {
    Alert.alert('Konfirmasi', 'Selesaikan Stok Opname ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Selesaikan',
        onPress: async () => {
          setActionLoading(true);
          try {
            await completeStokOpnameLocal(id);
            toast.success('Stok Opname berhasil diselesaikan');
            fetchDetail();
          } catch (err) {
            toast.error('Gagal menyelesaikan Stok Opname');
          } finally {
            setActionLoading(false);
          }
        }
      }
    ]);
  };

  const handleCancel = async () => {
    Alert.alert('Konfirmasi', 'Batalkan Stok Opname ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya, Batalkan',
        onPress: async () => {
          setActionLoading(true);
          try {
            await cancelStokOpnameLocal(id);
            toast.success('Stok Opname berhasil dibatalkan');
            fetchDetail();
          } catch (err) {
            toast.error('Gagal membatalkan Stok Opname');
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

  if (error || !so) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Data tidak ditemukan'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={{ color: '#fff' }}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusStyle = STATUS_COLORS[so.status] || { bg: '#e2e8f0', text: '#475569' };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{so.opname_number || `SO #${so.id}`}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {(so.status || 'draft').toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <ClipboardList size={18} color="#94a3b8" />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Nomor Opname</Text>
              <Text style={styles.infoValue}>{so.opname_number || `SO-${so.id}`}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <MapPin size={18} color="#94a3b8" />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Cabang ID</Text>
              <Text style={styles.infoValue}>{so.branch_id || '-'}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Calendar size={18} color="#94a3b8" />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Dibuat Pada</Text>
              <Text style={styles.infoValue}>{formatDate(so.created_at)}</Text>
            </View>
          </View>
          {so.completed_at && (
            <View style={styles.infoRow}>
              <Calendar size={18} color="#94a3b8" />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Diselesaikan Pada</Text>
                <Text style={styles.infoValue}>{formatDate(so.completed_at)}</Text>
              </View>
            </View>
          )}
          {so.notes && (
            <View style={styles.infoRow}>
              <Info size={18} color="#94a3b8" />
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>Catatan</Text>
                <Text style={styles.infoValue}>{so.notes}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>Item Produk</Text>
          {so.items?.length > 0 ? (
            <>
              {/* Header row */}
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>Produk</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Sistem</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Aktual</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Selisih</Text>
              </View>
              {so.items.map((item, idx) => (
                <View key={item.id || idx} style={styles.itemRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.productName} numberOfLines={2}>
                      {item.product_name || `Produk #${item.product_id}`}
                    </Text>
                  </View>
                  <Text style={[styles.itemQty, { flex: 1, textAlign: 'center' }]}>{item.system_qty}</Text>
                  <Text style={[styles.itemQty, { flex: 1, textAlign: 'center' }]}>{item.actual_qty}</Text>
                  <Text style={[
                    styles.itemDiff,
                    { flex: 1, textAlign: 'right' },
                    { color: item.difference === 0 ? '#94a3b8' : item.difference > 0 ? '#22c55e' : '#ef4444' }
                  ]}>
                    {item.difference > 0 ? '+' : ''}{item.difference}
                  </Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Selisih</Text>
                <Text style={[
                  styles.totalValue,
                  { color: so.total_adjustment === 0 ? '#94a3b8' : so.total_adjustment > 0 ? '#22c55e' : '#ef4444' }
                ]}>
                  {so.total_adjustment > 0 ? '+' : ''}{so.total_adjustment} unit
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.noItemsText}>Tidak ada item dalam opname ini</Text>
          )}
        </View>

        <View style={styles.actions}>
          {so.status === 'draft' && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.completeBtn]}
                onPress={handleComplete}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <CheckCircle color="#fff" size={20} />
                    <Text style={styles.actionBtnText}>Selesaikan Opname</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={handleCancel}
                disabled={actionLoading}
              >
                <XCircle color="#fff" size={20} />
                <Text style={styles.actionBtnText}>Batalkan Opname</Text>
              </TouchableOpacity>
            </>
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
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    marginBottom: 4,
  },
  th: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8fafc',
    paddingRight: 8,
  },
  itemQty: {
    fontSize: 13,
    color: '#94a3b8',
  },
  itemDiff: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
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
  },
  noItemsText: {
    color: '#64748b',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
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
  completeBtn: {
    backgroundColor: '#16a34a',
  },
  cancelBtn: {
    backgroundColor: '#dc2626',
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

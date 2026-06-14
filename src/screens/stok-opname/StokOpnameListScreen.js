import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { toast } from 'sonner-native';
import { Plus, Package, ArrowLeft } from 'lucide-react-native';
import { getStokOpnamesLocal } from '../../services/StokOpnameService';
import { useAuthStore } from '../../stores/authStore';
import { formatDate } from '../../utils/format';

const STATUS_FILTERS = [
  { label: 'Semua', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const STATUS_COLORS = {
  draft: { bg: '#fef9c7', text: '#a16207' },
  completed: { bg: '#bbf7d0', text: '#166534' },
  cancelled: { bg: '#fecaca', text: '#991b1b' },
};

export default function StokOpnameListScreen({ navigation, selectedBranch }) {
  const { user } = useAuthStore();
  const [stokOpnames, setStokOpnames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState(null);

  const fetchStokOpnames = useCallback(async () => {
    try {
      setError(null);
      const branchId = selectedBranch?.id || user?.branch_id || '1';
      const data = await getStokOpnamesLocal({ 
        status: statusFilter,
        branch_id: branchId
      });
      setStokOpnames(data || []);
    } catch (err) {
      console.error(err);
      setError('Gagal memuat data stok opname.');
      toast.error('Gagal memuat data stok opname.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, selectedBranch, user]);

  useEffect(() => {
    setLoading(true);
    fetchStokOpnames();
  }, [fetchStokOpnames]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStokOpnames();
  };

  const getStatusStyle = (status) => {
    const colors = STATUS_COLORS[status] || { bg: '#e2e8f0', text: '#475569' };
    return colors;
  };

  const renderItem = ({ item }) => {
    const statusStyle = getStatusStyle(item.status);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (navigation) {
            navigation.navigate('StokOpnameDetail', { stokOpnameId: item.id });
          }
        }}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.soNumber}>{item.opname_number || `SO-${item.id}`}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {(item.status || 'draft').toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.notesText} numberOfLines={1}>
          {item.notes || 'Tidak ada catatan'}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
          <Text style={styles.itemCount}>
            {item.total_items || 0} item dihitung
          </Text>
        </View>
        {item.total_adjustment !== 0 && (
          <Text style={[
            styles.adjustmentText, 
            { color: item.total_adjustment > 0 ? '#16a34a' : '#dc2626' }
          ]}>
            Selisih: {item.total_adjustment > 0 ? '+' : ''}{item.total_adjustment} unit
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.center}>
      <Package size={48} color="#64748b" />
      <Text style={styles.emptyText}>Belum ada stok opname.</Text>
      <Text style={styles.emptySubText}>Tekan + untuk membuat baru</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Stok Opname</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (navigation) {
              navigation.navigate('StokOpnameForm');
            }
          }}
        >
          <Plus color="#fff" size={20} />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterChip,
              statusFilter === f.value && styles.filterChipActive,
            ]}
            onPress={() => {
              setStatusFilter(f.value);
              setLoading(true);
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === f.value && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); fetchStokOpnames(); }}>
            <Text style={styles.retryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlashList
          data={stokOpnames}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          estimatedItemSize={120}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
          }
          ListEmptyComponent={renderEmpty}
        />
      )}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  addButton: {
    backgroundColor: '#2563eb',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#2563eb',
  },
  filterChipText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  soNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  notesText: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
    color: '#64748b',
  },
  itemCount: {
    fontSize: 12,
    color: '#64748b',
  },
  adjustmentText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 12,
  },
  emptySubText: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});

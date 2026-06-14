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
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import { useAuthStore } from '../../stores/authStore';
import { formatRp, formatDate } from '../../utils/format';

const STATUS_FILTERS = [
  { label: 'Semua', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Approved', value: 'approved' },
  { label: 'Partial', value: 'partially_received' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const STATUS_COLORS = {
  draft: { bg: '#fef9c7', text: '#a16207' },
  approved: { bg: '#dbeafe', text: '#1e40af' },
  partially_received: { bg: '#fef08a', text: '#854d0e' },
  completed: { bg: '#bbf7d0', text: '#166534' },
  cancelled: { bg: '#fecaca', text: '#991b1b' },
};

export default function PurchaseOrderScreen({ navigation, selectedBranch }) {
  const { user } = useAuthStore();
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState(null);

  const fetchPOs = useCallback(async (pageNum = 1, append = false) => {
    try {
      setError(null);
      const branchId = selectedBranch?.id || user?.branch_id || 1;
      const params = {
        branch_id: branchId,
        page: pageNum,
        per_page: 20,
      };
      if (statusFilter) params.status = statusFilter;

      const data = await PurchaseOrderService.getPurchaseOrders(params);
      const list = data?.data || data || [];

      if (append) {
        setPurchaseOrders(prev => [...prev, ...list]);
      } else {
        setPurchaseOrders(list);
      }

      setHasMore(list.length >= 20);
      setPage(pageNum);
    } catch (err) {
      console.error(err);
      setError('Gagal memuat data purchase order.');
      toast.error('Gagal memuat data purchase order.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [statusFilter, selectedBranch, user]);

  useEffect(() => {
    setLoading(true);
    setPurchaseOrders([]);
    setPage(1);
    fetchPOs(1, false);
  }, [fetchPOs]);

  const onRefresh = () => {
    setRefreshing(true);
    setPurchaseOrders([]);
    setPage(1);
    fetchPOs(1, false);
  };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPOs(page + 1, true);
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
            navigation.navigate('PurchaseOrderDetail', { purchaseOrder: item });
          }
        }}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.poNumber}>{item.po_number || `PO-${item.id}`}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {(item.status || 'draft').replace(/_/g, ' ').toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.supplierName} numberOfLines={1}>
          {item.supplier?.name || item.supplier_name || '-'}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>{formatDate(item.order_date || item.created_at)}</Text>
          <Text style={styles.itemCount}>
            {item.items?.length || item.total_items || 0} item
          </Text>
        </View>
        {item.total_amount != null && (
          <Text style={styles.totalAmount}>{formatRp(item.total_amount)}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.center}>
      <Package size={48} color="#64748b" />
      <Text style={styles.emptyText}>Belum ada purchase order.</Text>
      <Text style={styles.emptySubText}>Tekan + untuk membuat PO baru</Text>
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
        <Text style={styles.headerTitle}>Purchase Order</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (navigation) {
              navigation.navigate('PurchaseOrderForm');
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
              setPurchaseOrders([]);
              setPage(1);
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
          <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); fetchPOs(1, false); }}>
            <Text style={styles.retryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlashList
          data={purchaseOrders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          estimatedItemSize={120}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#2563eb" />
              </View>
            ) : null
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
  poNumber: {
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
  supplierName: {
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
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3b82f6',
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
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

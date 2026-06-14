import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput, 
  ActivityIndicator, Platform
} from 'react-native';
import { Search, RefreshCw, FileText, Filter, ArrowUpDown, RotateCcw } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { formatRp, formatDate } from '../../utils/format';
import { PurchaseReturnService } from '../../services/PurchaseReturnService';
import { toast } from 'sonner-native';
import { Storage } from '../../services/api';
import axios from 'axios';

const PurchaseReturnListScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [returns, setReturns] = useState([]);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, synced, unsynced
  const [filterDate, setFilterDate] = useState('all'); // all, today, week, month
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'suppliers' (for picking invoice)

  useEffect(() => {
    fetchReturns();
  }, []);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await PurchaseReturnService.getPurchaseReturnsLocal();

      let filtered = [...data];

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        filtered = filtered.filter(r =>
          (r.invoice_number && r.invoice_number.toLowerCase().includes(q)) ||
          (r.supplier_name && r.supplier_name.toLowerCase().includes(q)) ||
          String(r.id).includes(q)
        );
      }

      // Filter by supplier
      if (filterSupplier) {
        filtered = filtered.filter(r => r.supplier_name === filterSupplier);
      }

      // Filter by status
      if (filterStatus === 'synced') {
        filtered = filtered.filter(r => r.synced === 1);
      } else if (filterStatus === 'unsynced') {
        filtered = filtered.filter(r => r.synced === 0);
      }

      // Filter by date
      if (filterDate !== 'all') {
        const now = new Date();
        let startDate;
        if (filterDate === 'today') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (filterDate === 'week') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (filterDate === 'month') {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        if (startDate) {
          filtered = filtered.filter(r => new Date(r.created_at) >= startDate);
        }
      }

      setReturns(filtered);
    } catch (e) {
      console.error('fetchReturns error:', e);
      toast.error('Gagal memuat retur pembelian');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterSupplier, filterStatus, filterDate]);

  const getUniqueSuppliers = () => {
    const unique = new Set(returns.map(r => r.supplier_name).filter(Boolean));
    return [...unique];
  };

  const renderReturnItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.invoiceNumber}>{item.invoice_number || `Retur #${item.id}`}</Text>
        <View style={[
          styles.badge,
          { backgroundColor: item.synced === 1 ? '#dcfce7' : '#fef3c7' }
        ]}>
          <Text style={[
            styles.badgeText,
            { color: item.synced === 1 ? '#15803d' : '#b45309' }
          ]}>
            {item.synced === 1 ? 'TERSYNC' : 'MENUNGGU'}
          </Text>
        </View>
      </View>
      {item.supplier_name && (
        <Text style={styles.supplierName}>{item.supplier_name}</Text>
      )}
      <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.reasonLabel} numberOfLines={1}>
          {item.reason || 'Tidak ada alasan'}
        </Text>
        <Text style={styles.totalValue}>{formatRp(item.total_return)}</Text>
      </View>
    </View>
  );

  const renderListTab = () => (
    <View style={{ flex: 1 }}>
      {/* Search & Refresh */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Search size={18} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari invoice / supplier..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={fetchReturns}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.iconBtn}>
          <Filter size={20} color={showFilters ? '#3b82f6' : '#64748b'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={fetchReturns} style={styles.iconBtn}>
          <RefreshCw size={20} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      {showFilters && (
        <View style={styles.filtersContainer}>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.filterOptions}>
              {['all', 'synced', 'unsynced'].map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}
                  onPress={() => setFilterStatus(s)}
                >
                  <Text style={[styles.filterChipText, filterStatus === s && styles.filterChipTextActive]}>
                    {s === 'all' ? 'Semua' : s === 'synced' ? 'Tersync' : 'Menunggu'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Periode</Text>
            <View style={styles.filterOptions}>
              {[
                { key: 'all', label: 'Semua' },
                { key: 'today', label: 'Hari Ini' },
                { key: 'week', label: 'Minggu Ini' },
                { key: 'month', label: 'Bulan Ini' }
              ].map(d => (
                <TouchableOpacity
                  key={d.key}
                  style={[styles.filterChip, filterDate === d.key && styles.filterChipActive]}
                  onPress={() => setFilterDate(d.key)}
                >
                  <Text style={[styles.filterChipText, filterDate === d.key && styles.filterChipTextActive]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {getUniqueSuppliers().length > 0 && (
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Supplier</Text>
              <View style={styles.filterOptions}>
                <TouchableOpacity
                  style={[styles.filterChip, !filterSupplier && styles.filterChipActive]}
                  onPress={() => setFilterSupplier('')}
                >
                  <Text style={[styles.filterChipText, !filterSupplier && styles.filterChipTextActive]}>
                    Semua
                  </Text>
                </TouchableOpacity>
                {getUniqueSuppliers().map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.filterChip, filterSupplier === s && styles.filterChipActive]}
                    onPress={() => setFilterSupplier(s)}
                  >
                    <Text style={[styles.filterChipText, filterSupplier === s && styles.filterChipTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Daftar retur pembelian. Gunakan filter untuk menyaring data. Total: {returns.length} retur.
        </Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Memuat data...</Text>
        </View>
      ) : (
        <FlashList
          data={returns}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={110}
          renderItem={renderReturnItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <RotateCcw size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>
                {searchQuery || filterSupplier || filterStatus !== 'all' || filterDate !== 'all'
                  ? 'Tidak ada retur yang cocok'
                  : 'Belum ada retur pembelian'}
              </Text>
              <Text style={styles.emptySubtext}>
                Retur pembelian akan muncul setelah diproses
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <RotateCcw size={22} color="#0f172a" />
        <Text style={styles.title}>Retur Pembelian</Text>
      </View>
      {renderListTab()}
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
    borderColor: '#e2e8f0',
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },

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
  iconBtn: { padding: 10 },

  // Filters
  filtersContainer: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterRow: {
    marginBottom: 10,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  filterChipActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  filterChipText: {
    fontSize: 12,
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },

  // Info
  infoBox: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderColor: '#3b82f6',
  },
  infoText: { fontSize: 13, color: '#1e40af', lineHeight: 18 },

  // Card
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  invoiceNumber: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#0f172a',
    flex: 1,
  },
  supplierName: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '600',
    marginBottom: 2,
  },
  date: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  reasonLabel: { fontSize: 12, color: '#94a3b8', flex: 1, marginRight: 8 },
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
});

export default PurchaseReturnListScreen;

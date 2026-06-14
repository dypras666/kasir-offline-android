import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform
} from 'react-native';
import { ArrowLeft, RefreshCw, Plus } from 'lucide-react-native';
import { ExpenseService } from '../services/ExpenseService';
import { useAuthStore } from '../stores/authStore';
import { formatRp, formatDate } from '../utils/format';

export default function ExpenseHistoryScreen({ navigation, selectedBranch }) {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchExpenses = useCallback(async () => {
    try {
      setError(null);
      const branchId = selectedBranch?.id || user?.branch_id || 1;
      const data = await ExpenseService.getExpenses({ branch_id: branchId });
      // Depending on API response shape
      setExpenses(data?.data || data || []);
    } catch (err) {
      console.error(err);
      setError('Gagal memuat riwayat biaya operasional.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranch, user]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchExpenses();
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.refNo}>{item.reference_no || `EXP-${item.id}`}</Text>
        <Text style={styles.date}>{item.tanggal || formatDate(item.created_at)}</Text>
      </View>
      
      <Text style={styles.title}>{item.judul}</Text>
      <Text style={styles.categoryBadge}>{item.kategori?.toUpperCase()}</Text>
      
      <View style={styles.cardFooter}>
        <Text style={styles.amount}>{formatRp(item.amount)}</Text>
        <Text style={[
          styles.status,
          item.status === 'approved' ? styles.statusApproved : 
          item.status === 'rejected' ? styles.statusRejected : styles.statusPending
        ]}>
          {(item.status || 'pending').toUpperCase()}
        </Text>
      </View>
      {item.keterangan ? (
        <Text style={styles.note} numberOfLines={2}>{item.keterangan}</Text>
      ) : null}
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
        <Text style={styles.headerTitle}>Riwayat Biaya</Text>
        <TouchableOpacity 
          style={styles.addButton} 
          onPress={() => navigation.navigate('ExpenseInput')}
        >
          <Plus color="#fff" size={20} />
          <Text style={styles.addButtonText}>Tambah</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchExpenses}>
            <RefreshCw color="#fff" size={16} />
            <Text style={styles.retryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : expenses.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Belum ada biaya operasional.</Text>
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
          }
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    marginLeft: 4,
    fontWeight: 'bold',
    fontSize: 14,
  },
  listContainer: {
    padding: 16,
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
    marginBottom: 8,
  },
  refNo: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  date: {
    fontSize: 12,
    color: '#94a3b8',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 6,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#334155',
    color: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ef4444',
  },
  status: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPending: {
    backgroundColor: '#fef08a',
    color: '#854d0e',
  },
  statusApproved: {
    backgroundColor: '#bbf7d0',
    color: '#166534',
  },
  statusRejected: {
    backgroundColor: '#fecaca',
    color: '#991b1b',
  },
  note: {
    marginTop: 8,
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
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
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
  },
});

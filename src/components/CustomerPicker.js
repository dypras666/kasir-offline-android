import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { User, Search, Plus, X, Star } from 'lucide-react-native';
import { CustomerService } from '../services/customer/CustomerService';
import { formatNumber } from '../utils/format';

/**
 * CustomerPicker — Komponen untuk memilih pelanggan di layar Kasir (POS)
 * 
 * Props:
 * - visible: boolean, modal visible
 * - onSelect: (customer) => void, callback saat pelanggan dipilih
 * - onClose: () => void, callback saat modal ditutup
 * - selectedCustomerId: string | null, ID pelanggan yang sedang dipilih
 */
export default function CustomerPicker({ visible, onSelect, onClose, selectedCustomerId }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CustomerService.search(searchQuery);
      setCustomers(data);
    } catch (e) {
      console.error('CustomerPicker load error:', e);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      loadCustomers();
    }
  }, [visible, loadCustomers]);

  const handleSelect = (customer) => {
    if (onSelect) onSelect(customer);
    if (onClose) onClose();
  };

  const handleClear = () => {
    if (onSelect) onSelect(null);
    if (onClose) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <User size={22} color="#3b82f6" />
            <Text style={styles.headerTitle}>Pilih Pelanggan</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={22} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Search size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama / telepon / email..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Selected Customer Info */}
        {selectedCustomerId && !searchQuery && (
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedLabel}>Pelanggan terpilih:</Text>
            <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Hapus pilihan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Customer List */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Memuat data...</Text>
          </View>
        ) : (
          <FlatList
            data={customers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isSelected = item.id === selectedCustomerId;
              return (
                <TouchableOpacity
                  style={[styles.customerCard, isSelected && styles.customerCardSelected]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(item.name || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
                    {item.phone ? (
                      <Text style={styles.customerDetail} numberOfLines={1}>{item.phone}</Text>
                    ) : null}
                    {item.email ? (
                      <Text style={styles.customerDetail} numberOfLines={1}>{item.email}</Text>
                    ) : null}
                  </View>
                  <View style={styles.poinBadge}>
                    <Star size={12} color="#eab308" />
                    <Text style={styles.poinText}>{formatNumber(item.poin || 0)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <User size={48} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'Pelanggan tidak ditemukan' : 'Belum ada pelanggan'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? 'Coba gunakan kata kunci lain'
                    : 'Tambahkan pelanggan baru di menu Pelanggan'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: 50,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  selectedInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  selectedLabel: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  clearBtnText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 20,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  customerCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  customerDetail: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  poinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fefce8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 4,
  },
  poinText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#a16207',
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

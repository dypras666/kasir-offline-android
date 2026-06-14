import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { User, Plus, Search, X, Star, Phone, Mail, MapPin, Edit3, Trash2, ArrowLeft, Save, Ban } from 'lucide-react-native';
import { CustomerService } from '../../services/customer/CustomerService';
import { formatNumber, formatDate } from '../../utils/format';

/**
 * CustomerScreen — Layar CRUD pelanggan lokal
 * 
 * Props:
 * - navigation: { goBack: () => void }
 */
export default function CustomerScreen({ navigation }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CustomerService.search(searchQuery);
      setCustomers(data);
    } catch (e) {
      console.error('CustomerScreen load error:', e);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', address: '' });
    setEditingCustomer(null);
    setShowForm(false);
  };

  const openEditForm = (customer) => {
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
    });
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.name.trim()) {
      Alert.alert('Validasi', 'Nama pelanggan wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      if (editingCustomer) {
        await CustomerService.update(editingCustomer.id, formData);
      } else {
        await CustomerService.create(formData);
      }
      resetForm();
      await loadCustomers();
    } catch (e) {
      Alert.alert('Error', e.message || 'Gagal menyimpan pelanggan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (customer) => {
    Alert.alert(
      'Hapus Pelanggan',
      `Yakin ingin menghapus "${customer.name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await CustomerService.delete(customer.id);
              await loadCustomers();
            } catch (e) {
              Alert.alert('Error', e.message || 'Gagal menghapus pelanggan.');
            }
          },
        },
      ]
    );
  };

  const renderForm = () => (
    <View style={styles.formContainer}>
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>
          {editingCustomer ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}
        </Text>
        <TouchableOpacity onPress={resetForm}>
          <Ban size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Nama *</Text>
        <TextInput
          style={styles.formInput}
          placeholder="Nama pelanggan"
          placeholderTextColor="#94a3b8"
          value={formData.name}
          onChangeText={(t) => setFormData((p) => ({ ...p, name: t }))}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>No. Telepon</Text>
        <View style={styles.formInputWithIcon}>
          <Phone size={16} color="#94a3b8" />
          <TextInput
            style={styles.formInputIconed}
            placeholder="08xxxxxx"
            placeholderTextColor="#94a3b8"
            value={formData.phone}
            onChangeText={(t) => setFormData((p) => ({ ...p, phone: t }))}
            keyboardType="phone-pad"
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Email</Text>
        <View style={styles.formInputWithIcon}>
          <Mail size={16} color="#94a3b8" />
          <TextInput
            style={styles.formInputIconed}
            placeholder="email@contoh.com"
            placeholderTextColor="#94a3b8"
            value={formData.email}
            onChangeText={(t) => setFormData((p) => ({ ...p, email: t }))}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>Alamat</Text>
        <View style={styles.formInputWithIcon}>
          <MapPin size={16} color="#94a3b8" />
          <TextInput
            style={styles.formInputIconed}
            placeholder="Alamat lengkap"
            placeholderTextColor="#94a3b8"
            value={formData.address}
            onChangeText={(t) => setFormData((p) => ({ ...p, address: t }))}
            multiline
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Save size={18} color="#fff" />
            <Text style={styles.saveBtnText}>
              {editingCustomer ? 'SIMPAN PERUBAHAN' : 'SIMPAN PELANGGAN'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }) => (
    <View style={styles.customerCard}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(item.name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
          {item.phone ? (
            <Text style={styles.customerPhone} numberOfLines={1}>{item.phone}</Text>
          ) : null}
          {item.email ? (
            <Text style={styles.customerEmail} numberOfLines={1}>{item.email}</Text>
          ) : null}
        </View>
        <View style={styles.poinBadge}>
          <Star size={14} color="#eab308" />
          <Text style={styles.poinText}>{formatNumber(item.poin || 0)} poin</Text>
        </View>
      </View>

      {item.address ? (
        <Text style={styles.addressText} numberOfLines={2}>{item.address}</Text>
      ) : null}

      <View style={styles.cardActions}>
        <View>
          <Text style={styles.dateText}>Dibuat: {formatDate(item.created_at)}</Text>
        </View>
        <View style={styles.actionBtns}>
          <TouchableOpacity
            style={styles.actionBtnEdit}
            onPress={() => openEditForm(item)}
          >
            <Edit3 size={14} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnDelete}
            onPress={() => handleDelete(item)}
          >
            <Trash2 size={14} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {showForm ? (
            <TouchableOpacity onPress={resetForm} style={styles.backBtn}>
              <ArrowLeft size={22} color="#0f172a" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
              <ArrowLeft size={22} color="#0f172a" />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>
            {showForm
              ? editingCustomer
                ? 'Edit Pelanggan'
                : 'Tambah Pelanggan'
              : 'Data Pelanggan'}
          </Text>
        </View>
        {!showForm && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
            <Plus size={18} color="#fff" />
            <Text style={styles.addBtnText}>Tambah</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {showForm ? (
        renderForm()
      ) : (
        <>
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
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{customers.length}</Text>
              <Text style={styles.statLabel}>Total Pelanggan</Text>
            </View>
          </View>

          {/* List */}
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
              renderItem={renderItem}
              ListEmptyComponent={
                <View style={styles.centerBox}>
                  <User size={48} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>
                    {searchQuery ? 'Pelanggan tidak ditemukan' : 'Belum ada pelanggan'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery
                      ? 'Coba gunakan kata kunci lain'
                      : 'Tekan tombol "Tambah" untuk menambahkan pelanggan pertama'}
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
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
  backBtn: {
    padding: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
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
  statsRow: {
    marginBottom: 12,
  },
  statBox: {
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 20,
  },
  customerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
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
  cardInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  customerPhone: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  customerEmail: {
    fontSize: 12,
    color: '#94a3b8',
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
    fontSize: 12,
    fontWeight: 'bold',
    color: '#a16207',
  },
  addressText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    paddingLeft: 56,
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  dateText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnEdit: {
    padding: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  actionBtnDelete: {
    padding: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },

  // Form styles
  formContainer: {
    flex: 1,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  formInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  formInputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  formInputIconed: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
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

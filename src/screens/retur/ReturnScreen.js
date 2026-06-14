import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput, 
  ActivityIndicator, ScrollView, Alert, Platform
} from 'react-native';
import { Search, ScrollText, ArrowLeft, RefreshCw, FileText, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { FlashList } from "@shopify/flash-list";
import { formatRp, formatDate } from '../../utils/format';
import { ReturnService } from '../../services/ReturnService';

const ReturnScreen = ({ onSelectSale, navigation }) => {
  const [loading, setLoading] = useState(false);
  const [returns, setReturns] = useState([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list'); // 'list' or 'history'

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await ReturnService.getReturnsLocal();
      setReturns(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>Retur Penjualan</Text>
        <TouchableOpacity onPress={loadHistory}>
          <RefreshCw size={20} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity 
          style={[styles.tab, view === 'list' && styles.activeTab]} 
          onPress={() => setView('list')}
        >
          <Text style={[styles.tabText, view === 'list' && styles.activeTabText]}>Pilih Transaksi</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, view === 'history' && styles.activeTab]} 
          onPress={() => setView('history')}
        >
          <Text style={[styles.tabText, view === 'history' && styles.activeTabText]}>Riwayat Retur</Text>
        </TouchableOpacity>
      </View>

      {view === 'list' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Pilih transaksi dari menu "Riwayat" lalu klik tombol "Retur" untuk memulai proses pengembalian barang.
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Riwayat')}
          >
            <ScrollText size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Buka Riwayat Penjualan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlashList
            data={returns}
            keyExtractor={(item) => String(item.id)}
            estimatedItemSize={80}
            renderItem={({ item }) => (
              <View style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.invoice}>{item.invoice_number}</Text>
                  <View style={[styles.badge, { backgroundColor: item.synced ? '#dcfce7' : '#fef9c7' }]}>
                    <Text style={[styles.badgeText, { color: item.synced ? '#15803d' : '#a16207' }]}>
                      {item.synced ? 'Synced' : 'Waiting'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                <Text style={styles.reason}>Alasan: {item.reason}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.refundLabel}>Total Refund:</Text>
                  <Text style={styles.refundValue}>{formatRp(item.total_refund)}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <FileText size={48} color="#cbd5e1" />
                <Text style={styles.emptyText}>Belum ada riwayat retur</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0'
  },
  title: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  activeTab: { borderColor: '#3b82f6' },
  tabText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  activeTabText: { color: '#3b82f6' },
  infoBox: { margin: 16, padding: 16, backgroundColor: '#eff6ff', borderRadius: 12, borderLeftWidth: 4, borderColor: '#3b82f6' },
  infoText: { fontSize: 14, color: '#1e40af', lineHeight: 20 },
  actionBtn: { 
    marginHorizontal: 16, 
    backgroundColor: '#3b82f6', 
    padding: 16, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 10
  },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  historyCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, padding: 16, borderRadius: 12, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  invoice: { fontWeight: 'bold', fontSize: 15, color: '#0f172a' },
  date: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  reason: { fontSize: 13, color: '#334155', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderColor: '#f1f5f9' },
  refundLabel: { fontSize: 13, color: '#64748b' },
  refundValue: { fontSize: 15, fontWeight: 'bold', color: '#ef4444' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 12, color: '#94a3b8', fontSize: 14 }
});

export default ReturnScreen;

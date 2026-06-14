import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { api } from '../services/api';
import { formatRp, formatNumber } from '../utils/format';
import { useAuthStore } from '../stores/authStore';
import { BarChart3, TrendUp, Wallet, CalendarDays, ArrowLeft, RefreshCw } from 'lucide-react-native';

const DATE_PRESETS = [
  { key: 'today', label: 'Hari Ini' },
  { key: 'yesterday', label: 'Kemarin' },
  { key: 'custom', label: 'Custom' },
];

const PAYMENT_COLORS = {
  TUNAI: '#22c55e',
  CASH: '#22c55e',
  QRIS: '#8b5cf6',
  DEBIT: '#3b82f6',
  KREDIT: '#f59e0b',
  TRANSFER: '#06b6d4',
};

export default function DailySalesRecapScreen({ selectedBranch, navigation }) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [datePreset, setDatePreset] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [summary, setSummary] = useState(null);
  const [paymentBreakdown, setPaymentBreakdown] = useState([]);

  const formatDateParam = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  };

  const getDateRange = useCallback(() => {
    const now = new Date();
    const today = formatDateParam(now);

    if (datePreset === 'today') {
      return { start_date: today, end_date: today };
    }

    if (datePreset === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const y = formatDateParam(yesterday);
      return { start_date: y, end_date: y };
    }

    if (datePreset === 'custom') {
      return {
        start_date: customStartDate || today,
        end_date: customEndDate || today,
      };
    }

    return { start_date: today, end_date: today };
  }, [datePreset, customStartDate, customEndDate]);

  const fetchRecap = useCallback(async () => {
    try {
      setError(null);
      const { start_date, end_date } = getDateRange();
      const branchId = selectedBranch?.id || user?.branch_id || 1;

      const response = await api.get('/api/v1/sales/daily-recap', {
        params: {
          start_date,
          end_date,
          branch_id: branchId,
        },
      });

      const data = response.data?.data || response.data || {};
      setSummary({
        total_sales: data.total_sales ?? data.total ?? 0,
        total_transactions: data.total_transactions ?? data.count ?? 0,
        average_transaction: data.average_transaction ?? data.average ?? 0,
      });
      setPaymentBreakdown(data.payment_breakdown || data.payments || []);
    } catch (err) {
      console.error('DailySalesRecap fetch error:', err);
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Gagal memuat rekap penjualan harian';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getDateRange, selectedBranch, user]);

  useEffect(() => {
    fetchRecap();
  }, [fetchRecap]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecap();
  };

  const handlePresetChange = (key) => {
    setDatePreset(key);
    if (key === 'custom') {
      setShowCustomModal(true);
    } else {
      setLoading(true);
      setRefreshing(false);
      // Re-fetch will happen via useEffect due to getDateRange dependency change
    }
  };

  const handleCustomSubmit = () => {
    setShowCustomModal(false);
    setLoading(true);
    // Re-fetch will happen via useEffect
  };

  const totalSales = summary?.total_sales ?? 0;
  const totalTransactions = summary?.total_transactions ?? 0;
  const averageTransaction = summary?.average_transaction ?? 0;
  const breakdownData = paymentBreakdown || [];

  return (
    <View style={styles.container}>
      {/* Custom Date Modal */}
      <Modal visible={showCustomModal} animationType="fade" transparent onRequestClose={() => setShowCustomModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pilih Rentang Tanggal</Text>
            <Text style={styles.modalLabel}>Tanggal Mulai (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="2025-01-01"
              placeholderTextColor="#64748b"
              value={customStartDate}
              onChangeText={setCustomStartDate}
              autoCapitalize="none"
            />
            <Text style={styles.modalLabel}>Tanggal Akhir (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="2025-01-31"
              placeholderTextColor="#64748b"
              value={customEndDate}
              onChangeText={setCustomEndDate}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowCustomModal(false);
                  setDatePreset('today');
                }}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleCustomSubmit}>
                <Text style={styles.modalSubmitText}>Terapkan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        {navigation?.goBack && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
        )}
        <View>
          <Text style={styles.headerTitle}>Rekap Penjualan Harian</Text>
          <Text style={styles.headerSubtitle}>
            {datePreset === 'today'
              ? 'Hari Ini'
              : datePreset === 'yesterday'
              ? 'Kemarin'
              : `${customStartDate || '?'} — ${customEndDate || '?'}`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerRefreshBtn}
          onPress={() => {
            setLoading(true);
            fetchRecap();
          }}
        >
          <RefreshCw color="#fff" size={20} />
        </TouchableOpacity>
      </View>

      {/* Date Filter */}
      <View style={styles.filterRow}>
        {DATE_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.key}
            onPress={() => handlePresetChange(preset.key)}
            style={[styles.filterBtn, datePreset === preset.key && styles.activeFilterBtn]}
          >
            <CalendarDays
              size={14}
              color={datePreset === preset.key ? '#fff' : '#94a3b8'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.filterBtnText, datePreset === preset.key && styles.activeFilterBtnText]}>
              {preset.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Memuat rekap penjualan...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <BarChart3 size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              fetchRecap();
            }}
          >
            <RefreshCw color="#fff" size={16} />
            <Text style={styles.retryBtnText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2563eb"
              colors={['#2563eb']}
            />
          }
        >
          {/* Summary Cards */}
          <Text style={styles.sectionTitle}>Ringkasan Penjualan</Text>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: '#1e40af' }]}>
              <TrendUp color="#93c5fd" size={24} />
              <Text style={styles.summaryValue}>{formatRp(totalSales)}</Text>
              <Text style={styles.summaryLabel}>Total Penjualan</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#15803d' }]}>
              <BarChart3 color="#bbf7d0" size={24} />
              <Text style={styles.summaryValue}>{formatNumber(totalTransactions)}</Text>
              <Text style={styles.summaryLabel}>Total Transaksi</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: '#854d0e' }]}>
              <TrendUp color="#fde68a" size={24} />
              <Text style={styles.summaryValue}>{formatRp(averageTransaction)}</Text>
              <Text style={styles.summaryLabel}>Rata-rata Transaksi</Text>
            </View>
          </View>

          {/* Payment Method Breakdown */}
          <Text style={styles.sectionTitle}>Breakdown Metode Bayar</Text>
          {breakdownData.length === 0 ? (
            <View style={styles.emptyBreakdown}>
              <Wallet size={32} color="#475569" />
              <Text style={styles.emptyBreakdownText}>Belum ada data pembayaran</Text>
            </View>
          ) : (
            <View style={styles.breakdownContainer}>
              {breakdownData.map((pmt, index) => {
                const methodName = pmt.method || pmt.payment_method || pmt.name || `Metode ${index + 1}`;
                const amount = pmt.amount ?? pmt.total ?? 0;
                const count = pmt.count ?? pmt.transaction_count ?? 0;
                const percentage = pmt.percentage ?? 0;
                const methodKey = methodName.toUpperCase();
                const color = PAYMENT_COLORS[methodKey] || '#3b82f6';

                return (
                  <View key={index} style={styles.paymentItem}>
                    <View style={styles.paymentHeader}>
                      <View style={styles.paymentMethodInfo}>
                        <View style={[styles.paymentDot, { backgroundColor: color }]} />
                        <Text style={styles.paymentMethodName}>{methodName}</Text>
                      </View>
                      <Text style={styles.paymentAmount}>{formatRp(amount)}</Text>
                    </View>
                    <View style={styles.paymentDetails}>
                      <Text style={styles.paymentCount}>{count} transaksi</Text>
                      <Text style={styles.paymentPercentage}>{percentage.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${Math.min(percentage, 100)}%`, backgroundColor: color },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  headerRefreshBtn: {
    marginLeft: 'auto',
    padding: 8,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  filterRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#334155',
    justifyContent: 'center',
  },
  activeFilterBtn: {
    backgroundColor: '#2563eb',
  },
  filterBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  activeFilterBtnText: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 10,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 4,
    fontWeight: '500',
  },
  breakdownContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paymentItem: {
    marginBottom: 16,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  paymentMethodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  paymentMethodName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  paymentDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  paymentCount: {
    fontSize: 11,
    color: '#94a3b8',
  },
  paymentPercentage: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyBreakdown: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyBreakdownText: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#f8fafc',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  modalCancelText: {
    color: '#94a3b8',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  modalSubmitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

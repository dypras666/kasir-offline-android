import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { toast } from 'sonner-native';
import { ShiftService } from '../../services/ShiftService';

export default function CloseShiftScreen({ onShiftClosed, onCancel }) {
  const [actualCash, setActualCash] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const data = await ShiftService.getCurrentShiftSummary();
      setSummary(data);
    } catch (error) {
      toast.error('Gagal mengambil ringkasan shift');
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleCloseShift = async () => {
    if (!actualCash.trim()) {
      toast.error('Uang fisik di laci harus diisi');
      return;
    }
    
    const amount = parseFloat(actualCash);
    if (isNaN(amount) || amount < 0) {
      toast.error('Jumlah tidak valid');
      return;
    }

    setLoading(true);
    try {
      await ShiftService.closeShift({
        actual_cash: amount,
      });
      toast.success('Shift berhasil ditutup');
      if (onShiftClosed) onShiftClosed();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Gagal menutup shift');
    } finally {
      setLoading(false);
    }
  };

  if (loadingSummary) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Tutup Shift</Text>

      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Ringkasan Sistem</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Kas Awal</Text>
            <Text style={styles.rowValue}>Rp {summary.initial_cash?.toLocaleString('id-ID')}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total Penjualan Tunai</Text>
            <Text style={styles.rowValue}>Rp {summary.total_cash_sales?.toLocaleString('id-ID')}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total Penjualan Non-Tunai</Text>
            <Text style={styles.rowValue}>Rp {summary.total_non_cash_sales?.toLocaleString('id-ID')}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabelBold}>Ekspektasi Kas Laci</Text>
            <Text style={styles.rowValueBold}>Rp {summary.expected_cash?.toLocaleString('id-ID')}</Text>
          </View>
        </View>
      )}

      <View style={styles.form}>
        <Text style={styles.label}>Uang Fisik Aktual di Laci (Rp) *</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="#94a3b8"
          value={actualCash}
          onChangeText={setActualCash}
        />
        
        {actualCash !== '' && summary && (
          <Text style={[
            styles.differenceText,
            (parseFloat(actualCash) - summary.expected_cash) < 0 ? styles.textRed : styles.textGreen
          ]}>
            Selisih: Rp {(parseFloat(actualCash) - summary.expected_cash).toLocaleString('id-ID')}
          </Text>
        )}
        
        <View style={styles.buttonContainer}>
          {onCancel && (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.submitBtn} onPress={handleCloseShift} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Tutup Shift</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    maxHeight: '90%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  summaryTitle: {
    color: '#94a3b8',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rowLabel: {
    color: '#cbd5e1',
  },
  rowValue: {
    color: '#fff',
  },
  rowLabelBold: {
    color: '#fff',
    fontWeight: 'bold',
  },
  rowValueBold: {
    color: '#22c55e',
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  form: {
    gap: 16,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  input: {
    backgroundColor: '#0f172a',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 16,
  },
  differenceText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  textRed: {
    color: '#ef4444',
  },
  textGreen: {
    color: '#22c55e',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  submitBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

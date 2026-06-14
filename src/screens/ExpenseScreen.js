import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform
} from 'react-native';
import { toast } from 'sonner-native';
import { ExpenseService } from '../services/ExpenseService';
import { useAuthStore } from '../stores/authStore';
import { ArrowLeft } from 'lucide-react-native';

const CATEGORIES = [
  { label: 'Listrik', value: 'listrik' },
  { label: 'Air', value: 'air' },
  { label: 'Internet', value: 'internet' },
  { label: 'Transport', value: 'transport' },
  { label: 'Gaji', value: 'gaji' },
  { label: 'Maintenance', value: 'maintenance' },
  { label: 'Lainnya', value: 'lainnya' }
];

export default function ExpenseScreen({ navigation, selectedBranch }) {
  const { user } = useAuthStore();
  const [judul, setJudul] = useState('');
  const [amount, setAmount] = useState('');
  const [kategori, setKategori] = useState('listrik');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [keterangan, setKeterangan] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const handleSubmit = async () => {
    if (!judul.trim()) {
      toast.error('Judul harus diisi');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Jumlah biaya harus lebih besar dari 0');
      return;
    }
    if (!tanggal.trim()) {
      toast.error('Tanggal harus diisi');
      return;
    }

    const branchId = selectedBranch?.id || user?.branch_id || 1;

    setLoading(true);
    try {
      await ExpenseService.createExpense({
        judul: judul.trim(),
        amount: numAmount,
        kategori,
        tanggal,
        keterangan: keterangan.trim(),
        branch_id: branchId
      });
      toast.success('Biaya operasional berhasil disimpan!');
      setJudul('');
      setAmount('');
      setKategori('listrik');
      setKeterangan('');
      // Navigate to History if inside navigation stack
      if (navigation) {
        navigation.navigate('ExpenseHistory');
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Gagal menyimpan biaya operasional');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        {navigation && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Input Biaya Operasional</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Judul *</Text>
        <TextInput
          style={styles.input}
          placeholder="Masukkan judul biaya"
          placeholderTextColor="#94a3b8"
          value={judul}
          onChangeText={setJudul}
        />

        <Text style={styles.label}>Jumlah Biaya (Rupiah) *</Text>
        <TextInput
          style={styles.input}
          placeholder="Contoh: 150000"
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        <Text style={styles.label}>Kategori *</Text>
        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowPicker(!showPicker)}>
          <Text style={styles.pickerButtonText}>
            {CATEGORIES.find(c => c.value === kategori)?.label || 'Pilih Kategori'}
          </Text>
        </TouchableOpacity>

        {showPicker && (
          <View style={styles.pickerDropdown}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.pickerItem,
                  kategori === cat.value && styles.pickerItemActive
                ]}
                onPress={() => {
                  setKategori(cat.value);
                  setShowPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    kategori === cat.value && styles.pickerItemTextActive
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Tanggal (YYYY-MM-DD) *</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#94a3b8"
          value={tanggal}
          onChangeText={setTanggal}
        />

        <Text style={styles.label}>Keterangan (Optional)</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Keterangan tambahan..."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={4}
          value={keterangan}
          onChangeText={setKeterangan}
        />

        <Text style={styles.branchText}>
          Cabang: {selectedBranch?.name || user?.branch?.name || `Cabang ID: ${selectedBranch?.id || user?.branch_id || 1}`}
        </Text>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Simpan Biaya</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: Platform.OS === 'ios' ? 40 : 10,
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  form: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerButton: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  pickerDropdown: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    padding: 4,
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  pickerItemActive: {
    backgroundColor: '#2563eb',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#94a3b8',
  },
  pickerItemTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  branchText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 16,
    fontStyle: 'italic',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    backgroundColor: '#1e3a8a',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});

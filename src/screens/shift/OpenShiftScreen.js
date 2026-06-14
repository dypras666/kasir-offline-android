import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { toast } from 'sonner-native';
import { ShiftService } from '../../services/ShiftService';
import { useAuthStore } from '../../stores/authStore';

export default function OpenShiftScreen({ onShiftOpened, onCancel }) {
  const [initialCash, setInitialCash] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const handleOpenShift = async () => {
    if (!initialCash.trim()) {
      toast.error('Kas awal harus diisi');
      return;
    }
    
    const amount = parseFloat(initialCash);
    if (isNaN(amount) || amount < 0) {
      toast.error('Kas awal tidak valid');
      return;
    }

    setLoading(true);
    try {
      const response = await ShiftService.openShift({
        initial_cash: amount,
        branch_id: user?.branch_id || 1,
      });
      toast.success('Shift berhasil dibuka');
      if (onShiftOpened) onShiftOpened(response);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Gagal membuka shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Buka Shift Kasir</Text>
      
      <View style={styles.form}>
        <Text style={styles.label}>Kas Awal di Laci (Rp)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor="#94a3b8"
          value={initialCash}
          onChangeText={setInitialCash}
        />
        
        <View style={styles.buttonContainer}>
          {onCancel && (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.submitBtn} onPress={handleOpenShift} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Buka Shift</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#1e293b',
    borderRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
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
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

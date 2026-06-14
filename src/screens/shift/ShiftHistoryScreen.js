import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { ShiftService } from '../../services/ShiftService';
import { ArrowLeft } from 'lucide-react-native';

export default function ShiftHistoryScreen({ navigation }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const data = await ShiftService.getShiftHistory();
      setShifts(data?.data || data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.dateText}>{new Date(item.start_time).toLocaleString('id-ID')}</Text>
        <Text style={[styles.statusBadge, item.status === 'open' ? styles.statusOpen : styles.statusClosed]}>
          {item.status.toUpperCase()}
        </Text>
      </View>
      
      <View style={styles.dataRow}>
        <Text style={styles.label}>Kas Awal:</Text>
        <Text style={styles.value}>Rp {item.initial_cash?.toLocaleString('id-ID')}</Text>
      </View>
      
      {item.status === 'closed' && (
        <>
          <View style={styles.dataRow}>
            <Text style={styles.label}>Waktu Tutup:</Text>
            <Text style={styles.value}>{new Date(item.end_time).toLocaleString('id-ID')}</Text>
          </View>
          <View style={styles.dataRow}>
            <Text style={styles.label}>Kas Aktual (Fisik):</Text>
            <Text style={styles.value}>Rp {item.actual_cash?.toLocaleString('id-ID')}</Text>
          </View>
          <View style={styles.dataRow}>
            <Text style={styles.label}>Selisih:</Text>
            <Text style={[styles.value, item.difference < 0 ? styles.textRed : styles.textGreen]}>
              Rp {item.difference?.toLocaleString('id-ID')}
            </Text>
          </View>
        </>
      )}
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
        <Text style={styles.title}>Riwayat Shift</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : shifts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Belum ada riwayat shift.</Text>
        </View>
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
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
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusOpen: {
    backgroundColor: '#bbf7d0',
    color: '#166534',
  },
  statusClosed: {
    backgroundColor: '#cbd5e1',
    color: '#334155',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    color: '#94a3b8',
  },
  value: {
    color: '#fff',
    fontWeight: '500',
  },
  textRed: {
    color: '#ef4444',
  },
  textGreen: {
    color: '#22c55e',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 16,
  },
});

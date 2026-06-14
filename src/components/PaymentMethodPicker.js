import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { CreditCard, Banknote, QrCode, X, Check } from 'lucide-react-native';
import { Storage } from '../services/api';

/**
 * PaymentMethodPicker — Component to select payment method for checkout
 * 
 * Props:
 * - visible: boolean, modal visible
 * - onSelect: (method) => void, callback when method selected
 * - onClose: () => void, callback when modal closed
 * - selectedMethodId: string | null, currently selected ID
 */
export default function PaymentMethodPicker({ visible, onSelect, onClose, selectedMethodId }) {
  const [methods, setMethods] = useState([
    { id: 'CASH', name: 'Tunai', icon: 'cash' },
    { id: 'QRIS', name: 'QRIS', icon: 'qr' },
    { id: 'TRANSFER', name: 'Transfer Bank', icon: 'bank' },
    { id: 'CARD', name: 'Debit / Kredit', icon: 'card' },
  ]);

  const handleSelect = (method) => {
    if (onSelect) onSelect(method);
    if (onClose) onClose();
  };

  const getIcon = (type, color) => {
    switch (type) {
      case 'cash': return <Banknote size={24} color={color} />;
      case 'qr': return <QrCode size={24} color={color} />;
      case 'card': return <CreditCard size={24} color={color} />;
      default: return <CreditCard size={24} color={color} />;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Pilih Metode Pembayaran</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={methods}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isSelected = item.id === selectedMethodId;
              return (
                <TouchableOpacity
                  style={[styles.methodCard, isSelected && styles.methodCardSelected]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, isSelected && styles.iconBoxSelected]}>
                    {getIcon(item.icon, isSelected ? '#fff' : '#3b82f6')}
                  </View>
                  <Text style={[styles.methodName, isSelected && styles.methodNameSelected]}>
                    {item.name}
                  </Text>
                  {isSelected && (
                    <View style={styles.checkIcon}>
                      <Check size={18} color="#3b82f6" strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 4,
  },
  listContent: {
    paddingBottom: 10,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  methodCardSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconBoxSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  methodName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  methodNameSelected: {
    color: '#1e40af',
  },
  checkIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

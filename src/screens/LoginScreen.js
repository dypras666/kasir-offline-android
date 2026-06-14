import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Eye, EyeOff, RefreshCw } from 'lucide-react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { toast } from 'sonner-native';
import { login, Storage } from '../services/api';
import { useAuthStore } from '../stores/authStore';

const ITEMS_PER_PAGE = 5;

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localServerIp, setLocalServerIp] = useState('192.168.1.18:8085');
  const [localServerName, setLocalServerName] = useState('');
  const [serverMode, setServerMode] = useState('local');
  const [serverConnected, setServerConnected] = useState(false);

  // Search & pagination for server list (demo history)
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadSavedConfig();
  }, []);

  const loadSavedConfig = async () => {
    try {
      const savedIp = await Storage.getItemAsync('local_server_ip');
      const savedName = await Storage.getItemAsync('local_server_name');
      const savedMode = await Storage.getItemAsync('server_mode');
      const savedEmail = await Storage.getItemAsync('user_email');
      const savedPass = await Storage.getItemAsync('user_pass');

      if (savedIp) setLocalServerIp(savedIp);
      if (savedName) {
        setLocalServerName(savedName);
        setServerConnected(true);
      }
      if (savedMode) setServerMode(savedMode);
      if (savedEmail) setEmail(savedEmail);
      if (savedPass) setPassword(savedPass);
    } catch (e) {
      console.warn('Load config failed:', e);
    }
  };

  const testLocalConnection = async (ip) => {
    if (!ip || !ip.trim()) {
      toast.error('Masukkan IP Server Lokal.');
      return;
    }
    setLoading(true);
    let cleanIp = ip.replace(/^(http:\/\/|https:\/\/)/, '').replace(/\/$/, '');
    try {
      const resp = await axios.get(`http://${cleanIp}/api/v1/info`, { timeout: 5000 });
      if (resp.data && resp.data.server) {
        setLocalServerName(resp.data.server);
        setServerConnected(true);
        await Storage.setItemAsync('local_server_name', resp.data.server);
        await Storage.setItemAsync('server_mode', 'local');
        toast.success(`Terhubung ke: ${resp.data.server}`);
      } else {
        setServerConnected(false);
        toast.error('Format data dari server salah.');
      }
    } catch (e) {
      console.error(e);
      setServerConnected(false);
      toast.error('Tidak dapat terhubung. Pastikan IP benar dan satu WiFi.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async () => {
    if (!email || !password) {
      toast.error('Email dan password wajib diisi.');
      return;
    }
    if (serverMode === 'local' && !localServerIp) {
      toast.error('IP Server Lokal belum diisi.');
      return;
    }

    setLoading(true);
    try {
      const data = await login(email, password);
      // Handle null safety: ensure data has token and user
      const token = data?.token || data?.data?.token || '';
      const user = data?.user || data?.data?.user || null;
      if (!token) {
        toast.error('Token tidak ditemukan dalam response server.');
        return;
      }
      
      const setAuth = useAuthStore.getState().setAuth;
      await setAuth(user, token, email, password);
      
      toast.success('Login berhasil!');
      if (onLoginSuccess) {
        onLoginSuccess(user, token);
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Login gagal. Periksa koneksi atau kredensial Anda.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Mock server history for list demo (including nomor urut / search / pagination)
  const serverHistory = useMemo(() => {
    // Empty demo data for pagination demo
    return [];
  }, []);

  const filteredHistory = useMemo(() => {
    if (!searchQuery) return serverHistory;
    const q = searchQuery.toLowerCase();
    return serverHistory.filter(
      (item) =>
        (item.ip || '').toLowerCase().includes(q) ||
        (item.name || '').toLowerCase().includes(q)
    );
  }, [serverHistory, searchQuery]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredHistory.length / ITEMS_PER_PAGE));
  }, [filteredHistory.length]);

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredHistory.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredHistory, currentPage]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Image
          source={
            Platform.OS === 'web'
              ? { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=' }
              : require('../../assets/icon.png')
          }
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.title}>KasirQu</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Mode Koneksi Server</Text>
          <View style={styles.modeContainer}>
            <TouchableOpacity
              style={[styles.modeBtn, serverMode === 'local' && styles.activeModeBtn]}
              onPress={async () => {
                setServerMode('local');
                await Storage.setItemAsync('server_mode', 'local');
              }}
            >
              <Text style={[styles.modeBtnText, serverMode === 'local' && styles.activeModeBtnText]}>
                Lokal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, serverMode === 'cloud' && styles.activeModeBtn]}
              onPress={async () => {
                setServerMode('cloud');
                await Storage.setItemAsync('server_mode', 'cloud');
              }}
            >
              <Text style={[styles.modeBtnText, serverMode === 'cloud' && styles.activeModeBtnText]}>
                Cloud
              </Text>
            </TouchableOpacity>
          </View>

          {serverMode === 'local' && (
            <View style={{ marginBottom: 15 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="IP Server:Port (mis: 192.168.1.18:8085)"
                  placeholderTextColor="#94a3b8"
                  value={localServerIp}
                  onChangeText={(val) => {
                    setLocalServerIp(val);
                    setServerConnected(false);
                    Storage.setItemAsync('local_server_ip', val);
                  }}
                />
                <TouchableOpacity
                  style={styles.testBtn}
                  onPress={() => testLocalConnection(localServerIp)}
                >
                  <RefreshCw color="#fff" size={16} />
                </TouchableOpacity>
              </View>
              {localServerName ? (
                <Text style={styles.serverConnected}>Terhubung ke: {localServerName}</Text>
              ) : null}
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#94a3b8"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
              {showPassword ? <EyeOff color="#94a3b8" size={20} /> : <Eye color="#94a3b8" size={20} />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleLoginSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>MASUK</Text>}
          </TouchableOpacity>

          {/* Search input for demo history (null safety, search, pagination, nomor urut demo) */}
          <View style={styles.searchSection}>
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Cari server tersimpan..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Server history list with pagination */}
          {paginatedHistory.length > 0 && (
            <>
              <View style={styles.listHeader}>
                <Text style={[styles.listHeaderCell, { width: 30 }]}>#</Text>
                <Text style={[styles.listHeaderCell, { flex: 1 }]}>IP Server</Text>
                <Text style={[styles.listHeaderCell, { flex: 1 }]}>Nama</Text>
              </View>
              {paginatedHistory.map((item, index) => {
                const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                return (
                  <TouchableOpacity
                    key={item.ip || index}
                    style={styles.listRow}
                    onPress={() => setLocalServerIp(item.ip)}
                  >
                    <Text style={[styles.listCell, { width: 30, color: '#94a3b8', textAlign: 'center' }]}>
                      {globalIdx}
                    </Text>
                    <Text style={[styles.listCell, { flex: 1 }]} numberOfLines={1}>
                      {item.ip || '-'}
                    </Text>
                    <Text style={[styles.listCell, { flex: 1 }]} numberOfLines={1}>
                      {item.name || '-'}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <View style={styles.paginationRow}>
                  <TouchableOpacity
                    disabled={currentPage === 1}
                    onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
                  >
                    <Text style={[styles.pageBtnText, currentPage === 1 && styles.pageBtnTextDisabled]}>
                      {'<'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.pageInfo}>
                    {currentPage} / {totalPages}
                  </Text>
                  <TouchableOpacity
                    disabled={currentPage === totalPages}
                    onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
                  >
                    <Text style={[styles.pageBtnText, currentPage === totalPages && styles.pageBtnTextDisabled]}>
                      {'>'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {filteredHistory.length === 0 && searchQuery ? (
            <Text style={styles.noDataText}>Tidak ada server ditemukan</Text>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { width: 100, height: 100, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 32 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, elevation: 4 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  modeContainer: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 10, padding: 4, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  activeModeBtn: { backgroundColor: '#3b82f6' },
  modeBtnText: { color: '#94a3b8', fontWeight: 'bold', fontSize: 13 },
  activeModeBtnText: { color: '#fff' },
  testBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, marginLeft: 10 },
  serverConnected: { color: '#22c55e', fontSize: 12, marginTop: 6, marginLeft: 4, fontWeight: '600' },
  input: { backgroundColor: '#0f172a', color: '#fff', padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 14 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 10, marginBottom: 24 },
  passwordInput: { flex: 1, color: '#fff', padding: 14, fontSize: 14 },
  eyeIcon: { padding: 14 },
  btn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  searchSection: { marginTop: 16 },
  searchBar: { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 12 },
  searchInput: { color: '#fff', paddingVertical: 10, fontSize: 13 },
  listHeader: { flexDirection: 'row', backgroundColor: '#334155', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 6, marginTop: 12 },
  listHeaderCell: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8' },
  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingVertical: 10, paddingHorizontal: 6, borderRadius: 6, marginTop: 4 },
  listCell: { fontSize: 12, color: '#cbd5e1' },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 16 },
  pageBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#334155' },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  pageBtnTextDisabled: { color: '#64748b' },
  pageInfo: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  noDataText: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 12 },
});

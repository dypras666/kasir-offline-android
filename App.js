import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, ActivityIndicator, Dimensions, Animated, Platform
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { FlashList } from "@shopify/flash-list";
import { Image } from 'expo-image';
import axios from 'axios';
import { ShoppingCart, Package, RefreshCw, LogOut, Search, Eye, EyeOff, LayoutDashboard, Settings, User, Printer, Bluetooth, Trash2, CheckCircle } from 'lucide-react-native';

// Mock printer for web
const PrintersDiscovery = Platform.OS === 'web' ? { 
  on: () => {}, 
  start: () => {}, 
  stop: () => {} 
} : require('react-native-esc-pos-printer').PrintersDiscovery;

const PrintModule = Platform.OS === 'web' ? {
  init: () => {},
  print: () => {}
} : require('react-native-esc-pos-printer').Printer;

import * as Location from 'expo-location';

// Universal storage: SecureStore for native, localStorage for web
const Storage = Platform.OS === 'web' ? {
  getItemAsync: async (key) => localStorage.getItem(key),
  setItemAsync: async (key, val) => localStorage.setItem(key, String(val)),
  deleteItemAsync: async (key) => localStorage.removeItem(key),
} : SecureStore;

// Handle DB sync safely for web
let db;
try {
  db = SQLite.openDatabaseSync('kasir_offline_v2.db');
} catch (e) {
  console.warn("SQLite Sync failed, falling back to mock/async", e);
  db = { execSync: () => {}, getAllSync: () => [], runSync: () => ({ lastInsertRowId: 0, changes: 0 }), getFirstSync: () => ({}), withTransactionSync: (fn) => fn() };
}
const { width } = Dimensions.get('window');

const API_URL = 'https://crm.azzr.biz.id';

// Memoized Item Component for performance
const ProductItem = React.memo(({ item, onPress, isKasir }) => (
  <TouchableOpacity 
    style={styles.productCard} 
    onPress={() => isKasir ? onPress(item) : null} 
    disabled={!isKasir}
  >
    <View style={styles.pInfo}>
      <Text style={styles.pName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.pPrice}>Rp {item.sell_price.toLocaleString()}</Text>
    </View>
    <View style={styles.pRight}>
      <Text style={styles.pStock}>Stok: {item.stock}</Text>
      <Text style={styles.pUnit}>{item.unit}</Text>
    </View>
  </TouchableOpacity>
));

const TransferItem = React.memo(({ item, onAccept, userRole }) => (
  <TouchableOpacity 
    style={styles.productCard} 
    onPress={() => {
      if (item.status === 'pending') {
        if (userRole === 'Kasir Cabang') {
          Alert.alert('Akses Ditolak', 'Hanya Admin Cabang yang dapat menerima barang.');
          return;
        }
        Alert.alert(
          'Konfirmasi', 
          'Terima barang ini?', 
          [{ text: 'Batal' }, { text: 'Ya', onPress: () => onAccept(item.id) }]
        );
      }
    }}
  >
    <View style={styles.pInfo}>
      <Text style={styles.pName} numberOfLines={1}>{item.from_name} ➔ {item.to_name}</Text>
      <Text style={styles.pPrice}>{item.transfer_date}</Text>
    </View>
    <View style={styles.pRight}>
      <Text style={[styles.pStock, { color: item.status === 'completed' ? '#22c55e' : '#eab308' }]}>
        {item.status.toUpperCase()}
      </Text>
    </View>
  </TouchableOpacity>
));

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [serverMode, setServerMode] = useState('cloud'); // 'cloud' or 'local'
  const [localServerIp, setLocalServerIp] = useState('');
  const [localServerName, setLocalServerName] = useState('');
  const [serverConnected, setServerConnected] = useState(false);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncTime, setSyncTime] = useState(null);
  const [printerSize, setPrinterSize] = useState('58'); // 58 or 80
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Struk settings
  const [storeName, setStoreName] = useState('NAMA CABANG');
  const [storeContact, setStoreContact] = useState('08123456789');
  const [storeFooter, setStoreFooter] = useState('Terima kasih atas kunjungan Anda');
  
  const [products, setProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [transferFilter, setTransferFilter] = useState('pending'); // pending, completed, all
  const [transferSource, setTransferSource] = useState('all'); // all, or source name
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateFilter, setDateFilter] = useState('today');
  const [omset, setOmset] = useState(0);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const splashOpacity = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    initDB();
    checkSavedLogin();
    
    // Splash screen timer
    setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => setIsSplashVisible(false));
    }, 2000);
  }, []);

  const checkSavedLogin = async () => {
    let savedEmail, savedPass, savedSync, savedPrinter, savedPrinterData, savedStoreName, savedStoreContact, savedStoreFooter, savedMode, savedIp, savedServerName;
    
    if (Platform.OS === 'web') {
      savedEmail = localStorage.getItem('user_email');
      savedPass = localStorage.getItem('user_pass');
      savedSync = localStorage.getItem('last_sync');
      savedPrinter = localStorage.getItem('printer_size');
      savedPrinterData = localStorage.getItem('selected_printer');
      savedStoreName = localStorage.getItem('store_name');
      savedStoreContact = localStorage.getItem('store_contact');
      savedStoreFooter = localStorage.getItem('store_footer');
      savedMode = localStorage.getItem('server_mode');
      savedIp = localStorage.getItem('local_server_ip');
      savedServerName = localStorage.getItem('local_server_name');
    } else {
      savedEmail = await SecureStore.getItemAsync('user_email');
      savedPass = await SecureStore.getItemAsync('user_pass');
      savedSync = await SecureStore.getItemAsync('last_sync');
      savedPrinter = await SecureStore.getItemAsync('printer_size');
      savedPrinterData = await SecureStore.getItemAsync('selected_printer');
      savedStoreName = await SecureStore.getItemAsync('store_name');
      savedStoreContact = await SecureStore.getItemAsync('store_contact');
      savedStoreFooter = await SecureStore.getItemAsync('store_footer');
      savedMode = await SecureStore.getItemAsync('server_mode');
      savedIp = await SecureStore.getItemAsync('local_server_ip');
      savedServerName = await SecureStore.getItemAsync('local_server_name');
    }

    if (savedMode) {
      setServerMode(savedMode);
      if (savedMode === 'cloud') setServerConnected(true);
    } else {
      setServerConnected(true); // Default cloud is connected
    }

    if (savedIp) setLocalServerIp(savedIp);
    if (savedServerName) {
      setLocalServerName(savedServerName);
      setServerConnected(true);
    }

    if (savedSync) setSyncTime(savedSync);
    if (savedPrinter) setPrinterSize(savedPrinter);
    if (savedPrinterData) setSelectedPrinter(JSON.parse(savedPrinterData));
    if (savedStoreName) setStoreName(savedStoreName);
    if (savedStoreContact) setStoreContact(savedStoreContact);
    if (savedStoreFooter) setStoreFooter(savedStoreFooter);
    
    if (savedEmail && savedPass) {
      setEmail(savedEmail);
      setPassword(savedPass);
    }
  };

  const getBaseUrl = () => {
    return serverMode === 'local' ? `http://${localServerIp}` : API_URL;
  };

  const testLocalConnection = async (ip) => {
    if (!ip) {
      Alert.alert('Error', 'Masukkan IP Server Lokal.');
      return;
    }
    setLoading(true);
    // Remove protocol and slashes if present to ensure clean input
    let cleanIp = ip.replace(/^(http:\/\/|https:\/\/)/, '').replace(/\/$/, '');
    try {
      const resp = await axios.get(`http://${cleanIp}/api/v1/info`, { timeout: 5000 });
      if (resp.data && resp.data.server_name) {
        setLocalServerName(resp.data.server_name);
        setServerConnected(true);
        await SecureStore.setItemAsync('local_server_name', resp.data.server_name);
        Alert.alert('Sukses', `Terhubung ke: ${resp.data.server_name}`);
      } else {
        setServerConnected(false);
        Alert.alert('Gagal', 'Format data dari server salah.');
      }
    } catch (e) {
      console.error(e);
      setServerConnected(false);
      Alert.alert('Koneksi Gagal', 'Tidak dapat terhubung ke server lokal. Pastikan IP benar dan satu WiFi.');
    } finally {
      setLoading(false);
    }
  };

  const initDB = useCallback(() => {
    if (Platform.OS === 'web') {
      loadProducts();
      return;
    }
    db.execSync(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, name TEXT, modal_price REAL, sell_price REAL, stock REAL, unit TEXT
      );
      CREATE TABLE IF NOT EXISTS product_units (
        id TEXT PRIMARY KEY, product_id TEXT, name TEXT, conversion INTEGER, price REAL
      );
      CREATE TABLE IF NOT EXISTS product_stocks (
        id TEXT PRIMARY KEY, product_id TEXT, branch_id TEXT, stock REAL
      );
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id TEXT PRIMARY KEY, from_name TEXT, to_name TEXT, transfer_date TEXT, status TEXT
      );
      CREATE TABLE IF NOT EXISTS stock_transfer_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, transfer_id TEXT, product_name TEXT, qty REAL, unit_name TEXT
      );
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT, total REAL, payment_method TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, synced INTEGER DEFAULT 0
      );
    `);
    loadProducts();
  }, [loadProducts]);

  const loadProducts = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        const token = localStorage.getItem('user_token');
        if (!token) return;
        const resp = await axios.get(`${getBaseUrl()}/api/v1/products-sync`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const mapped = resp.data.map(p => ({
          id: p.id.toString(),
          name: p.name,
          modal_price: p.cost_price || 0,
          sell_price: p.price || 0,
          stock: p.stock || 0,
          unit: p.units && p.units.length > 0 ? p.units[0].name : (p.unit?.name || 'Pcs')
        }));
        setProducts(mapped);
      } catch (e) {
        console.error('Web API products load failed:', e);
      }
    } else {
      const allRows = db.getAllSync('SELECT * FROM products');
      setProducts(allRows);
    }
  }, [getBaseUrl]);

  const loadTransfers = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        const token = localStorage.getItem('user_token');
        if (!token) return;
        const resp = await axios.get(`${getBaseUrl()}/api/v1/stock-transfers`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const mapped = resp.data.map(t => ({
          id: t.id.toString(),
          from_name: t.from_branch?.name || t.from_warehouse?.name || '?',
          to_name: t.to_branch?.name || t.to_warehouse?.name || '?',
          transfer_date: t.transfer_date,
          status: t.status
        }));
        setTransfers(mapped);
      } catch (e) {
        console.error('Web API transfers load failed:', e);
      }
    } else {
      const rows = db.getAllSync('SELECT * FROM stock_transfers');
      setTransfers(rows);
    }
  }, [getBaseUrl]);

  const loadOmset = useCallback(async () => {
    if (Platform.OS === 'web') {
      // For web demo, dummy or simple calculate from API if available
      setOmset(0);
    } else {
      let query = 'SELECT SUM(total) as total FROM sales';
      if (dateFilter === 'today') query += " WHERE date(created_at) = date('now')";
      else if (dateFilter === 'month') query += " WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')";
      
      const result = db.getFirstSync(query);
      setOmset(result?.total || 0);
    }
  }, [dateFilter]);

  const scanPrinters = async () => {
    setIsScanning(true);
    setPrinters([]);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Izin lokasi dibutuhkan.');
        setIsScanning(false);
        return;
      }

      // Gunakan PrintersDiscovery API yang benar
      const discoveryListener = PrintersDiscovery.onDiscovery((discoveredPrinters) => {
        // Map data printer
        const formatted = discoveredPrinters.map(p => ({
          name: p.name || 'Printer Bluetooth',
          address: p.macAddress || p.ipAddress || '',
          macAddress: p.macAddress,
          ipAddress: p.ipAddress,
        }));
        setPrinters(formatted);
      });

      const errorListener = PrintersDiscovery.onError((err) => {
        console.error('Discovery error:', err);
        Alert.alert('Error Scan', err.message || 'Gagal mencari printer');
        setIsScanning(false);
      });

      // Mulai scan
      await PrintersDiscovery.start({ timeout: 10000 });

      // Stop scanning state setelah 10 detik
      setTimeout(() => {
        setIsScanning(false);
        // Clean listeners
        discoveryListener();
        errorListener();
      }, 10000);

    } catch (e) {
      Alert.alert('Error', 'Gagal scan printer. Pastikan Bluetooth aktif.');
      console.error(e);
      setIsScanning(false);
    }
  };

  const selectPrinter = async (printer) => {
    setSelectedPrinter(printer);
    await SecureStore.setItemAsync('selected_printer', JSON.stringify(printer));
    Alert.alert('Sukses', `Printer ${printer.name || printer.address} dipilih sebagai default.`);
  };

  const testPrint = async () => {
    if (!selectedPrinter) {
      Alert.alert('Peringatan', 'Pilih printer terlebih dahulu.');
      return;
    }

    try {
      // Hubungkan ke printer menggunakan PrintModule dari react-native-esc-pos-printer
      const client = new PrintModule({
        connectionType: 'bluetooth',
        address: selectedPrinter.macAddress || selectedPrinter.address,
      });

      await client.connect();
      
      const design = new PrintModule.Design()
        .align('center')
        .size(1, 1)
        .text('TEST PRINT SUCCESS')
        .feed(1)
        .text(`Kertas: ${printerSize}mm`)
        .feed(3)
        .cut();

      await client.print(design);
      await client.disconnect();
      
      Alert.alert('Sukses', 'Test print berhasil dikirim');
    } catch (e) {
      Alert.alert('Error', 'Gagal cetak. Cek koneksi printer.');
      console.error(e);
    }
  };

  useEffect(() => {
    if (isLoggedIn) loadOmset();
  }, [loadOmset, isLoggedIn]);

  const handleLogin = async () => {
    if (!email || !password) return;
    if (serverMode === 'local' && !localServerIp) {
      Alert.alert('Error', 'IP Server Lokal belum diisi.');
      return;
    }
    
    // Request permission (di Android butuh Location untuk WiFi lokal & Bluetooth)
    if (Platform.OS === 'android') {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn("Location permission not granted. Local WiFi and Bluetooth print might fail.");
        }
      } catch (e) {
        console.warn("Could not request location permission:", e);
      }
    }

    setLoading(true);
    try {
      const resp = await axios.post(`${getBaseUrl()}/api/v1/auth/login`, {
        email, password, device_name: 'Android-Expo'
      });
      
      if (Platform.OS === 'web') {
        localStorage.setItem('user_email', email);
        localStorage.setItem('user_pass', password);
        localStorage.setItem('user_token', resp.data.token);
      } else {
        await SecureStore.setItemAsync('user_email', email);
        await SecureStore.setItemAsync('user_pass', password);
        await SecureStore.setItemAsync('user_token', resp.data.token);
      }
      
      setUser(resp.data.user);
      setIsLoggedIn(true);
      syncData(resp.data.token);
    } catch (e) {
      Alert.alert('Error', 'Login gagal. Periksa koneksi ke ' + (serverMode === 'local' ? 'Server Lokal' : 'Cloud'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Yakin ingin keluar?', [
      { text: 'Batal' },
      { text: 'Logout', onPress: async () => {
        setIsLoggedIn(false);
        if (Platform.OS === 'web') {
          localStorage.removeItem('user_token');
        } else {
          await SecureStore.deleteItemAsync('user_token');
        }
      }}
    ]);
  };

  const syncData = async (token) => {
    setLoading(true);
    try {
      const currentToken = token || (Platform.OS === 'web' ? localStorage.getItem('user_token') : await SecureStore.getItemAsync('user_token'));
      const base = getBaseUrl();
      
      // Sync Products
      const prodResp = await axios.get(`${base}/api/v1/products-sync`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      // Sync Transfers (only if not in local server mode or local supports it)
      let transData = [];
      try {
        const transResp = await axios.get(`${base}/api/v1/stock-transfers`, {
          headers: { Authorization: `Bearer ${currentToken}` }
        });
        transData = transResp.data;
      } catch (e) { console.log('Transfers sync skipped/not supported') }

      if (Platform.OS === 'web') {
        // Web loads live from API, just update state
        const mapped = prodResp.data.map(p => ({
          id: p.id.toString(),
          name: p.name,
          modal_price: p.cost_price || 0,
          sell_price: p.price || 0,
          stock: p.stock || 0,
          unit: p.units && p.units.length > 0 ? p.units[0].name : (p.unit?.name || 'Pcs')
        }));
        setProducts(mapped);
        const transMapped = transData.map(t => ({
          id: t.id.toString(),
          from_name: t.from_branch?.name || t.from_warehouse?.name || '?',
          to_name: t.to_branch?.name || t.to_warehouse?.name || '?',
          transfer_date: t.transfer_date,
          status: t.status
        }));
        setTransfers(transMapped);
      } else {
        db.withTransactionSync(() => {
          db.execSync('DELETE FROM products');
          db.execSync('DELETE FROM product_units');
          db.execSync('DELETE FROM product_stocks');
          db.execSync('DELETE FROM stock_transfers');
          db.execSync('DELETE FROM stock_transfer_items');
          
          prodResp.data.forEach(p => {
            db.runSync(
              'INSERT INTO products (id, name, modal_price, sell_price, stock, unit) VALUES (?, ?, ?, ?, ?, ?)',
              p.id.toString(), p.name, p.cost_price || 0, p.price || 0, p.stock || 0, p.units && p.units.length > 0 ? p.units[0].name : (p.unit?.name || 'Pcs')
            );
            if (p.units && p.units.length > 0) {
              p.units.forEach(u => db.runSync('INSERT INTO product_units (id, product_id, name, conversion, price) VALUES (?, ?, ?, ?, ?)', u.id.toString(), p.id.toString(), u.name, u.conversion, u.price || 0));
            }
            if (p.stocks && p.stocks.length > 0) {
              p.stocks.forEach(s => db.runSync('INSERT INTO product_stocks (id, product_id, branch_id, stock) VALUES (?, ?, ?, ?)', s.id.toString(), p.id.toString(), s.branch_id?.toString() || '0', s.stock || 0));
            }
          });

          transData.forEach(t => {
            db.runSync(
              'INSERT INTO stock_transfers (id, from_name, to_name, transfer_date, status) VALUES (?, ?, ?, ?, ?)',
              t.id.toString(), t.from_branch?.name || t.from_warehouse?.name || '?', t.to_branch?.name || t.to_warehouse?.name || '?', t.transfer_date, t.status
            );
            if (t.items && t.items.length > 0) {
              t.items.forEach(ti => db.runSync('INSERT INTO stock_transfer_items (transfer_id, product_name, qty, unit_name) VALUES (?, ?, ?, ?)', t.id.toString(), ti.product?.name || '?', ti.qty, ti.unit?.name || 'Pcs'));
            }
          });
        });
      }
      loadProducts();
      loadTransfers();
      const now = new Date().toLocaleString();
      setSyncTime(now);
      await SecureStore.setItemAsync('last_sync', now);
    } catch (e) {
      console.error('Sync error:', e);
      Alert.alert('Offline Mode', 'Gagal sinkronisasi data.');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = useCallback((p) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === p.id);
      if (existing) return prev.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { ...p, qty: 1 }];
    });
  }, []);

  const checkout = useCallback(async () => {
    if (cart.length === 0) return;
    const total = cart.reduce((sum, item) => sum + (item.sell_price * item.qty), 0);
    
    if (Platform.OS === 'web') {
      try {
        const token = localStorage.getItem('user_token');
        if (token) {
          await axios.post(`${getBaseUrl()}/api/v1/pos/transaction`, {
            total_amount: total,
            payment_method: 'CASH',
            items: cart.map(item => ({
              product_id: item.id,
              qty: item.qty,
              price: item.sell_price
            }))
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      } catch (e) {
        console.error('Web API checkout failed:', e);
      }
    } else {
      db.runSync('INSERT INTO sales (total, payment_method) VALUES (?, ?)', total, 'CASH');
    }
    
    // Print receipt if printer is connected
    if (selectedPrinter) {
      try {
        const client = new PrintModule({
          connectionType: 'bluetooth',
          address: selectedPrinter.macAddress || selectedPrinter.address,
        });

        await client.connect();
        
        let design = new PrintModule.Design()
          .align('center')
          .size(1, 1)
          .text(storeName)
          .size(0, 0)
          .text(`Telp: ${storeContact}`)
          .feed(1)
          .text('--------------------------------')
          .feed(1)
          .align('left');

        cart.forEach(item => {
          design = design.text(`${item.name}`);
          design = design.text(` ${item.qty} x ${item.sell_price.toLocaleString()} = ${(item.qty * item.sell_price).toLocaleString()}`);
        });

        design = design.feed(1)
          .align('center')
          .text('--------------------------------')
          .align('right')
          .text(`TOTAL: Rp ${total.toLocaleString()}`)
          .align('center')
          .text('--------------------------------')
          .feed(1)
          .text(storeFooter)
          .feed(3)
          .cut();

        await client.print(design);
        await client.disconnect();
      } catch (e) {
        console.error('Print Error:', e);
        Alert.alert('Print Gagal', 'Struk gagal dicetak, namun transaksi tetap tersimpan. Pastikan printer menyala.');
      }
    }

    setCart([]);
    loadOmset();
    Alert.alert('Sukses', 'Transaksi Berhasil!');
  }, [cart, loadOmset, selectedPrinter, storeName, storeContact, storeFooter]);

  const terimaBarang = async (id) => {
    setLoading(true);
    try {
      const currentToken = await SecureStore.getItemAsync('user_token');
      await axios.post(`${getBaseUrl()}/api/v1/stock-transfers/${id}/complete`, {}, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      syncData();
      Alert.alert('Sukses', 'Barang berhasil diterima.');
    } catch (e) {
      Alert.alert('Error', 'Gagal konfirmasi terima barang.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search]);
  
  const filteredTransfers = useMemo(() => {
    return transfers.filter(t => {
      const matchStatus = transferFilter === 'all' || t.status === transferFilter;
      const matchSource = transferSource === 'all' || t.from_name === transferSource;
      return matchStatus && matchSource;
    });
  }, [transfers, transferFilter, transferSource]);

  const sources = useMemo(() => {
    const s = new Set(transfers.map(t => t.from_name));
    return ['all', ...Array.from(s)];
  }, [transfers]);

  if (isSplashVisible) {
    return (
      <Animated.View style={[styles.splashContainer, { opacity: splashOpacity }]}>
        <Image source={require('./assets/icon.png')} style={styles.splashLogo} contentFit="contain" />
        <Text style={styles.splashTitle}>KasirQu</Text>
      </Animated.View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={styles.loginContainer}>
        <Image source={require('./assets/icon.png')} style={styles.logo} contentFit="contain" />
        <Text style={styles.title}>KasirQu</Text>

        <View style={styles.modeContainer}>
          <TouchableOpacity 
            style={[styles.modeBtn, serverMode === 'cloud' && styles.activeModeBtn]}
            onPress={async () => {
              setServerMode('cloud');
              setServerConnected(true);
              await SecureStore.setItemAsync('server_mode', 'cloud');
            }}
          >
            <Text style={[styles.modeBtnText, serverMode === 'cloud' && styles.activeModeBtnText]}>Cloud</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.modeBtn, serverMode === 'local' && styles.activeModeBtn]}
            onPress={async () => {
              setServerMode('local');
              setServerConnected(false); // Reset to false until test succeeds
              await SecureStore.setItemAsync('server_mode', 'local');
            }}
          >
            <Text style={[styles.modeBtnText, serverMode === 'local' && styles.activeModeBtnText]}>Lokal</Text>
          </TouchableOpacity>
        </View>

        {serverMode === 'local' && (
          <View style={{ marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput 
                style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                placeholder="IP Server:Port (mis: 192.168.1.18:8081)" 
                placeholderTextColor="#94a3b8"
                value={localServerIp} 
                onChangeText={(val) => {
                  setLocalServerIp(val);
                  setServerConnected(false);
                  SecureStore.setItemAsync('local_server_ip', val);
                }}
              />
              <TouchableOpacity 
                style={styles.testBtn}
                onPress={() => testLocalConnection(localServerIp)}
              >
                <RefreshCw color="#fff" size={16} />
              </TouchableOpacity>
            </View>
            {localServerName ? <Text style={styles.serverConnected}>Terhubung ke: {localServerName}</Text> : null}
          </View>
        )}

        {serverConnected ? (
          <>
            <TextInput 
              style={styles.input} placeholder="Email" placeholderTextColor="#94a3b8"
              value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
            />
            <View style={styles.passwordContainer}>
              <TextInput 
                style={styles.passwordInput} placeholder="Password" placeholderTextColor="#94a3b8"
                value={password} onChangeText={setPassword} secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                {showPassword ? <EyeOff color="#94a3b8" size={20} /> : <Eye color="#94a3b8" size={20} />}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>MASUK</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <Text style={{ color: '#ef4444', textAlign: 'center', marginTop: 10 }}>
            Harap hubungkan dan tes koneksi ke Server Lokal terlebih dahulu.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{user?.name} | {user?.roles?.[0]}</Text>
        <TouchableOpacity onPress={() => setIsLoggedIn(false)}><LogOut size={20} color="#fff" /></TouchableOpacity>
      </View>

      <View style={styles.content}>
        {activeTab === 'dashboard' && (
          <View style={styles.dashboard}>
            <View style={styles.filterRow}>
              {['today', 'month', 'all'].map((f) => (
                <TouchableOpacity key={f} onPress={() => setDateFilter(f)} style={[styles.filterBtn, dateFilter === f && styles.activeFilter]}>
                  <Text style={dateFilter === f ? styles.activeFilterText : styles.filterText}>
                    {f === 'today' ? 'Hari Ini' : f === 'month' ? 'Bulan Ini' : 'Semua'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.omsetCard}>
              <Text style={styles.omsetTitle}>Total Omset</Text>
              <Text style={styles.omsetValue}>Rp {omset.toLocaleString()}</Text>
            </View>
          </View>
        )}

        {(activeTab === 'kasir' || activeTab === 'stok') && (
          <View style={{ flex: 1 }}>
            <View style={styles.searchBar}>
              <Search size={20} color="#666" />
              <TextInput style={styles.searchInput} placeholder="Cari produk..." value={search} onChangeText={setSearch} />
            </View>
            <FlashList 
              data={filteredProducts}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <ProductItem item={item} onPress={addToCart} isKasir={activeTab === 'kasir'} />}
              estimatedItemSize={70}
            />
          </View>
        )}

        {activeTab === 'transfer' && (
          <View style={{ flex: 1 }}>
            <View style={styles.filterScroll}>
              <FlashList
                horizontal
                data={['all', 'pending', 'completed']}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => setTransferFilter(item)} style={[styles.miniFilter, transferFilter === item && styles.activeFilter]}>
                    <Text style={[styles.miniFilterText, transferFilter === item && styles.activeFilterText]}>{item.toUpperCase()}</Text>
                  </TouchableOpacity>
                )}
                estimatedItemSize={50}
                showsHorizontalScrollIndicator={false}
              />
            </View>
            <View style={styles.filterScroll}>
              <FlashList
                horizontal
                data={sources}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => setTransferSource(item)} style={[styles.miniFilter, transferSource === item && styles.activeFilter]}>
                    <Text style={[styles.miniFilterText, transferSource === item && styles.activeFilterText]}>{item}</Text>
                  </TouchableOpacity>
                )}
                estimatedItemSize={100}
                showsHorizontalScrollIndicator={false}
              />
            </View>
            <FlashList 
              data={filteredTransfers}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <TransferItem item={item} onAccept={terimaBarang} userRole={user?.roles?.[0]} />}
              estimatedItemSize={70}
            />
          </View>
        )}

        {activeTab === 'settings' && (
          <View style={styles.settings}>
            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <User color="#3b82f6" size={20} />
                <View style={{ marginLeft: 15 }}>
                  <Text style={styles.settingTitle}>{user?.name}</Text>
                  <Text style={styles.settingLabel}>{user?.email}</Text>
                  <Text style={styles.settingLabel}>{user?.roles?.[0]}</Text>
                </View>
              </View>
            </View>

            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <Settings color="#8b5cf6" size={20} />
                <View style={{ marginLeft: 15, flex: 1 }}>
                  <Text style={styles.settingTitle}>Informasi Struk</Text>
                  
                  <Text style={[styles.settingLabel, {marginTop: 10}]}>Nama Cabang</Text>
                  <TextInput 
                    style={styles.settingInput} 
                    value={storeName} 
                    onChangeText={setStoreName} 
                    onBlur={async () => await SecureStore.setItemAsync('store_name', storeName)} 
                  />
                  
                  <Text style={[styles.settingLabel, {marginTop: 10}]}>No Kontak</Text>
                  <TextInput 
                    style={styles.settingInput} 
                    value={storeContact} 
                    onChangeText={setStoreContact} 
                    keyboardType="phone-pad"
                    onBlur={async () => await SecureStore.setItemAsync('store_contact', storeContact)} 
                  />
                  
                  <Text style={[styles.settingLabel, {marginTop: 10}]}>Footer (Ucapan)</Text>
                  <TextInput 
                    style={styles.settingInput} 
                    value={storeFooter} 
                    onChangeText={setStoreFooter} 
                    onBlur={async () => await SecureStore.setItemAsync('store_footer', storeFooter)} 
                  />
                </View>
              </View>
            </View>

            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <RefreshCw color="#22c55e" size={20} />
                <View style={{ marginLeft: 15 }}>
                  <Text style={styles.settingTitle}>Sinkronisasi Terakhir</Text>
                  <Text style={styles.settingLabel}>{syncTime || 'Belum pernah'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <Printer color="#f59e0b" size={20} />
                <View style={{ marginLeft: 15, flex: 1 }}>
                  <Text style={styles.settingTitle}>Pengaturan Printer</Text>
                  <View style={styles.printerOptions}>
                    {['58', '80'].map(size => (
                      <TouchableOpacity 
                        key={size} 
                        style={[styles.printerBtn, printerSize === size && styles.activePrinterBtn]}
                        onPress={async () => {
                          setPrinterSize(size);
                          await SecureStore.setItemAsync('printer_size', size);
                        }}
                      >
                        <Text style={[styles.printerBtnText, printerSize === size && styles.activePrinterBtnText]}>{size}mm</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity 
                    style={styles.testPrintBtn}
                    onPress={testPrint}
                  >
                    <Text style={styles.testPrintBtnText}>TEST PRINT</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <Bluetooth color="#3b82f6" size={20} />
                <View style={{ marginLeft: 15, flex: 1 }}>
                  <Text style={styles.settingTitle}>Koneksi Printer Bluetooth</Text>
                  
                  {selectedPrinter && (
                    <View style={styles.selectedPrinterInfo}>
                      <CheckCircle color="#22c55e" size={16} />
                      <Text style={styles.selectedPrinterText}>
                        {selectedPrinter.name || selectedPrinter.address}
                      </Text>
                      <TouchableOpacity onPress={() => setSelectedPrinter(null)}>
                        <Trash2 color="#ef4444" size={16} />
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity 
                    style={[styles.testPrintBtn, { marginTop: 10 }]}
                    onPress={scanPrinters}
                    disabled={isScanning}
                  >
                    <Text style={styles.testPrintBtnText}>
                      {isScanning ? 'SCANNING...' : 'SCAN PRINTER'}
                    </Text>
                  </TouchableOpacity>

                  {printers.length > 0 && (
                    <View style={styles.printerList}>
                      {printers.map((p, i) => (
                        <TouchableOpacity 
                          key={i} 
                          style={styles.printerListItem}
                          onPress={() => selectPrinter(p)}
                        >
                          <Text style={styles.printerListText}>{p.name || 'Unknown Device'}</Text>
                          <Text style={styles.printerListSub}>{p.address}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <LogOut color="#ef4444" size={20} />
              <Text style={styles.logoutBtnText}>LOGOUT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {cart.length > 0 && activeTab === 'kasir' && (
        <TouchableOpacity style={styles.cartBar} onPress={checkout}>
          <Text style={styles.cartText}>{cart.length} Item | Rp {cart.reduce((s, i) => s + (i.sell_price * i.qty), 0).toLocaleString()}</Text>
          <Text style={styles.checkoutText}>BAYAR</Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'Dash' },
          { id: 'kasir', icon: ShoppingCart, label: 'Kasir' },
          { id: 'stok', icon: Package, label: 'Stok' },
          { id: 'transfer', icon: Package, label: 'Kirim' },
          { id: 'settings', icon: Settings, label: 'Pengaturan' }
        ].map((item) => (
          <TouchableOpacity 
            key={item.id} 
            onPress={item.action || (() => setActiveTab(item.id))} 
            style={styles.fItem}
          >
            <item.icon color={activeTab === item.id ? '#3b82f6' : '#94a3b8'} size={24} />
            <Text style={{color: activeTab === item.id ? '#3b82f6' : '#94a3b8', fontSize: 10, marginTop: 2}}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <View style={styles.buildVersion}>
        <Text style={styles.buildText}>Build 1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#3b82f6' },
  splashLogo: { width: 120, height: 120, marginBottom: 20, tintColor: '#ffffff' },
  splashTitle: { fontSize: 32, fontWeight: 'bold', color: '#fff', letterSpacing: 1 },
  loginContainer: { flex: 1, justifyContent: 'center', padding: 30, backgroundColor: '#0f172a' },
  logo: { width: 100, height: 100, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 30 },
  modeContainer: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 10, padding: 5, marginBottom: 15 },
  modeBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8 },
  activeModeBtn: { backgroundColor: '#3b82f6' },
  modeBtnText: { color: '#94a3b8', fontWeight: 'bold' },
  activeModeBtnText: { color: '#fff' },
  testBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, marginLeft: 10 },
  serverConnected: { color: '#22c55e', fontSize: 12, marginTop: 5, marginLeft: 5 },
  input: { backgroundColor: '#1e293b', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 15 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 25 },
  passwordInput: { flex: 1, color: '#fff', padding: 15 },
  eyeIcon: { padding: 15 },
  btn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#0f172a', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between' },
  headerText: { color: '#fff', fontWeight: 'bold' },
  content: { flex: 1, padding: 15 },
  dashboard: { flex: 1 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  filterBtn: { flex: 1, padding: 10, alignItems: 'center', backgroundColor: '#e2e8f0', borderRadius: 8, marginHorizontal: 5 },
  activeFilter: { backgroundColor: '#3b82f6' },
  filterText: { color: '#475569', fontWeight: 'bold', fontSize: 12 },
  activeFilterText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  omsetCard: { backgroundColor: '#fff', padding: 25, borderRadius: 15, alignItems: 'center', elevation: 3 },
  omsetTitle: { fontSize: 14, color: '#64748b', marginBottom: 5 },
  omsetValue: { fontSize: 28, fontWeight: 'bold', color: '#0f172a' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 10, marginBottom: 10, elevation: 2 },
  searchInput: { flex: 1, marginLeft: 10 },
  productCard: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
  pInfo: { flex: 1 },
  pName: { fontWeight: 'bold', fontSize: 14 },
  pPrice: { color: '#3b82f6', fontSize: 12, marginTop: 2 },
  pRight: { alignItems: 'flex-end' },
  pStock: { color: '#666', fontSize: 12, fontWeight: 'bold' },
  pUnit: { color: '#94a3b8', fontSize: 10 },
  cartBar: { backgroundColor: '#3b82f6', margin: 15, padding: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  checkoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer: { height: 60, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  fItem: { alignItems: 'center', flex: 1 },
  buildVersion: { backgroundColor: '#fff', alignItems: 'center', paddingBottom: 5 },
  buildText: { fontSize: 10, color: '#cbd5e1' },
  filterScroll: { marginBottom: 5 },
  miniFilter: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e2e8f0', borderRadius: 20, marginRight: 8 },
  miniFilterText: { fontSize: 10, color: '#475569', fontWeight: 'bold' },
  settings: { flex: 1 },
  settingCard: { backgroundColor: '#fff', padding: 20, borderRadius: 10, marginBottom: 15, elevation: 1 },
  settingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  settingTitle: { fontWeight: 'bold', fontSize: 16, color: '#0f172a', marginBottom: 5 },
  settingLabel: { fontSize: 14, color: '#64748b', marginBottom: 2 },
  settingInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 5, padding: 8, fontSize: 14, color: '#0f172a', marginTop: 5, backgroundColor: '#f8fafc' },
  printerOptions: { flexDirection: 'row', marginTop: 10, marginBottom: 10 },
  printerBtn: { paddingVertical: 6, paddingHorizontal: 15, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 5, marginRight: 10 },
  activePrinterBtn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  printerBtnText: { color: '#64748b', fontWeight: 'bold' },
  activePrinterBtnText: { color: '#fff' },
  testPrintBtn: { backgroundColor: '#e2e8f0', padding: 10, borderRadius: 5, alignItems: 'center' },
  testPrintBtnText: { color: '#475569', fontWeight: 'bold', fontSize: 12 },
  logoutBtn: { backgroundColor: '#fee2e2', padding: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  logoutBtnText: { color: '#ef4444', fontWeight: 'bold', marginLeft: 10 },
  selectedPrinterInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', padding: 10, borderRadius: 5, marginTop: 5 },
  selectedPrinterText: { flex: 1, marginLeft: 10, fontSize: 13, color: '#166534', fontWeight: 'bold' },
  printerList: { marginTop: 15, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  printerListItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  printerListText: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
  printerListSub: { fontSize: 12, color: '#64748b' }
});

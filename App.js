import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  Alert, ActivityIndicator, Dimensions, Animated, Platform,
  ScrollView, Modal
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { FlashList } from "@shopify/flash-list";
import { Image } from 'expo-image';
import axios from 'axios';
import { 
  ShoppingCart, Package, RefreshCw, LogOut, Search, Eye, EyeOff, 
  LayoutDashboard, Settings, User, Printer, Bluetooth, Trash2, CheckCircle,
  Plus, ArrowRight, ArrowLeft, ChevronRight, ChevronLeft, ArrowDownToLine, ArrowUpFromLine, ListFilter
} from 'lucide-react-native';

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
  const [serverMode, setServerMode] = useState('local'); // Force local mode
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [localServerIp, setLocalServerIp] = useState('192.168.1.250:8081');
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
  const [transferDateFilter, setTransferDateFilter] = useState('all'); // all, today, month
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transferSubTab, setTransferSubTab] = useState('terima'); // terima or kirim
  const [showKirimModal, setShowKirimModal] = useState(false);
  const [transferCart, setTransferCart] = useState([]);
  const [targetBranch, setTargetBranch] = useState(null);
  const [transferSearch, setTransferSearch] = useState('');
  const [transferPage, setTransferPage] = useState(1);
  const [transferItemsPerPage, setTransferItemsPerPage] = useState(10);
  const [transferColumns, setTransferColumns] = useState({
    no: true,
    route: true,
    date: true,
    status: true,
    actions: true
  });
  const [modalProductSearch, setModalProductSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [omset, setOmset] = useState(0);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const splashOpacity = useMemo(() => new Animated.Value(1), []);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [todayCount, setTodayCount] = useState(0);
  const [recentSales, setRecentSales] = useState([]);

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

    if (savedIp) {
      setLocalServerIp(savedIp);
      // Auto-fetch branches if IP exists
      try {
        let cleanIp = savedIp.replace(/^(http:\/\/|https:\/\/)/, '').replace(/\/$/, '');
        const branchResp = await axios.get(`http://${cleanIp}/api/v1/branches`);
        setBranches(branchResp.data || []);
        const savedBranchId = await Storage.getItemAsync('selected_branch_id');
        if (savedBranchId && branchResp.data) {
          const found = branchResp.data.find(b => b.id.toString() === savedBranchId);
          if (found) setSelectedBranch(found);
        } else if (branchResp.data && branchResp.data.length > 0) {
          setSelectedBranch(branchResp.data[0]);
        }
      } catch (e) {
        console.log("Auto fetch branches failed", e);
      }
    }
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
    let cleanIp = ip.replace(/^(http:\/\/|https:\/\/)/, '').replace(/\/$/, '');
    try {
      const resp = await axios.get(`http://${cleanIp}/api/v1/info`, { timeout: 5000 });
      if (resp.data && resp.data.server) {
        setLocalServerName(resp.data.server);
        setServerConnected(true);
        await Storage.setItemAsync('local_server_name', resp.data.server);
        
        // Fetch branches
        const branchResp = await axios.get(`http://${cleanIp}/api/v1/branches`);
        setBranches(branchResp.data || []);
        if (branchResp.data && branchResp.data.length > 0) {
          setSelectedBranch(branchResp.data[0]);
        }
        
        Alert.alert('Sukses', `Terhubung ke: ${resp.data.server}`);
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
        const branchId = selectedBranch?.id || 1;
        const resp = await axios.get(`${getBaseUrl()}/api/v1/products?branch_id=${branchId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const mapped = resp.data.map(p => ({
          id: p.id.toString(),
          name: p.name,
          modal_price: 0,
          sell_price: p.sell_price || 0,
          stock: p.stock || 0,
          unit: p.unit_name || 'Pcs'
        }));
        setProducts(mapped);
      } catch (e) {
        console.error('Web API products load failed:', e);
      }
    } else {
      const allRows = db.getAllSync('SELECT * FROM products');
      setProducts(allRows);
    }
  }, [getBaseUrl, selectedBranch]);

  const loadTransfers = useCallback(async () => {
    try {
      const token = await Storage.getItemAsync('user_token');
      const branchId = selectedBranch?.id || user?.branch_id || 1;
      
      if (!token) {
        if (Platform.OS !== 'web') {
          const rows = db.getAllSync('SELECT * FROM stock_transfers');
          setTransfers(rows);
        }
        return;
      }
      const resp = await axios.get(`${getBaseUrl()}/api/v1/stock-transfers?to_branch_id=${branchId}&branch_id=${branchId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000
      });
      const mapped = resp.data.map(t => ({
        id: t.id.toString(),
        from_name: t.from_branch?.name || t.from_warehouse?.name || '?',
        to_name: t.to_branch?.name || t.to_warehouse?.name || '?',
        transfer_date: t.transfer_date,
        status: t.status
      }));
      setTransfers(mapped);

      if (Platform.OS !== 'web') {
        try {
          db.withTransactionSync(() => {
            db.execSync('DELETE FROM stock_transfers');
            mapped.forEach(t => {
              db.runSync(
                'INSERT INTO stock_transfers (id, from_name, to_name, transfer_date, status) VALUES (?, ?, ?, ?, ?)',
                [t.id, t.from_name, t.to_name, t.transfer_date, t.status]
              );
            });
          });
        } catch (dbErr) {
          console.error('Cache transfers to DB failed:', dbErr);
        }
      }
    } catch (e) {
      console.warn('Realtime online transfers load failed, fallback to local:', e);
      if (Platform.OS !== 'web') {
        const rows = db.getAllSync('SELECT * FROM stock_transfers');
        setTransfers(rows);
      }
    }
  }, [getBaseUrl, selectedBranch, user]);

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

  const loadDashboardStats = useCallback(async () => {
    if (Platform.OS === 'web') {
      setTodayCount(0);
      setRecentSales([]);
      return;
    }
    try {
      const countRow = db.getFirstSync("SELECT COUNT(*) as c FROM sales WHERE date(created_at) = date('now')");
      setTodayCount(countRow?.c || 0);
      const rows = db.getAllSync(
        "SELECT id, total, payment_method, created_at FROM sales ORDER BY created_at DESC LIMIT 5"
      );
      setRecentSales(rows);
    } catch (e) {
      console.warn('loadDashboardStats error:', e);
    }
  }, []);

  const lowStockProducts = useMemo(() => {
    return products.filter(p => Number(p.stock) <= 5).slice(0, 10);
  }, [products]);

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
    if (isLoggedIn) {
      loadOmset();
      loadDashboardStats();
    }
  }, [loadOmset, loadDashboardStats, isLoggedIn, activeTab]);

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
      if (resp.data.user.branch) {
        setSelectedBranch(resp.data.user.branch);
      }
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
      const branchId = selectedBranch?.id || user?.branch_id || 1;
      
      const prodResp = await axios.get(`${base}/api/v1/products?branch_id=${branchId}`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (Platform.OS === 'web') {
        const mapped = prodResp.data.map(p => ({
          id: p.id.toString(),
          name: p.name,
          modal_price: 0,
          sell_price: p.sell_price || 0,
          stock: p.stock || 0,
          unit: p.unit_name || 'Pcs'
        }));
        setProducts(mapped);
      } else {
        db.withTransactionSync(() => {
          db.execSync('DELETE FROM products');
          db.execSync('DELETE FROM product_units');
          db.execSync('DELETE FROM product_stocks');
          
          prodResp.data.forEach(p => {
            db.runSync(
              'INSERT INTO products (id, name, modal_price, sell_price, stock, unit) VALUES (?, ?, ?, ?, ?, ?)',
              p.id.toString(), p.name, 0, p.sell_price || 0, p.stock || 0, p.unit_name || 'Pcs'
            );
          });
        });
      }
      loadProducts();
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

  const kirimBarang = async () => {
    if (!targetBranch) {
      Alert.alert('Error', 'Pilih cabang tujuan.');
      return;
    }
    if (transferCart.length === 0) {
      Alert.alert('Error', 'Pilih minimal satu produk.');
      return;
    }
    setLoading(true);
    try {
      const token = await Storage.getItemAsync('user_token');
      const branchId = selectedBranch?.id || user?.branch_id || 1;
      await axios.post(`${getBaseUrl()}/api/v1/stock-transfers`, {
        from_branch_id: branchId,
        to_branch_id: targetBranch.id,
        transfer_date: new Date().toISOString(),
        items: transferCart.map(i => ({
          product_id: i.id,
          qty: i.qty,
          unit_name: i.unit
        }))
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTransferCart([]);
      setShowKirimModal(false);
      loadTransfers();
      Alert.alert('Sukses', 'Transfer stok berhasil dikirim.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Gagal mengirim transfer stok.');
    } finally {
      setLoading(false);
    }
  };

  const addToTransferCart = (p) => {
    setTransferCart(prev => {
      const existing = prev.find(item => item.id === p.id);
      if (existing) return prev.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { ...p, qty: 1 }];
    });
  };

  const removeFromTransferCart = (id) => {
    setTransferCart(prev => prev.filter(i => i.id !== id));
  };

  const updateTransferQty = (id, delta) => {
    setTransferCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(1, i.qty + delta);
        return { ...i, qty: newQty };
      }
      return i;
    }));
  };

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
      const matchSearch = (t.from_name || '').toLowerCase().includes(transferSearch.toLowerCase()) || 
                          (t.to_name || '').toLowerCase().includes(transferSearch.toLowerCase()) || 
                          (t.status || '').toLowerCase().includes(transferSearch.toLowerCase());
      
      const matchStatus = transferFilter === 'all' || t.status === transferFilter;
      const matchSource = transferSource === 'all' || t.from_name === transferSource;
      
      let matchDate = true;
      if (transferDateFilter === 'today' && t.transfer_date) {
        const today = new Date().toISOString().split('T')[0];
        matchDate = t.transfer_date.startsWith(today);
      } else if (transferDateFilter === 'month' && t.transfer_date) {
        const thisMonth = new Date().toISOString().substring(0, 7);
        matchDate = t.transfer_date.startsWith(thisMonth);
      }

      // Check current branch details to filter by tab
      const currentBranchId = selectedBranch?.id || user?.branch_id || 1;
      const currentBranchName = selectedBranch?.name || selectedBranch?.nama_cabang || user?.branch?.name || user?.branch?.nama_cabang || '';
      
      let matchDirection = true;
      if (transferSubTab === 'kirim') {
        matchDirection = (t.from_name || '').toLowerCase() === currentBranchName.toLowerCase();
      } else {
        matchDirection = (t.to_name || '').toLowerCase() === currentBranchName.toLowerCase();
      }

      return matchSearch && matchStatus && matchSource && matchDate && matchDirection;
    });
  }, [transfers, transferSearch, transferFilter, transferSource, transferDateFilter, transferSubTab, selectedBranch, user]);

  const paginatedTransfers = useMemo(() => {
    const start = (transferPage - 1) * transferItemsPerPage;
    return filteredTransfers.slice(start, start + transferItemsPerPage);
  }, [filteredTransfers, transferPage, transferItemsPerPage]);

  const totalTransferPages = useMemo(() => {
    return Math.ceil(filteredTransfers.length / transferItemsPerPage) || 1;
  }, [filteredTransfers, transferItemsPerPage]);

  const sources = useMemo(() => {
    const s = new Set(transfers.map(t => t.from_name));
    return ['all', ...Array.from(s)];
  }, [transfers]);

  const transferStats = useMemo(() => {
    return {
      total: transfers.length,
      pending: transfers.filter(t => t.status === 'pending').length,
      completed: transfers.filter(t => t.status === 'completed' || t.status === 'diproses' || t.status === 'selesai').length,
    };
  }, [transfers]);

  const filteredStockProducts = useMemo(() => {
    return products.filter(p => p.name.toLowerCase().includes(stockSearch.toLowerCase()));
  }, [products, stockSearch]);

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

        <View style={{ marginBottom: 15 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput 
              style={[styles.input, { flex: 1, marginBottom: 0 }]} 
              placeholder="IP Server:Port (mis: 192.168.1.250:8081)" 
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
          {localServerName ? <Text style={styles.serverConnected}>Terhubung ke: {localServerName}</Text> : null}
        </View>

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
      </View>
    );
  }


  


  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'kasir': return 'Kasir';
      case 'transfer': return 'Kiriman Stok';
      case 'settings': return 'Pengaturan';
      default: return 'Aplikasi Kasir';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerText}>{getHeaderTitle()}</Text>
          <Text style={{color: '#94a3b8', fontSize: 12}}>{user?.name} | {user?.roles?.[0]}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}><LogOut size={20} color="#fff" /></TouchableOpacity>
      </View>

      <View style={styles.content}>
        {activeTab === 'dashboard' && (
          <ScrollView style={styles.dashboard} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.filterRow}>
              {['today', 'month', 'all'].map((f) => (
                <TouchableOpacity key={f} onPress={() => setDateFilter(f)} style={[styles.filterBtn, dateFilter === f && styles.activeFilter]}>
                  <Text style={dateFilter === f ? styles.activeFilterText : styles.filterText}>
                    {f === 'today' ? 'Hari Ini' : f === 'month' ? 'Bulan Ini' : 'Semua'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dashStatRow}>
              <View style={[styles.dashStatBox, {backgroundColor: '#3b82f6'}]}>
                <Text style={styles.dashStatValue}>{products.length}</Text>
                <Text style={styles.dashStatLabel}>Produk</Text>
              </View>
              <View style={[styles.dashStatBox, {backgroundColor: '#22c55e'}]}>
                <Text style={styles.dashStatValue}>{todayCount}</Text>
                <Text style={styles.dashStatLabel}>Transaksi</Text>
              </View>
              <View style={[styles.dashStatBox, {backgroundColor: '#eab308'}]}>
                <Text style={styles.dashStatValue}>{transferStats.pending}</Text>
                <Text style={styles.dashStatLabel}>Pending</Text>
              </View>
            </View>

            <View style={styles.omsetCard}>
              <Text style={styles.omsetTitle}>Total Omset</Text>
              <Text style={styles.omsetValue}>Rp {Number(omset).toLocaleString()}</Text>
            </View>

            {lowStockProducts.length > 0 && (
              <View style={styles.dashSection}>
                <Text style={styles.dashSectionTitle}>Stok Menipis</Text>
                {lowStockProducts.slice(0, 5).map((p, i) => (
                  <View key={i} style={styles.dashRow}>
                    <Text style={styles.dashRowLabel} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.dashRowValue, {color: '#ef4444'}]}>Stok: {p.stock}</Text>
                  </View>
                ))}
              </View>
            )}

            {recentSales.length > 0 && (
              <View style={styles.dashSection}>
                <Text style={styles.dashSectionTitle}>Transaksi Terakhir</Text>
                {recentSales.map((s, i) => (
                  <View key={i} style={styles.dashRow}>
                    <Text style={styles.dashRowLabel} numberOfLines={1}>{s.created_at}</Text>
                    <Text style={styles.dashRowValue}>Rp {Number(s.total).toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.syncInfoRow}>
              <RefreshCw color="#94a3b8" size={12} />
              <Text style={styles.syncInfoText}>Sync: {syncTime || 'Belum pernah'}</Text>
            </View>
          </ScrollView>
        )}

        {activeTab === 'kasir' && (
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
          <View style={{ flex: 1, padding: 8 }}>
            {/* Sub-tab: Terima (Incoming) vs Kirim (Outgoing) */}
            <View style={styles.subTabRow}>
              <TouchableOpacity 
                style={[styles.subTabBtn, transferSubTab === 'terima' && styles.subTabBtnActive]}
                onPress={() => { setTransferSubTab('terima'); setTransferPage(1); }}
              >
                <ArrowDownToLine size={18} color={transferSubTab === 'terima' ? '#fff' : '#475569'} />
                <Text style={[styles.subTabBtnText, transferSubTab === 'terima' && styles.subTabBtnTextActive]}>
                  Terima Barang
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.subTabBtn, transferSubTab === 'kirim' && styles.subTabBtnActive]}
                onPress={() => { setTransferSubTab('kirim'); setTransferPage(1); }}
              >
                <ArrowUpFromLine size={18} color={transferSubTab === 'kirim' ? '#fff' : '#475569'} />
                <Text style={[styles.subTabBtnText, transferSubTab === 'kirim' && styles.subTabBtnTextActive]}>
                  Kirim Barang
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statBox, {backgroundColor: '#3b82f6'}]}>
                <Text style={styles.statBoxTitle}>Total</Text>
                <Text style={styles.statBoxValue}>{filteredTransfers.length}</Text>
              </View>
              <View style={[styles.statBox, {backgroundColor: '#eab308'}]}>
                <Text style={styles.statBoxTitle}>Pending</Text>
                <Text style={styles.statBoxValue}>
                  {filteredTransfers.filter(t => t.status === 'pending').length}
                </Text>
              </View>
              <View style={[styles.statBox, {backgroundColor: '#22c55e'}]}>
                <Text style={styles.statBoxTitle}>Selesai</Text>
                <Text style={styles.statBoxValue}>
                  {filteredTransfers.filter(t => t.status === 'completed' || t.status === 'selesai').length}
                </Text>
              </View>
            </View>

            {/* Search & Control Panel */}
            <View style={styles.controlPanel}>
              <View style={styles.searchBar}>
                <Search size={18} color="#64748b" />
                <TextInput 
                  style={styles.searchInput} 
                  placeholder="Cari transfer..." 
                  value={transferSearch} 
                  onChangeText={(txt) => { setTransferSearch(txt); setTransferPage(1); }}
                />
                {transferSubTab === 'kirim' && (
                  <TouchableOpacity 
                    style={styles.addTransferBtn}
                    onPress={() => setShowKirimModal(true)}
                  >
                    <Plus size={16} color="#fff" />
                    <Text style={styles.addTransferBtnText}>KIRIM</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Column Visibility Toggles */}
              <View style={styles.colToggleContainer}>
                <ListFilter size={14} color="#64748b" style={{ marginRight: 4 }} />
                <Text style={styles.colToggleLabel}>Kolom:</Text>
                {Object.keys(transferColumns).map(col => (
                  <TouchableOpacity 
                    key={col} 
                    style={[styles.colToggleBtn, transferColumns[col] && styles.colToggleBtnActive]}
                    onPress={() => setTransferColumns(prev => ({ ...prev, [col]: !prev[col] }))}
                  >
                    <Text style={[styles.colToggleText, transferColumns[col] && styles.colToggleTextActive]}>
                      {col === 'no' ? 'No' : col === 'route' ? 'Rute' : col === 'date' ? 'Tgl' : col === 'status' ? 'Sts' : 'Aksi'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              {transferColumns.no && <Text style={[styles.th, { width: 32 }]}>#</Text>}
              {transferColumns.route && <Text style={[styles.th, { flex: 2 }]}>Rute</Text>}
              {transferColumns.date && <Text style={[styles.th, { flex: 1.5 }]}>Tanggal</Text>}
              {transferColumns.status && <Text style={[styles.th, { flex: 1 }]}>Status</Text>}
              {transferColumns.actions && <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Aksi</Text>}
            </View>

            {/* Table Body */}
            <FlashList 
              data={paginatedTransfers}
              keyExtractor={item => item.id}
              estimatedItemSize={55}
              renderItem={({ item, index }) => {
                const globalIdx = (transferPage - 1) * transferItemsPerPage + index + 1;
                return (
                  <View style={styles.tableRow}>
                    {transferColumns.no && (
                      <Text style={[styles.td, { width: 32, color: '#94a3b8', fontSize: 11, textAlign: 'center' }]}>
                        {globalIdx}
                      </Text>
                    )}
                    {transferColumns.route && (
                      <View style={[styles.td, { flex: 2, flexDirection: 'column', alignItems: 'flex-start' }]}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#0f172a' }} numberOfLines={1}>
                          {item.from_name || '?'}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#94a3b8' }}>➔</Text>
                        <Text style={{ fontSize: 11, color: '#475569' }} numberOfLines={1}>
                          {item.to_name || '?'}
                        </Text>
                      </View>
                    )}
                    {transferColumns.date && (
                      <Text style={[styles.td, { flex: 1.5, fontSize: 11, color: '#64748b' }]} numberOfLines={1}>
                        {item.transfer_date ? item.transfer_date.split('T')[0] : '-'}
                      </Text>
                    )}
                    {transferColumns.status && (
                      <View style={[styles.td, { flex: 1 }]}>
                        <View style={[styles.statusBadge, { 
                          backgroundColor: (item.status === 'completed' || item.status === 'selesai') ? '#dcfce7' : '#fef9c7' 
                        }]}>
                          <Text style={[styles.statusText, {
                            color: (item.status === 'completed' || item.status === 'selesai') ? '#15803d' : '#a16207'
                          }]}>
                            {(item.status || 'pending').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    )}
                    {transferColumns.actions && (
                      <View style={[styles.td, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
                        {item.status === 'pending' && transferSubTab === 'terima' ? (
                          <TouchableOpacity 
                            style={styles.acceptBtn}
                            onPress={() => {
                              if (user?.roles?.[0] === 'Kasir Cabang') {
                                Alert.alert('Akses Ditolak', 'Hanya Admin Cabang yang dapat menerima barang.');
                                return;
                              }
                              Alert.alert(
                                'Konfirmasi', 
                                'Terima barang ini?', 
                                [{ text: 'Batal' }, { text: 'Ya', onPress: () => terimaBarang(item.id) }]
                              );
                            }}
                          >
                            <CheckCircle size={16} color="#15803d" />
                          </TouchableOpacity>
                        ) : (
                          <Text style={{ fontSize: 11, color: '#cbd5e1' }}>-</Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Package size={40} color="#cbd5e1" />
                  <Text style={{ marginTop: 10, color: '#94a3b8', textAlign: 'center' }}>
                    Tidak ada data transfer stok
                  </Text>
                </View>
              }
            />

            {/* Pagination */}
            {filteredTransfers.length > 0 && (
              <View style={styles.paginationRow}>
                <TouchableOpacity 
                  disabled={transferPage === 1}
                  onPress={() => setTransferPage(prev => Math.max(1, prev - 1))}
                  style={[styles.pageBtn, transferPage === 1 && styles.pageBtnDisabled]}
                >
                  <ChevronLeft size={20} color={transferPage === 1 ? '#cbd5e1' : '#0f172a'} />
                </TouchableOpacity>

                <Text style={styles.pageInfo}>
                  Hal {transferPage} dari {totalTransferPages}
                </Text>

                <TouchableOpacity 
                  disabled={transferPage === totalTransferPages}
                  onPress={() => setTransferPage(prev => Math.min(totalTransferPages, prev + 1))}
                  style={[styles.pageBtn, transferPage === totalTransferPages && styles.pageBtnDisabled]}
                >
                  <ChevronRight size={20} color={transferPage === totalTransferPages ? '#cbd5e1' : '#0f172a'} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {activeTab === 'settings' && (
          <ScrollView style={styles.settings} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <User color="#3b82f6" size={20} />
                <View style={{ marginLeft: 15 }}>
                  <Text style={styles.settingTitle}>{user?.name}</Text>
                  <Text style={styles.settingLabel}>{user?.email}</Text>
                  <Text style={styles.settingLabel}>
                    {user?.roles?.[0]} • {selectedBranch?.nama_cabang || user?.branch?.nama_cabang || selectedBranch?.name || user?.branch?.name || 'Cabang Belum Dipilih'}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.settingCard} onPress={() => setShowStockModal(true)}>
              <View style={styles.settingRow}>
                <Package color="#3b82f6" size={20} />
                <View style={{ marginLeft: 15, flex: 1 }}>
                  <Text style={styles.settingTitle}>Stok Produk</Text>
                  <Text style={styles.settingLabel}>Lihat dan cari stok produk</Text>
                </View>
              </View>
            </TouchableOpacity>

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
          </ScrollView>
        )}

        {/* Modal Stok Produk */}
        <Modal visible={showStockModal} animationType="slide" onRequestClose={() => setShowStockModal(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Stok Produk</Text>
              <TouchableOpacity onPress={() => setShowStockModal(false)}>
                <Text style={styles.modalClose}>Tutup</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <Search size={20} color="#666" />
              <TextInput style={styles.searchInput} placeholder="Cari produk..." value={stockSearch} onChangeText={setStockSearch} />
            </View>
            <FlashList 
              data={filteredStockProducts}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.productCard} pointerEvents="none">
                  <View style={styles.pInfo}>
                    <Text style={styles.pName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.pPrice}>Rp {item.sell_price.toLocaleString()}</Text>
                  </View>
                  <View style={styles.pRight}>
                    <Text style={[styles.pStock, {color: item.stock > 0 ? '#22c55e' : '#ef4444'}]}>Stok: {item.stock}</Text>
                    <Text style={styles.pUnit}>{item.unit}</Text>
                  </View>
                </View>
              )}
              estimatedItemSize={70}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', marginTop: 50, color: '#94a3b8' }}>Tidak ada produk</Text>
              }
            />
          </View>
        </Modal>

        {/* Modal Kirim Transfer Stok */}
        <Modal 
          visible={showKirimModal} 
          animationType="slide" 
          onRequestClose={() => setShowKirimModal(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kirim Transfer Stok</Text>
              <TouchableOpacity onPress={() => setShowKirimModal(false)}>
                <Text style={styles.modalClose}>Batal</Text>
              </TouchableOpacity>
            </View>

            {/* Step 1: Pilih Cabang Tujuan */}
            <Text style={styles.formLabel}>Cabang Tujuan:</Text>
            <View style={styles.branchSelectContainer}>
              <FlashList 
                horizontal
                data={branches.filter(b => b.id !== (selectedBranch?.id || user?.branch_id))}
                estimatedItemSize={100}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[
                      styles.branchSelectBtn, 
                      targetBranch?.id === item.id && styles.branchSelectBtnActive
                    ]}
                    onPress={() => setTargetBranch(item)}
                  >
                    <Text style={[
                      styles.branchSelectText,
                      targetBranch?.id === item.id && styles.branchSelectTextActive
                    ]}>
                      {item.name || item.nama_cabang || `Cabang ${item.id}`}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ color: '#64748b', fontSize: 12, paddingLeft: 10 }}>Tidak ada cabang tujuan lain</Text>
                }
              />
            </View>

            {/* Step 2: Cari & Tambah Produk */}
            <Text style={styles.formLabel}>Pilih Produk:</Text>
            <View style={styles.searchBar}>
              <Search size={18} color="#64748b" />
              <TextInput 
                style={styles.searchInput} 
                placeholder="Cari produk untuk ditransfer..." 
                value={modalProductSearch} 
                onChangeText={setModalProductSearch} 
              />
            </View>

            <View style={{ height: 160, marginBottom: 10 }}>
              <FlashList 
                data={products.filter(p => p.name.toLowerCase().includes(modalProductSearch.toLowerCase()))}
                keyExtractor={item => item.id}
                estimatedItemSize={50}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.productSelectionRow}
                    onPress={() => addToTransferCart(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productSelectName}>{item.name}</Text>
                      <Text style={styles.productSelectStock}>Stok: {item.stock} {item.unit}</Text>
                    </View>
                    <View style={styles.addBtnCircle}>
                      <Plus size={16} color="#3b82f6" />
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>

            {/* Step 3: Keranjang Item Transfer */}
            <Text style={styles.formLabel}>Daftar Item Transfer ({transferCart.length}):</Text>
            <View style={{ flex: 1, backgroundColor: '#f1f5f9', borderRadius: 8, padding: 8 }}>
              <FlashList 
                data={transferCart}
                keyExtractor={item => item.id}
                estimatedItemSize={60}
                renderItem={({ item }) => (
                  <View style={styles.cartItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.cartItemUnit}>{item.unit}</Text>
                    </View>
                    <View style={styles.qtyContainer}>
                      <TouchableOpacity 
                        style={styles.qtyBtn}
                        onPress={() => updateTransferQty(item.id, -1)}
                      >
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.qtyVal}>{item.qty}</Text>
                      <TouchableOpacity 
                        style={styles.qtyBtn}
                        onPress={() => updateTransferQty(item.id, 1)}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity 
                      style={styles.removeCartItemBtn}
                      onPress={() => removeFromTransferCart(item.id)}
                    >
                      <Trash2 size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', marginTop: 30 }}>
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>Belum ada produk dipilih</Text>
                  </View>
                }
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity 
              style={[
                styles.submitTransferBtn, 
                (!targetBranch || transferCart.length === 0) && styles.submitTransferBtnDisabled
              ]}
              disabled={!targetBranch || transferCart.length === 0}
              onPress={kirimBarang}
            >
              <Text style={styles.submitTransferBtnText}>KIRIM TRANSFER STOK</Text>
            </TouchableOpacity>
          </View>
        </Modal>
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
          { id: 'transfer', icon: Package, label: 'Kiriman Stok' },
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
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  statBox: { flex: 1, marginHorizontal: 3, padding: 12, borderRadius: 8, alignItems: 'center' },
  statBoxTitle: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginBottom: 3 },
  statBoxValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  filterGroupLabel: { fontSize: 11, color: '#64748b', fontWeight: 'bold', marginBottom: 4, marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 50, paddingHorizontal: 15 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  modalClose: { color: '#3b82f6', fontWeight: 'bold', fontSize: 14 },
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
  printerListSub: { fontSize: 12, color: '#64748b' },
  dashStatRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  dashStatBox: { flex: 1, marginHorizontal: 3, padding: 12, borderRadius: 10, alignItems: 'center', elevation: 2 },
  dashStatValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  dashStatLabel: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  dashSection: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginTop: 15, elevation: 1 },
  dashSectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#0f172a', marginBottom: 10 },
  dashRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  dashRowLabel: { fontSize: 12, color: '#475569', flex: 1, marginRight: 10 },
  dashRowValue: { fontSize: 12, fontWeight: 'bold', color: '#0f172a' },
  syncInfoRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  syncInfoText: { fontSize: 10, color: '#94a3b8', marginLeft: 5 },

  // Transfer Stock UI Styles
  subTabRow: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 10, padding: 3, marginBottom: 12 },
  subTabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, gap: 6 },
  subTabBtnActive: { backgroundColor: '#3b82f6' },
  subTabBtnText: { fontSize: 12, fontWeight: 'bold', color: '#475569' },
  subTabBtnTextActive: { color: '#fff' },
  controlPanel: { marginBottom: 10 },
  colToggleContainer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  colToggleLabel: { fontSize: 11, color: '#64748b', fontWeight: 'bold', marginRight: 4 },
  colToggleBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: '#e2e8f0' },
  colToggleBtnActive: { backgroundColor: '#3b82f6' },
  colToggleText: { fontSize: 10, fontWeight: 'bold', color: '#475569' },
  colToggleTextActive: { color: '#fff' },
  addTransferBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginLeft: 8, gap: 4 },
  addTransferBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8, marginBottom: 4 },
  th: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  tableRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderRadius: 4 },
  td: { justifyContent: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  acceptBtn: { backgroundColor: '#f0fdf4', padding: 8, borderRadius: 20 },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 16 },
  pageBtn: { padding: 8, borderRadius: 8, backgroundColor: '#fff', elevation: 1 },
  pageBtnDisabled: { opacity: 0.4 },
  pageInfo: { fontSize: 13, fontWeight: '600', color: '#475569' },
  formLabel: { fontSize: 13, fontWeight: 'bold', color: '#0f172a', marginTop: 12, marginBottom: 6 },
  branchSelectContainer: { height: 48, marginBottom: 8 },
  branchSelectBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#e2e8f0', borderRadius: 10, marginRight: 8, justifyContent: 'center' },
  branchSelectBtnActive: { backgroundColor: '#3b82f6' },
  branchSelectText: { fontSize: 13, fontWeight: 'bold', color: '#475569' },
  branchSelectTextActive: { color: '#fff' },
  productSelectionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 4, elevation: 1 },
  productSelectName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  productSelectStock: { fontSize: 11, color: '#64748b', marginTop: 2 },
  addBtnCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  cartItemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 8, marginBottom: 4, elevation: 1 },
  cartItemName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  cartItemUnit: { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  qtyContainer: { flexDirection: 'row', alignItems: 'center', marginRight: 12, gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 16, fontWeight: 'bold', color: '#475569' },
  qtyVal: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', minWidth: 20, textAlign: 'center' },
  removeCartItemBtn: { padding: 6 },
  submitTransferBtn: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 16, marginBottom: 40 },
  submitTransferBtnDisabled: { backgroundColor: '#94a3b8' },
  submitTransferBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

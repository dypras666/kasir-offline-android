import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  FlatList, ScrollView, Alert, ActivityIndicator 
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import axios from 'axios';
import { ShoppingCart, Package, RefreshCw, LogOut, Search } from 'lucide-react-native';

const db = SQLite.openDatabaseSync('kasir_offline_v2.db');

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('kasir'); // kasir | stok | history

  useEffect(() => {
    initDB();
  }, []);

  const initDB = () => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT,
        modal_price REAL,
        sell_price REAL,
        stock REAL,
        unit TEXT
      );
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL,
        payment_method TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0
      );
    `);
    loadProducts();
  };

  const loadProducts = () => {
    const allRows = db.getAllSync('SELECT * FROM products');
    setProducts(allRows);
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      const resp = await axios.post('https://crm.azzr.biz.id/api/v1/auth/login', {
        email,
        password,
        device_name: 'Android-Expo'
      });
      setUser(resp.data.user);
      setIsLoggedIn(true);
      Alert.alert('Sukses', `Selamat datang, ${resp.data.user.name}`);
      syncData(resp.data.token);
    } catch (e) {
      Alert.alert('Error', 'Login gagal. Cek koneksi & kredensial.');
    } finally {
      setLoading(false);
    }
  };

  const syncData = async (token) => {
    setLoading(true);
    try {
      const resp = await axios.get('https://crm.azzr.biz.id/api/v1/products', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      db.withTransactionSync(() => {
        db.execSync('DELETE FROM products');
        resp.data.data.forEach(p => {
          db.runSync(
            'INSERT INTO products (id, name, modal_price, sell_price, stock, unit) VALUES (?, ?, ?, ?, ?, ?)',
            p.id.toString(), p.name, 0, p.sell_price || 0, p.stock || 0, p.unit || 'Pcs'
          );
        });
      });
      loadProducts();
      Alert.alert('Sync OK', 'Data produk diperbarui.');
    } catch (e) {
      console.log(e);
      Alert.alert('Offline Mode', 'Gagal sync, menggunakan data lokal.');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (p) => {
    const existing = cart.find(item => item.id === p.id);
    if (existing) {
      setCart(cart.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...p, qty: 1 }]);
    }
  };

  const checkout = () => {
    if (cart.length === 0) return;
    const total = cart.reduce((sum, item) => sum + (item.sell_price * item.qty), 0);
    db.runSync('INSERT INTO sales (total, payment_method) VALUES (?, ?)', total, 'CASH');
    setCart([]);
    Alert.alert('Sukses', 'Transaksi Berhasil!');
  };

  if (!isLoggedIn) {
    return (
      <View style={styles.loginContainer}>
        <Text style={styles.title}>KASIR OFFLINE v2</Text>
        <TextInput 
          style={styles.input} placeholder="Email" 
          value={email} onChangeText={setEmail} keyboardType="email-address"
        />
        <TextInput 
          style={styles.input} placeholder="Password" 
          value={password} onChangeText={setPassword} secureTextEntry
        />
        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>MASUK</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{user?.name} | {user?.roles?.[0]}</Text>
        <TouchableOpacity onPress={() => setIsLoggedIn(false)}><LogOut size={20} color="#fff" /></TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.searchBar}>
          <Search size={20} color="#666" />
          <TextInput 
            style={styles.searchInput} placeholder="Cari produk..." 
            value={search} onChangeText={setSearch}
          />
        </View>

        <FlatList 
          data={filteredProducts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.productCard} onPress={() => addToCart(item)}>
              <View>
                <Text style={styles.pName}>{item.name}</Text>
                <Text style={styles.pPrice}>Rp {item.sell_price.toLocaleString()}</Text>
              </View>
              <Text style={styles.pStock}>Stok: {item.stock}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {cart.length > 0 && (
        <TouchableOpacity style={styles.cartBar} onPress={checkout}>
          <Text style={styles.cartText}>{cart.length} Item | Rp {cart.reduce((s, i) => s + (i.sell_price * i.qty), 0).toLocaleString()}</Text>
          <Text style={styles.checkoutText}>BAYAR</Text>
        </TouchableOpacity>
      )}

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => setActiveTab('kasir')} style={styles.fItem}>
          <ShoppingCart color={activeTab === 'kasir' ? '#3b82f6' : '#999'} />
          <Text style={{color: activeTab === 'kasir' ? '#3b82f6' : '#999'}}>Kasir</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('stok')} style={styles.fItem}>
          <Package color={activeTab === 'stok' ? '#3b82f6' : '#999'} />
          <Text style={{color: activeTab === 'stok' ? '#3b82f6' : '#999'}}>Stok</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => syncData()} style={styles.fItem}>
          <RefreshCw color="#999" />
          <Text style={{color: '#999'}}>Sync</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loginContainer: { flex: 1, justifyContent: 'center', padding: 30, backgroundColor: '#0f172a' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 30 },
  input: { backgroundColor: '#1e293b', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 15 },
  btn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#0f172a', padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between' },
  headerText: { color: '#fff', fontWeight: 'bold' },
  content: { flex: 1, padding: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 10, marginBottom: 15, elevation: 2 },
  searchInput: { flex: 1, marginLeft: 10 },
  productCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
  pName: { fontWeight: 'bold', fontSize: 16 },
  pPrice: { color: '#3b82f6', marginTop: 5 },
  pStock: { color: '#666' },
  cartBar: { backgroundColor: '#3b82f6', margin: 15, padding: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartText: { color: '#fff', fontWeight: 'bold' },
  checkoutText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  footer: { height: 70, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  fItem: { alignItems: 'center' }
});

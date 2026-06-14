# Customer UI Flow — Dokumentasi

## 1. Ringkasan

Fitur **Customer UI** menyediakan dua komponen utama:

| Komponen | Lokasi | Fungsi |
|---|---|---|
| `CustomerPicker` | `src/components/CustomerPicker.js` | Modal pemilih pelanggan di layar Kasir (POS) |
| `CustomerScreen` | `src/screens/customer/CustomerScreen.js` | Layar CRUD data pelanggan lokal |

Backend data dikelola oleh `CustomerService` (`src/services/customer/CustomerService.js`) yang menggunakan **localStorage** (Web) atau **SQLite** (Native) secara offline-first.

---

## 2. Arsitektur & Alur Data

```
┌─────────────────────┐
│   App.js (Kasir)    │
│   [Tab: Kasir]      │──▶ CustomerPicker (modal)
└─────────────────────┘      │
                             ├── onSelect(customer) → setSelectedCustomer
                             └── tampilkan nama + poin di cart bar
                                    
┌─────────────────────┐
│   App.js (Nav)      │
│   [Tab: Pelanggan]  │──▶ CustomerScreen (full screen)
└─────────────────────┘      │
                             ├── List pelanggan (search, sort A-Z)
                             ├── Form tambah/edit (name, phone, email, address)
                             ├── Hapus konfirmasi
                             └── Poin badge di setiap kartu
                                    
┌───────────────────────────┐
│   CustomerService          │
│   (src/services/customer/) │
│                            │
│   ├── create({name,phone,email,address}) → customer
│   ├── getAll() → customer[]
│   ├── getById(id) → customer | null
│   ├── update(id, data) → customer
│   ├── delete(id) → boolean
│   ├── search(query) → customer[]
│   └── updatePoin(id, delta) → customer
└───────────────────────────┘
         │
         ▼
   Storage layer:
   ─ Web:     localStorage ('customers_local')
   ─ Native:  SQLite (table: customers)
```

---

## 3. Struktur Data Pelanggan

```typescript
interface Customer {
  id: string;          // Format: "CUST-{timestamp}-{random6char}"
  name: string;        // Wajib
  phone: string;       // Opsional
  email: string;       // Opsional
  address: string;     // Opsional
  poin: number;        // Default 0, tidak boleh negatif
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
}
```

---

## 4. CustomerPicker (Komponen POS)

### Props

| Prop | Type | Default | Deskripsi |
|---|---|---|---|
| `visible` | `boolean` | — | Tampilkan/sembunyikan modal |
| `onSelect` | `(customer \| null) => void` | — | Callback saat pelanggan dipilih (null = hapus pilihan) |
| `onClose` | `() => void` | — | Callback saat modal ditutup |
| `selectedCustomerId` | `string \| null` | — | ID pelanggan yang sedang terpilih |

### Alur Penggunaan di Kasir

```
1. User menekan tombol "Pilih Pelanggan" di cart bar
2. Modal CustomerPicker muncul
3. User mencari pelanggan (search bar: name/phone/email)
4. User menekan kartu pelanggan → onSelect(customer)
5. Nama + poin pelanggan tampil di cart bar
6. User bisa menghapus pilihan via tombol "Hapus pilihan"
```

### Integrasi ke App.js

Tambahkan state di `App.js`:

```javascript
const [selectedCustomer, setSelectedCustomer] = useState(null);
const [showCustomerPicker, setShowCustomerPicker] = useState(false);
```

Render komponen di area POS:

```jsx
<CustomerPicker
  visible={showCustomerPicker}
  onSelect={(customer) => setSelectedCustomer(customer)}
  onClose={() => setShowCustomerPicker(false)}
  selectedCustomerId={selectedCustomer?.id}
/>
```

---

## 5. CustomerScreen (CRUD)

### Navigation

CustomerScreen bisa diakses dari:
- **Tab navigasi** di bottom bar App.js
- **Tombol "Data Pelanggan"** di pengaturan

### Fitur

| Fitur | Deskripsi |
|---|---|
| **List** | FlatList dengan search (name/phone/email), urut A-Z |
| **Search** | Real-time filter, cari berdasarkan nama, telepon, atau email |
| **Tambah** | Form dengan field: Nama (wajib), Telepon, Email, Alamat |
| **Edit** | Tap ikon pensil → form terisi → simpan perubahan |
| **Hapus** | Tap ikon sampah → konfirmasi → hapus |
| **Poin** | Badge kuning di setiap kartu menampilkan saldo poin |

### Tampilan Poin

Saldo poin ditampilkan di:
1. **CustomerPicker** — badge kuning `★ {poin}` di sebelah kanan nama
2. **CustomerScreen** — badge kuning `★ {poin} poin` di kartu pelanggan
3. **Cart bar (POS)** — setelah memilih pelanggan, nama + poin ditampilkan

Format poin menggunakan `formatNumber` (locale `id-ID`):
- `1500` → `"1.500"`
- `50000` → `"50.000"`

---

## 6. CustomerService API

### Methods

| Method | Parameters | Returns | Error |
|---|---|---|---|
| `create({name, phone?, email?, address?})` | `name` wajib | `Customer` | `Error('Nama pelanggan wajib diisi')` |
| `getAll()` | — | `Customer[]` (sorted A-Z) | — |
| `getById(id)` | `id: string` | `Customer \| null` | — |
| `update(id, {name, phone?, email?, address?})` | `id` wajib, `name` wajib | `Customer` | `Error('Pelanggan tidak ditemukan')` |
| `delete(id)` | `id: string` | `boolean` | `Error('Pelanggan tidak ditemukan')` |
| `search(query)` | `query: string` | `Customer[]` | — |
| `updatePoin(id, delta)` | `delta: number` | `Customer` | — |

### Storage Backend

- **Web**: `localStorage` key `'customers_local'` — JSON array
- **Android/iOS**: SQLite table `customers` di database `kasir_offline_v2.db`

### Inisialisasi

Panggil `CustomerService.createTable()` di `initDB()` App.js agar tabel SQLite dibuat saat aplikasi pertama kali dijalankan.

```javascript
// Di App.js initDB()
CustomerService.createTable();
```

---

## 7. Poin System

### Aturan
- Pelanggan baru memiliki **0 poin**
- Poin bisa ditambahkan via `updatePoin(id, delta)` dengan delta positif
- Poin bisa dikurangi dengan delta negatif
- Poin **tidak boleh negatif** — nilai minimum adalah 0
- Format tampilan: `formatNumber` (locale `id-ID`)

### Contoh
```javascript
await CustomerService.updatePoin(customer.id, 150);  // +150 → poin = 150
await CustomerService.updatePoin(customer.id, -50);   // -50  → poin = 100
await CustomerService.updatePoin(customer.id, -200);  // -200 → poin = 0 (tidak negatif)
```

---

## 8. Testing

### Test File
`__tests__/customerUI.test.js`

### Test Coverage (9 test cases)

| Test | Status | Deskripsi |
|---|---|---|
| `getAll returns empty initially` | ✅ | Data kosong sebelum ada pelanggan |
| `create adds customer with ID and poin=0` | ✅ | ID unik, poin default 0 |
| `create rejects empty name` | ✅ | Validasi nama wajib diisi |
| `update changes fields in-place` | ✅ | Update tidak membuat record baru |
| `delete removes customer` | ✅ | Hapus mengurangi length list |
| `search by name/phone/email` | ✅ | Pencarian multi-kolom |
| `getAll sorts alphabetically` | ✅ | Urut A-Z berdasarkan nama |
| `updatePoin add/subtract` | ✅ | Poin naik, turun, dan batas 0 |
| `poin displayed with formatNumber` | ✅ | Format poin menggunakan locale id-ID |

### Run Tests
```bash
cd /mnt/projects/linux-projects/kasirofflineexpo
npx jest __tests__/customerUI.test.js
```

---

## 9. Daftar File

| File | Baris | Fungsi |
|---|---|---|
| `src/services/customer/CustomerService.js` | ~220 | Service CRUD + poin (SQLite + localStorage) |
| `src/components/CustomerPicker.js` | ~260 | Modal pemilih pelanggan untuk POS |
| `src/screens/customer/CustomerScreen.js` | ~460 | Layar CRUD pelanggan |
| `__tests__/customerUI.test.js` | ~130 | Unit test (9 test cases) |
| `docs/customer_ui_flow.md` | — | Dokumentasi flow ini |

---

## 10. Future Improvements

- [ ] Integrasi CustomerPicker ke cart checkout flow di App.js
- [ ] Sinkronisasi pelanggan ke server (pushUnsyncedCustomers)
- [ ] Riwayat transaksi per pelanggan
- [ ] Scan barcode/KTP untuk input pelanggan
- [ ] Export/import data pelanggan CSV

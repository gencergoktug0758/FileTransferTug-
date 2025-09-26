# 🚀 FileTransferTug - Modern Güvenli Dosya Paylaşım Sistemi

Modern, güvenli ve kullanıcı dostu dosya paylaşım platformu. Kullanıcı sistemi, şifreli paylaşım ve responsive tasarım ile profesyonel dosya paylaşım deneyimi sunar.

## ✨ Özellikler

### 🔐 Kullanıcı Sistemi
- **Kayıt/Giriş**: Güvenli kullanıcı hesabı oluşturma
- **Güçlü Şifreler**: 8+ karakter, büyük harf, küçük harf, rakam, özel karakter
- **Session Yönetimi**: Güvenli oturum kontrolü
- **Anonim Kullanım**: Hesap olmadan da dosya paylaşımı

### 🔒 Gelişmiş Güvenlik
- **Şifreli Paylaşım**: Dosyalarınızı şifre ile koruyun
- **Brute Force Koruması**: 3 başarısız deneme sonrası 30 dakika kilit
- **Rate Limiting**: 15 dakikada 50 istek limiti
- **HTTPS Zorunluluğu**: Güvenli bağlantı
- **bcrypt 15 Rounds**: Endüstri standardı şifre hashleme
- **AES-256-CBC**: Veritabanı şifreleme

### 📁 Dosya Desteği
- **Tüm Dosya Türleri**: EXE, TXT, BAT, JPG, MP4, ZIP, RAR ve daha fazlası
- **200MB Limit**: Büyük dosyalar için yeterli alan
- **Drag & Drop**: Sürükle-bırak ile kolay yükleme
- **Mobil Uyumlu**: Responsive tasarım

### 🎨 Modern Kullanıcı Deneyimi
- **Neon Tasarım**: Modern glassmorphism ve neon renkler
- **Responsive Tasarım**: Tüm cihazlarda mükemmel görünüm
- **Dark/Light Tema**: Otomatik tema değişimi
- **Ses Efektleri**: Web Audio API ile özel sesler
- **QR Kod**: Mobil erişim için QR kod oluşturma
- **Gerçek Zamanlı İlerleme**: Yükleme durumu takibi
- **Animasyonlar**: Smooth geçişler ve hover efektleri

### 📊 Dosya Yönetimi
- **Dosyalarım**: Yüklenen dosyaları görüntüleme
- **Görünürlük Kontrolü**: Herkese açık/Özel dosya ayarı
- **Dosya Silme**: Tek tıkla dosya temizleme
- **Otomatik Temizlik**: 1 ay indirilmeyen dosyaları silme
- **Dosya Arama**: Kullanıcı adına göre dosya bulma

## 🚀 Kurulum

### Gereksinimler
- Node.js (v14 veya üzeri)
- npm veya yarn

### Yerel Kurulum

#### 1. Projeyi İndirin
```bash
git clone https://github.com/kullaniciadi/dosypaylaşım.git
cd dosypaylaşım
```

#### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

#### 3. Sunucuyu Başlatın
```bash
npm start
```

#### 4. Tarayıcıda Açın
```
http://localhost:3000
```

### Vercel Deployment

#### 1. Vercel CLI Kurulumu
```bash
npm i -g vercel
```

#### 2. Vercel'e Giriş
```bash
vercel login
```

#### 3. Projeyi Deploy Edin
```bash
vercel
```

#### 4. Production Deploy
```bash
vercel --prod
```

#### Alternatif: GitHub ile Deploy
1. Projeyi GitHub'a push edin
2. Vercel dashboard'a gidin
3. "New Project" tıklayın
4. GitHub repository'nizi seçin
5. Deploy edin

### Adımlar

1. **Projeyi klonlayın:**
```bash
git clone https://github.com/gencergoktug0758/FileTransferTug.git
cd FileTransferTug
```

2. **Bağımlılıkları yükleyin:**
```bash
npm install
```

3. **Sunucuyu başlatın:**
```bash
npm start
```

4. **Tarayıcıda açın:**
```
http://localhost:3000
```

## 📖 Kullanım

### 👤 Kullanıcı Hesabı
1. **Kayıt Ol**: Güçlü şifre ile hesap oluşturun
2. **Giriş Yap**: Hesabınızla giriş yapın
3. **Anonim Devam**: Hesap olmadan da kullanabilirsiniz

### 📁 Normal Dosya Paylaşımı
1. Dosyanızı seçin veya sürükle-bırak yapın
2. "Dosyayı Paylaş" butonuna basın
3. Oluşturulan linki paylaşın

### 🔒 Şifreli Dosya Paylaşımı
1. Dosyanızı seçin
2. "Dosyayı Şifreli Paylaş" kutucuğunu işaretleyin
3. 4-12 karakter arası şifre belirleyin
4. "Dosyayı Paylaş" butonuna basın
5. Linki paylaşın (şifre ayrıca paylaşılmalıdır)

### 🔐 Şifreli Dosya İndirme
1. Şifreli dosya linkine tıklayın
2. Şifreyi girin
3. "Doğrula ve Devam Et" butonuna basın
4. Dosya bilgilerini görün ve indirin

### 📊 Dosya Yönetimi
1. **Dosyalarım**: Yüklenen dosyalarınızı görüntüleyin
2. **Görünürlük**: Herkese açık/Özel ayarı yapın
3. **Silme**: Dosyaları tek tıkla silin
4. **Arama**: Kullanıcı adına göre dosya bulun

## 🛠️ Teknik Detaylar

### Kullanılan Teknolojiler
- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Güvenlik**: bcrypt (15 rounds), AES-256-CBC, session token
- **Dosya İşleme**: Multer
- **QR Kod**: qrcode.js
- **Veritabanı**: JSON tabanlı şifreli dosya sistemi
- **Ses**: Web Audio API

### API Endpoints

#### Kullanıcı İşlemleri
```
POST /register
Content-Type: application/json
Body: { "username": "string", "password": "string" }

POST /login
Content-Type: application/json
Body: { "username": "string", "password": "string" }

POST /logout
Headers: { "Authorization": "Bearer sessionToken" }
```

#### Dosya İşlemleri
```
POST /upload
Content-Type: multipart/form-data
Body: file, password (optional), isPublic (optional)

POST /verify-password/:fileId
Content-Type: application/json
Body: { "password": "string" }

GET /download-file/:fileId?token=sessionToken
GET /file/:fileId?token=sessionToken
DELETE /file/:fileId
```

#### Dosya Yönetimi
```
GET /my-files
Headers: { "Authorization": "Bearer sessionToken" }

GET /search/:username
PUT /file/:fileId/visibility
Body: { "isPublic": boolean }
```

### Güvenlik Özellikleri

#### Kullanıcı Şifreleri
- Minimum 8 karakter
- Maksimum 128 karakter
- Büyük harf, küçük harf, rakam ve özel karakter zorunlu
- Yaygın şifreler engellenir

#### Dosya Şifreleri
- Minimum 4 karakter
- Maksimum 12 karakter
- Boşluk karakteri içeremez

#### Brute Force Koruması
- 3 başarısız deneme limiti
- 30 dakika kilit süresi
- IP bazlı takip

#### Rate Limiting
- 15 dakikada 50 istek limiti
- IP bazlı sınırlama

#### Session Yönetimi
- UUID + timestamp + random token
- 30 dakika geçerlilik
- IP kontrolü ile hijacking koruması

## 📁 Proje Yapısı

```
FileTransferTug/
├── public/
│   ├── index.html              # Ana sayfa (responsive)
│   ├── login.html              # Giriş/Kayıt sayfası
│   ├── download.html           # Normal indirme sayfası
│   └── protected-download.html # Şifreli indirme sayfası
├── database/                   # Şifreli veritabanı dosyaları
│   ├── users.enc              # Kullanıcı verileri
│   ├── files.enc              # Dosya bilgileri
│   ├── sessions.enc           # Oturum verileri
│   └── attempts.enc           # Deneme kayıtları
├── uploads/                    # Yüklenen dosyalar
├── server.js                   # Ana sunucu dosyası
├── package.json                # Proje bağımlılıkları
├── .gitignore                  # Git ignore dosyası
├── LICENSE                     # MIT lisansı
└── README.md                   # Bu dosya
```

## 🔧 Geliştirme

### Geliştirme Modu
```bash
npm run dev
```

### Yapılandırma
Sunucu ayarları `server.js` dosyasında yapılandırılabilir:
- Port: `process.env.PORT || 3000`
- Dosya boyutu limiti: `200MB`
- Session süresi: `30 dakika`

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'Add amazing feature'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için `LICENSE` dosyasına bakın.

## 🐛 Hata Bildirimi

Hata bulduysanız lütfen [Issues](https://github.com/gencergoktug0758/FileTransferTug/issues) sayfasında bildirin.

## 📞 İletişim

- **Proje Sahibi**: [gencergoktug0758](https://github.com/gencergoktug0758)
- **E-posta**: gencergoktug5807@gmail.com
- **Proje Linki**: [https://github.com/gencergoktug0758/FileTransferTug](https://github.com/gencergoktug0758/FileTransferTug)

## 🙏 Teşekkürler

Bu projeyi mümkün kılan tüm açık kaynak kütüphanelere teşekkürler!

---

⭐ Bu projeyi beğendiyseniz yıldız vermeyi unutmayın!

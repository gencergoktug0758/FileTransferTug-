const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const QRCode = require('qrcode');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway için gerekli ayarlar
if (process.env.NODE_ENV === 'production') {
  // Production ortamında güvenlik ayarları
  app.set('trust proxy', 1);
}

// Middleware
app.use(compression()); // Gzip compression
// HTTPS zorunluluğu (güvenlik için) - Railway için optimize edildi
app.use((req, res, next) => {
  // Railway'de HTTPS kontrolü yapma - healthcheck'i engelleyebilir
  if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  // Sadece production ortamında ve Railway dışında HTTPS kontrolü
  if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${req.get('host')}${req.url}`);
  }
  next();
});

app.use(cors());
app.use(express.json());

// Ana sayfa - Railway healthcheck için optimize edildi (static middleware'den önce)
app.get('/', (req, res) => {
  // Railway healthcheck için basit response
  res.status(200).send('✅ Server is running!');
});

app.use(express.static('public'));

// Login sayfası için özel route
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.use('/uploads', express.static('uploads'));

// Uploads ve database klasörlerini oluştur
try {
  fs.ensureDirSync('uploads');
  fs.ensureDirSync('database');
  console.log('✅ Klasörler başarıyla oluşturuldu');
} catch (error) {
  console.error('❌ Klasör oluşturma hatası:', error);
  // Hata durumunda da devam et
}

// Veritabanı şifreleme anahtarı (256-bit güvenli anahtar - gerçek projede environment variable kullanın)
const DB_ENCRYPTION_KEY = crypto.scryptSync('FileTransferTug2024SecureKey!@#$%^&*()_+{}|:"<>?[]\\;\',./`~', 'salt', 32);
const DB_IV_LENGTH = 16;

// Veritabanı dosya yolları
const DB_PATHS = {
  users: path.join(__dirname, 'database', 'users.enc'),
  files: path.join(__dirname, 'database', 'files.enc'),
  sessions: path.join(__dirname, 'database', 'sessions.enc'),
  attempts: path.join(__dirname, 'database', 'attempts.enc')
};

// Veritabanı şifreleme fonksiyonları
function encryptData(data) {
  const iv = crypto.randomBytes(DB_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', DB_ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedData) {
  try {
    const textParts = encryptedData.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', DB_ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

// Veritabanı yükleme fonksiyonları
function loadDatabase(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const encryptedData = fs.readFileSync(filePath, 'utf8');
      const decryptedData = decryptData(encryptedData);
      return decryptedData || defaultValue;
    }
  } catch (error) {
    console.error(`Database load error for ${filePath}:`, error);
  }
  return defaultValue;
}

function saveDatabase(filePath, data) {
  try {
    const encryptedData = encryptData(data);
    fs.writeFileSync(filePath, encryptedData, 'utf8');
    return true;
  } catch (error) {
    console.error(`Database save error for ${filePath}:`, error);
    return false;
  }
}

// Dosya yükleme konfigürasyonu
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    const filename = `${uniqueId}${extension}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB chunk limit - büyük chunklar için
  },
  fileFilter: function (req, file, cb) {
    // Chunk upload için dosya filtresi yok
    cb(null, true);
  }
});

// Chunk upload için geçici dosyalar
const chunks = new Map();

// Veritabanından veri yükleme
const users = new Map(Object.entries(loadDatabase(DB_PATHS.users)));
const files = new Map(Object.entries(loadDatabase(DB_PATHS.files)));
const sessions = new Map(Object.entries(loadDatabase(DB_PATHS.sessions)));
const passwordAttempts = new Map(Object.entries(loadDatabase(DB_PATHS.attempts)));
const loginAttempts = new Map(Object.entries(loadDatabase(DB_PATHS.attempts, {}, 'loginAttempts')));

// Veritabanı otomatik kaydetme sistemi
setInterval(() => {
  saveDatabase(DB_PATHS.users, Object.fromEntries(users));
  saveDatabase(DB_PATHS.files, Object.fromEntries(files));
  saveDatabase(DB_PATHS.sessions, Object.fromEntries(sessions));
  saveDatabase(DB_PATHS.attempts, Object.fromEntries(passwordAttempts));
}, 30000); // Her 30 saniyede bir kaydet

// Otomatik dosya temizleme (1 ay boyunca indirilmeyen dosyalar)
setInterval(() => {
  const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); // 1 ay önce
  const filesToDelete = [];

  files.forEach((fileInfo, fileId) => {
    // Son indirme tarihi kontrolü
    const lastDownloadTime = fileInfo.lastDownloadTime || fileInfo.uploadDate;
    if (lastDownloadTime < oneMonthAgo) {
      filesToDelete.push({ fileId, fileInfo });
    }
  });

  // Dosyaları sil
  filesToDelete.forEach(({ fileId, fileInfo }) => {
    try {
      // Dosyayı diskten sil
      const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Dosya bilgisini veritabanından sil
      files.delete(fileId);
      console.log(`Otomatik temizleme: ${fileInfo.originalName} silindi (1 hafta boyunca indirilmedi)`);
    } catch (error) {
      console.error(`Otomatik temizleme hatası (${fileInfo.originalName}):`, error);
    }
  });

  if (filesToDelete.length > 0) {
    console.log(`${filesToDelete.length} dosya otomatik olarak temizlendi`);
  }
}, 24 * 60 * 60 * 1000); // Her 24 saatte bir kontrol et

// Graceful shutdown - sunucu kapanırken verileri kaydet
process.on('SIGINT', () => {
  console.log('\nSunucu kapatılıyor... Veriler kaydediliyor...');
  saveDatabase(DB_PATHS.users, Object.fromEntries(users));
  saveDatabase(DB_PATHS.files, Object.fromEntries(files));
  saveDatabase(DB_PATHS.sessions, Object.fromEntries(sessions));
  saveDatabase(DB_PATHS.attempts, Object.fromEntries(passwordAttempts));
  process.exit(0);
});

// Güvenlik sabitleri
const MAX_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 3; // Maksimum 3 giriş denemesi
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 dakika
const LOGIN_LOCKOUT_TIME = 30 * 60 * 1000; // 30 dakika kilit

// Rate limiting için
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 dakika
const MAX_REQUESTS_PER_WINDOW = 50; // 15 dakikada maksimum 50 istek (daha sıkı)

// Rate limiting middleware
const rateLimit = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  // Eski kayıtları temizle
  if (requestCounts.has(clientIP)) {
    const requests = requestCounts.get(clientIP);
    requestCounts.set(clientIP, requests.filter(time => now - time < RATE_LIMIT_WINDOW));
  }
  
  // Mevcut istekleri al
  const requests = requestCounts.get(clientIP) || [];
  
  // Limit kontrolü
  if (requests.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ 
      error: 'Çok fazla istek! Lütfen 15 dakika sonra tekrar deneyin.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 60000)
    });
  }
  
  // İsteği kaydet
  requests.push(now);
  requestCounts.set(clientIP, requests);
  
  next();
};

// Güvenlik middleware'i
app.use(rateLimit);

// Railway healthcheck endpoint'i
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Ana sayfa için ayrı endpoint
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Kullanıcı kayıt endpoint'i
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

    // Input sanitization
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli!' });
    }

    // Username güvenlik kontrolleri
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Kullanıcı adı 3-20 karakter arasında olmalı!' });
    }

    // Kullanıcı adı kontrolü (sadece harf, rakam ve alt çizgi)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir!' });
    }

    // Güçlü şifre kontrolü
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Şifre 8-128 karakter arasında olmalıdır!' });
    }

    // Şifre karmaşıklığı kontrolü
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      return res.status(400).json({ 
        error: 'Şifre en az 1 büyük harf, 1 küçük harf, 1 rakam ve 1 özel karakter içermelidir!' 
      });
    }

    // Yaygın şifreler kontrolü
    const commonPasswords = ['password', '123456', 'qwerty', 'abc123', 'password123', 'admin', 'user', 'test'];
    if (commonPasswords.includes(password.toLowerCase())) {
      return res.status(400).json({ error: 'Bu şifre çok yaygın kullanılıyor! Daha güvenli bir şifre seçin.' });
    }

    // Kullanıcı zaten var mı kontrol et
    if (users.has(username.toLowerCase())) {
      return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor!' });
    }

    // Şifreyi hashle (daha güçlü salt)
        const hashedPassword = await bcrypt.hash(password, 15);

    // Kullanıcıyı kaydet
    const user = {
      username: username.toLowerCase(),
      originalUsername: username,
      hashedPassword: hashedPassword,
      createdAt: new Date(),
      lastLogin: null,
      loginCount: 0,
      files: [],
      isActive: true,
      registeredIP: clientIP
    };

    users.set(username.toLowerCase(), user);

    console.log(`Yeni kullanıcı kaydı: ${username} (IP: ${clientIP})`);

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu!',
      username: username
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Kayıt hatası!' });
  }
});

// Kullanıcı giriş endpoint'i
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const attemptKey = `${username.toLowerCase()}_${clientIP}`;

    // Input sanitization
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli!' });
    }

    // Brute force koruması
    const attempts = loginAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };

    // Kilit kontrolü
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
      if (timeSinceLastAttempt < LOGIN_LOCKOUT_TIME) {
        const remainingTime = Math.ceil((LOGIN_LOCKOUT_TIME - timeSinceLastAttempt) / 60000);
        return res.status(429).json({ 
          error: `Çok fazla başarısız giriş denemesi! ${remainingTime} dakika sonra tekrar deneyin.`,
          locked: true,
          remainingTime: remainingTime
        });
      } else {
        // Kilit süresi dolmuş, sıfırla
        attempts.count = 0;
      }
    }

    // Kullanıcı var mı kontrol et
    const user = users.get(username.toLowerCase());
    if (!user) {
      // Başarısız giriş - deneme sayısını artır
      attempts.count++;
      attempts.lastAttempt = Date.now();
      loginAttempts.set(attemptKey, attempts);
      
      console.log(`Başarısız giriş denemesi: ${username} (IP: ${clientIP})`);
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı!' });
    }

    // Hesap aktif mi kontrol et
    if (!user.isActive) {
      return res.status(403).json({ error: 'Hesabınız deaktif edilmiş!' });
    }

    // Şifre kontrolü
    const isValidPassword = await bcrypt.compare(password, user.hashedPassword);
    if (!isValidPassword) {
      // Başarısız giriş - deneme sayısını artır
      attempts.count++;
      attempts.lastAttempt = Date.now();
      loginAttempts.set(attemptKey, attempts);
      
      console.log(`Başarısız giriş denemesi: ${username} (IP: ${clientIP})`);
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı!' });
    }

    // Başarılı giriş - deneme sayısını sıfırla
    loginAttempts.delete(attemptKey);

    // Session token oluştur (daha güvenli)
    // Güvenli session token oluştur (UUID + timestamp + random)
    const sessionToken = uuidv4() + '-' + Date.now() + '-' + crypto.randomBytes(16).toString('hex');
    const sessionData = {
      username: user.username,
      originalUsername: user.originalUsername,
      loginTime: new Date(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 saat
      clientIP: clientIP,
      userAgent: req.get('User-Agent') || 'unknown'
    };

    sessions.set(sessionToken, sessionData);

    // Kullanıcı bilgilerini güncelle
    user.lastLogin = new Date();
    user.loginCount++;
    users.set(user.username, user);

    console.log(`Başarılı giriş: ${user.originalUsername} (IP: ${clientIP})`);

    res.json({
      success: true,
      message: 'Giriş başarılı!',
      sessionToken: sessionToken,
      username: user.originalUsername,
      lastLogin: user.lastLogin
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Giriş hatası!' });
  }
});

// Session kontrolü middleware'i
const checkSession = (req, res, next) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (!sessionToken) {
    return res.status(401).json({ error: 'Oturum gerekli!' });
  }

  const sessionData = sessions.get(sessionToken);
  if (!sessionData) {
    return res.status(401).json({ error: 'Geçersiz oturum!' });
  }

  // Session süresi kontrolü
  if (Date.now() > sessionData.expiresAt) {
    sessions.delete(sessionToken);
    return res.status(401).json({ error: 'Oturum süresi dolmuş!' });
  }

  // IP kontrolü (güvenlik için)
  if (sessionData.clientIP !== clientIP) {
    console.log(`Şüpheli oturum: IP değişimi ${sessionData.clientIP} -> ${clientIP}`);
    // IP değişimi durumunda oturumu sonlandır
    sessions.delete(sessionToken);
    return res.status(401).json({ error: 'Oturum güvenlik nedeniyle sonlandırıldı!' });
  }

  // Session'ı güncelle (son aktivite)
  sessionData.lastActivity = Date.now();
  sessions.set(sessionToken, sessionData);

  req.user = sessionData;
  next();
};

// Kullanıcı çıkış endpoint'i
app.post('/logout', (req, res) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (sessionToken && sessions.has(sessionToken)) {
    sessions.delete(sessionToken);
  }

  res.json({
    success: true,
    message: 'Çıkış başarılı!'
  });
});

// Chunk upload başlatma
app.post('/upload/start', (req, res) => {
  const { fileName, fileSize, totalChunks, sessionToken, isPublic } = req.body;
  
  if (!fileName || !fileSize || !totalChunks) {
    return res.status(400).json({ error: 'Eksik parametreler!' });
  }

  const uploadId = uuidv4();
  let uploaderUsername = null;

  // Kullanıcı girişi kontrolü (opsiyonel)
  if (sessionToken) {
    const sessionData = sessions.get(sessionToken);
    if (sessionData && Date.now() < sessionData.expiresAt) {
      uploaderUsername = sessionData.username;
    }
  }

  const fileInfo = {
    id: uploadId,
    originalName: fileName,
    size: parseInt(fileSize),
    totalChunks: parseInt(totalChunks),
    uploadedChunks: 0,
    chunks: [],
    uploadDate: new Date(),
    downloadCount: 0,
    status: 'uploading',
    uploaderUsername: uploaderUsername,
    isPublic: isPublic === true || isPublic === 'true' // Varsayılan olarak özel
  };

  chunks.set(uploadId, fileInfo);

  res.json({
    success: true,
    uploadId: uploadId,
    message: 'Chunk upload başlatıldı'
  });
});

// Chunk yükleme
app.post('/upload/chunk', upload.single('chunk'), (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks } = req.body;
    
    if (!req.file || !uploadId || chunkIndex === undefined) {
      return res.status(400).json({ error: 'Eksik parametreler!' });
    }

    const fileInfo = chunks.get(uploadId);
    if (!fileInfo) {
      return res.status(404).json({ error: 'Upload bulunamadı!' });
    }

    // Chunk'ı kaydet
    const chunkFilename = `${uploadId}_chunk_${chunkIndex}`;
    const chunkPath = path.join(__dirname, 'uploads', 'chunks', chunkFilename);
    
    fs.ensureDirSync(path.join(__dirname, 'uploads', 'chunks'));
    fs.writeFileSync(chunkPath, req.file.buffer);

    fileInfo.chunks.push({
      index: parseInt(chunkIndex),
      filename: chunkFilename,
      size: req.file.size
    });

    fileInfo.uploadedChunks++;

    // Tüm chunk'lar yüklendi mi kontrol et
    if (fileInfo.uploadedChunks === fileInfo.totalChunks) {
      // Dosyayı birleştir
      const finalFilename = `${uploadId}${path.extname(fileInfo.originalName)}`;
      const finalPath = path.join(__dirname, 'uploads', finalFilename);
      
      const writeStream = fs.createWriteStream(finalPath);
      
      // Chunk'ları sıralı olarak birleştir
      const sortedChunks = fileInfo.chunks.sort((a, b) => a.index - b.index);
      
      let currentChunk = 0;
      const mergeChunks = () => {
        if (currentChunk >= sortedChunks.length) {
          writeStream.end();
          
          // Final dosya bilgilerini güncelle
          fileInfo.filename = finalFilename;
          fileInfo.status = 'completed';
          files.set(uploadId, fileInfo);
          
          // Kullanıcının dosya listesine ekle
          if (fileInfo.uploaderUsername) {
            const user = users.get(fileInfo.uploaderUsername);
            if (user) {
              user.files.push(uploadId);
              users.set(fileInfo.uploaderUsername, user);
            }
          }
          
          chunks.delete(uploadId);
          
          // Geçici chunk dosyalarını sil
          sortedChunks.forEach(chunk => {
            const chunkPath = path.join(__dirname, 'uploads', 'chunks', chunk.filename);
            if (fs.existsSync(chunkPath)) {
              fs.unlinkSync(chunkPath);
            }
          });
          
          return;
        }
        
        const chunkPath = path.join(__dirname, 'uploads', 'chunks', sortedChunks[currentChunk].filename);
        const readStream = fs.createReadStream(chunkPath);
        
        readStream.pipe(writeStream, { end: false });
        readStream.on('end', () => {
          currentChunk++;
          mergeChunks();
        });
      };
      
      mergeChunks();
    }

    res.json({
      success: true,
      uploadedChunks: fileInfo.uploadedChunks,
      totalChunks: fileInfo.totalChunks,
      progress: Math.round((fileInfo.uploadedChunks / fileInfo.totalChunks) * 100)
    });

  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: 'Chunk yükleme hatası!' });
  }
});

// Normal dosya yükleme için ayrı multer
const normalUpload = multer({ 
  storage: storage,
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB limit - büyük dosyalar için
  },
  fileFilter: function (req, file, cb) {
    // Tüm dosya türlerine izin ver
    cb(null, true);
  }
});

// Normal dosya yükleme endpoint'i (küçük dosyalar için)
app.post('/upload', normalUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya seçilmedi!' });
    }

    const fileId = uuidv4();
    const password = req.body.password;
    const sessionToken = req.headers.authorization?.replace('Bearer ', '') || req.body.sessionToken;
    const isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
    
    let hashedPassword = null;
    let isPasswordProtected = false;
    let uploaderUsername = null;

    // Kullanıcı girişi kontrolü (opsiyonel)
    if (sessionToken) {
      const sessionData = sessions.get(sessionToken);
      if (sessionData && Date.now() < sessionData.expiresAt) {
        uploaderUsername = sessionData.username;
      }
    }

    // Şifre varsa hashle
    if (password) {
      if (password.length < 4 || password.length > 12 || password.includes(' ')) {
        return res.status(400).json({ error: 'Şifre en az 4, en fazla 12 karakter olmalı ve boşluk içermemelidir!' });
      }
      hashedPassword = await bcrypt.hash(password, 10);
      isPasswordProtected = true;
    }

    const fileInfo = {
      id: fileId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      uploadDate: new Date(),
      downloadCount: 0,
      status: 'completed',
      isPasswordProtected: isPasswordProtected,
      hashedPassword: hashedPassword,
      uploaderUsername: uploaderUsername,
      isPublic: isPublic === true || isPublic === 'true' // Varsayılan olarak özel
    };

    files.set(fileId, fileInfo);

    // Kullanıcının dosya listesine ekle
    if (uploaderUsername) {
      const user = users.get(uploaderUsername);
      if (user) {
        user.files.push(fileId);
        users.set(uploaderUsername, user);
      }
    }

    // İndirme linki (session token gerekli değil)
    const downloadUrl = `${req.protocol}://${req.get('host')}/download/${fileId}`;

    res.json({
      success: true,
      fileId: fileId,
      downloadUrl: downloadUrl,
      originalName: req.file.originalname,
      size: req.file.size,
      isPasswordProtected: isPasswordProtected,
      uploaderUsername: uploaderUsername,
      isPublic: fileInfo.isPublic
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Dosya yükleme hatası!' });
  }
});

// İndirme sayfası
app.get('/download/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const fileInfo = files.get(fileId);

  if (!fileInfo) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'download.html'));
  }

  const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
  
  // Dosya var mı kontrol et
  if (!fs.existsSync(filePath)) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'download.html'));
  }

  // Özel dosya kontrolü kaldırıldı - link ile erişim her zaman mümkün

  // Şifreli dosya ise özel sayfaya yönlendir
  if (fileInfo.isPasswordProtected) {
    return res.sendFile(path.join(__dirname, 'public', 'protected-download.html'));
  }

  // Normal indirme sayfasını göster
  res.sendFile(path.join(__dirname, 'public', 'download.html'));
});

// Şifre doğrulama endpoint'i
app.post('/verify-password/:fileId', async (req, res) => {
  const fileId = req.params.fileId;
  const { password } = req.body;
  const fileInfo = files.get(fileId);

  if (!fileInfo) {
    return res.status(404).json({ error: 'Dosya bulunamadı!' });
  }

  if (!fileInfo.isPasswordProtected) {
    return res.status(400).json({ error: 'Bu dosya şifre ile korunmuyor!' });
  }

  // Brute force koruması
  const clientIP = req.ip || req.connection.remoteAddress;
  const attemptKey = `${fileId}_${clientIP}`;
  const attempts = passwordAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };

  // Kilit kontrolü
  if (attempts.count >= MAX_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
    if (timeSinceLastAttempt < LOCKOUT_TIME) {
      const remainingTime = Math.ceil((LOCKOUT_TIME - timeSinceLastAttempt) / 60000);
      return res.status(429).json({ 
        error: `Çok fazla başarısız deneme! ${remainingTime} dakika sonra tekrar deneyin.`,
        locked: true,
        remainingTime: remainingTime
      });
    } else {
      // Kilit süresi dolmuş, sıfırla
      attempts.count = 0;
    }
  }

  try {
    // Şifre kontrolü
    const isValid = await bcrypt.compare(password, fileInfo.hashedPassword);
    
    if (isValid) {
      // Başarılı giriş - deneme sayısını sıfırla
      passwordAttempts.delete(attemptKey);
      
      // Session token oluştur (basit UUID)
      // Güvenli session token oluştur (UUID + timestamp + random)
    const sessionToken = uuidv4() + '-' + Date.now() + '-' + crypto.randomBytes(16).toString('hex');
      fileInfo.sessionToken = sessionToken;
      fileInfo.sessionExpiry = Date.now() + (30 * 60 * 1000); // 30 dakika
      files.set(fileId, fileInfo);

      res.json({ 
        success: true, 
        sessionToken: sessionToken,
        message: 'Şifre doğru! Dosya bilgileri yükleniyor...'
      });
    } else {
      // Başarısız giriş - deneme sayısını artır
      attempts.count++;
      attempts.lastAttempt = Date.now();
      passwordAttempts.set(attemptKey, attempts);

      const remainingAttempts = MAX_ATTEMPTS - attempts.count;
      res.status(401).json({ 
        error: `Şifre hatalı! Kalan deneme hakkı: ${remainingAttempts}`,
        remainingAttempts: remainingAttempts
      });
    }
  } catch (error) {
    console.error('Password verification error:', error);
    res.status(500).json({ error: 'Şifre doğrulama hatası!' });
  }
});

// Dosya indirme endpoint'i
app.get('/download-file/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const sessionToken = req.query.token;
  const fileInfo = files.get(fileId);

  if (!fileInfo) {
    return res.status(404).send('Dosya bulunamadı!');
  }

  const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
  
  // Dosya var mı kontrol et
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Dosya bulunamadı!');
  }

  // Özel dosya kontrolü kaldırıldı - link ile erişim her zaman mümkün

  // Şifreli dosya ise session token kontrolü
  if (fileInfo.isPasswordProtected) {
    if (!sessionToken || sessionToken !== fileInfo.sessionToken) {
      return res.status(403).send('Geçersiz oturum! Şifre ile tekrar giriş yapın.');
    }

    // Session süresi kontrolü
    if (Date.now() > fileInfo.sessionExpiry) {
      return res.status(403).send('Oturum süresi dolmuş! Şifre ile tekrar giriş yapın.');
    }
  }

  // İndirme sayısını artır
  fileInfo.downloadCount++;
  fileInfo.lastDownloadTime = Date.now(); // Son indirme zamanını güncelle
  files.set(fileId, fileInfo);

  // Mobil cihazlar için uygun header'lar
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.originalName}"`);
  res.setHeader('Content-Length', fileInfo.size);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Dosyayı stream olarak gönder
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    console.error('File stream error:', err);
    if (!res.headersSent) {
      res.status(500).send('Dosya okuma hatası!');
    }
  });
});

// Dosya bilgilerini getir
app.get('/file/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const sessionToken = req.query.token;
  const fileInfo = files.get(fileId);

  if (!fileInfo) {
    return res.status(404).json({ error: 'Dosya bulunamadı!' });
  }

  // Özel dosya kontrolü kaldırıldı - link ile erişim her zaman mümkün

  // Şifreli dosya ise session token kontrolü
  if (fileInfo.isPasswordProtected) {
    if (!sessionToken || sessionToken !== fileInfo.sessionToken) {
      return res.status(403).json({ error: 'Geçersiz oturum! Şifre ile tekrar giriş yapın.' });
    }

    // Session süresi kontrolü
    if (Date.now() > fileInfo.sessionExpiry) {
      return res.status(403).json({ error: 'Oturum süresi dolmuş! Şifre ile tekrar giriş yapın.' });
    }
  }

  res.json({
    originalName: fileInfo.originalName,
    size: fileInfo.size,
    uploadDate: fileInfo.uploadDate,
    downloadCount: fileInfo.downloadCount,
    fileId: fileId,
    isPasswordProtected: fileInfo.isPasswordProtected,
    uploaderUsername: fileInfo.uploaderUsername,
    isPublic: fileInfo.isPublic
  });
});

// Kullanıcı adına göre dosya arama
app.get('/search/:username', (req, res) => {
  try {
    const searchUsername = req.params.username.toLowerCase();
    const user = users.get(searchUsername);

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
    }

    // Kullanıcının public dosyalarını getir
    const userFiles = user.files
      .map(fileId => files.get(fileId))
      .filter(fileInfo => fileInfo && fileInfo.isPublic && fileInfo.status === 'completed')
      .map(fileInfo => ({
        id: fileInfo.id,
        originalName: fileInfo.originalName,
        size: fileInfo.size,
        uploadDate: fileInfo.uploadDate,
        downloadCount: fileInfo.downloadCount,
        isPasswordProtected: fileInfo.isPasswordProtected,
        downloadUrl: `${req.protocol}://${req.get('host')}/download/${fileInfo.id}`
      }))
      .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)); // En yeni önce

    res.json({
      success: true,
      username: user.originalUsername,
      files: userFiles,
      totalFiles: userFiles.length
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Arama hatası!' });
  }
});

// Kullanıcının kendi dosyalarını listele (giriş gerekli)
app.get('/my-files', checkSession, (req, res) => {
  try {
    const user = users.get(req.user.username);
    
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı!' });
    }

    const userFiles = user.files
      .map(fileId => files.get(fileId))
      .filter(fileInfo => fileInfo && fileInfo.status === 'completed')
      .map(fileInfo => ({
        id: fileInfo.id,
        originalName: fileInfo.originalName,
        size: fileInfo.size,
        uploadDate: fileInfo.uploadDate,
        downloadCount: fileInfo.downloadCount,
        isPasswordProtected: fileInfo.isPasswordProtected,
        isPublic: fileInfo.isPublic,
        downloadUrl: `${req.protocol}://${req.get('host')}/download/${fileInfo.id}`
      }))
      .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    res.json({
      success: true,
      username: user.originalUsername,
      files: userFiles,
      totalFiles: userFiles.length
    });

  } catch (error) {
    console.error('My files error:', error);
    res.status(500).json({ error: 'Dosya listesi hatası!' });
  }
});

// Dosya erişim kontrolü güncelleme (public/private)
app.put('/file/:fileId/visibility', checkSession, (req, res) => {
  try {
    const fileId = req.params.fileId;
    const { isPublic } = req.body;
    const fileInfo = files.get(fileId);

    if (!fileInfo) {
      return res.status(404).json({ error: 'Dosya bulunamadı!' });
    }

    // Sadece dosya sahibi erişim kontrolünü değiştirebilir
    if (fileInfo.uploaderUsername !== req.user.username) {
      return res.status(403).json({ error: 'Bu dosyayı değiştirme yetkiniz yok!' });
    }

    fileInfo.isPublic = isPublic === true || isPublic === 'true';
    files.set(fileId, fileInfo);

    res.json({
      success: true,
      message: `Dosya ${fileInfo.isPublic ? 'herkese açık' : 'özel'} olarak ayarlandı`,
      isPublic: fileInfo.isPublic
    });

  } catch (error) {
    console.error('Visibility update error:', error);
    res.status(500).json({ error: 'Erişim kontrolü güncelleme hatası!' });
  }
});

// Dosya silme endpoint'i
app.delete('/file/:fileId', checkSession, (req, res) => {
  try {
    const fileId = req.params.fileId;
    const fileInfo = files.get(fileId);

    if (!fileInfo) {
      return res.status(404).json({ error: 'Dosya bulunamadı!' });
    }

    // Dosya sahibi kontrolü
    if (fileInfo.uploaderUsername !== req.user.username) {
      return res.status(403).json({ error: 'Bu dosyayı silme yetkiniz yok!' });
    }

    // Dosyayı diskten sil
    const filePath = path.join(__dirname, 'uploads', fileInfo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Dosya bilgisini veritabanından sil
    files.delete(fileId);

    res.json({ 
      success: true, 
      message: 'Dosya başarıyla silindi!'
    });
  } catch (error) {
    console.error('Dosya silme hatası:', error);
    res.status(500).json({ error: 'Dosya silinirken hata oluştu!' });
  }
});

// QR kod oluştur
app.get('/qr/:fileId', async (req, res) => {
  const fileId = req.params.fileId;
  const fileInfo = files.get(fileId);

  if (!fileInfo) {
    return res.status(404).send('Dosya bulunamadı!');
  }

  try {
    const downloadUrl = `${req.protocol}://${req.get('host')}/download/${fileId}`;
    const qrCodeDataURL = await QRCode.toDataURL(downloadUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#00d4ff',
        light: '#1a1a2e'
      }
    });

    res.json({
      qrCode: qrCodeDataURL,
      downloadUrl: downloadUrl,
      fileName: fileInfo.originalName
    });
  } catch (error) {
    console.error('QR Code error:', error);
    res.status(500).json({ error: 'QR kod oluşturulamadı!' });
  }
});

// Sunucuyu başlat - Railway için optimize edildi
const server = app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda çalışıyor`);
  console.log(`🌐 http://localhost:${PORT} adresinden erişebilirsiniz`);
  console.log(`🏥 Healthcheck: http://localhost:${PORT}/health`);
  
  // Railway için özel log
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.log('🚂 Railway ortamında çalışıyor');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM alındı, sunucu kapatılıyor...');
  server.close(() => {
    console.log('✅ Sunucu başarıyla kapatıldı');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT alındı, sunucu kapatılıyor...');
  server.close(() => {
    console.log('✅ Sunucu başarıyla kapatıldı');
    process.exit(0);
  });
});

// Unhandled errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

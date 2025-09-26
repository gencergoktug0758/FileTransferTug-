const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const QRCode = require('qrcode');
const compression = require('compression');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Vercel için static dosyaları serve et
app.use(express.static(path.join(__dirname, '../public')));

// Uploads klasörünü oluştur (Vercel'de geçici)
const uploadsDir = '/tmp/uploads';
fs.ensureDirSync(uploadsDir);

// Veritabanı şifreleme anahtarı
const DB_ENCRYPTION_KEY = crypto.scryptSync('FileTransferTug2024SecureKey!@#$%^&*()_+{}|:"<>?[]\\;\',./`~', 'salt', 32);
const DB_IV_LENGTH = 16;

// Veritabanı dosya yolları (Vercel'de /tmp kullan)
const DB_PATHS = {
  users: '/tmp/users.enc',
  files: '/tmp/files.enc',
  sessions: '/tmp/sessions.enc',
  attempts: '/tmp/attempts.enc'
};

// Veritabanı şifreleme fonksiyonları
function encryptData(data) {
  const iv = crypto.randomBytes(DB_IV_LENGTH);
  const cipher = crypto.createCipher('aes-256-cbc', DB_ENCRYPTION_KEY);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedData) {
  try {
    const textParts = encryptedData.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipher('aes-256-cbc', DB_ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    return [];
  }
}

// Veritabanı işlemleri
function readDatabase(dbName) {
  try {
    if (fs.existsSync(DB_PATHS[dbName])) {
      const data = fs.readFileSync(DB_PATHS[dbName], 'utf8');
      return decryptData(data);
    }
    return [];
  } catch (error) {
    console.error(`Database read error (${dbName}):`, error);
    return [];
  }
}

function writeDatabase(dbName, data) {
  try {
    const encryptedData = encryptData(data);
    fs.writeFileSync(DB_PATHS[dbName], encryptedData, 'utf8');
    return true;
  } catch (error) {
    console.error(`Database write error (${dbName}):`, error);
    return false;
  }
}

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4();
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'FileTransfer API is running' });
});

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Login sayfası
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Download sayfası
app.get('/download.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/download.html'));
});

// Dosya yükleme
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya seçilmedi' });
    }

    const fileId = req.file.filename;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    const fileType = req.file.mimetype;
    const password = req.body.password || null;
    const isPublic = req.body.isPublic === 'true';
    const userId = req.body.userId || null;

    // Dosya bilgilerini veritabanına kaydet
    const files = readDatabase('files');
    const fileData = {
      id: fileId,
      fileName: fileName,
      fileSize: fileSize,
      fileType: fileType,
      uploadDate: new Date().toISOString(),
      password: password ? await bcrypt.hash(password, 10) : null,
      isPublic: isPublic,
      userId: userId,
      downloadCount: 0
    };

    files.push(fileData);
    writeDatabase('files', files);

    // QR kod oluştur
    const downloadUrl = `${req.protocol}://${req.get('host')}/download.html?id=${fileId}`;
    const qrCode = await QRCode.toDataURL(downloadUrl);

    res.json({
      success: true,
      fileId: fileId,
      fileName: fileName,
      downloadUrl: downloadUrl,
      qrCode: qrCode,
      message: 'Dosya başarıyla yüklendi'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Dosya yükleme hatası' });
  }
});

// Dosya indirme
app.get('/api/download/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    const { password } = req.query;

    const files = readDatabase('files');
    const file = files.find(f => f.id === fileId);

    if (!file) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }

    // Şifre kontrolü
    if (file.password && !password) {
      return res.status(401).json({ error: 'Bu dosya şifreli', requiresPassword: true });
    }

    if (file.password && password) {
      const isValidPassword = bcrypt.compareSync(password, file.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Yanlış şifre' });
      }
    }

    // Download sayısını artır
    file.downloadCount++;
    writeDatabase('files', files);

    const filePath = path.join(uploadsDir, fileId);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Dosya fiziksel olarak bulunamadı' });
    }

    res.download(filePath, file.fileName);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Dosya indirme hatası' });
  }
});

// Dosya bilgilerini getir
app.get('/api/file/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    const files = readDatabase('files');
    const file = files.find(f => f.id === fileId);

    if (!file) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }

    // Şifreli dosyalar için şifre kontrolü
    if (file.password) {
      return res.json({
        id: file.id,
        fileName: file.fileName,
        fileSize: file.fileSize,
        fileType: file.fileType,
        uploadDate: file.uploadDate,
        isPublic: file.isPublic,
        requiresPassword: true,
        downloadCount: file.downloadCount
      });
    }

    res.json({
      id: file.id,
      fileName: file.fileName,
      fileSize: file.fileSize,
      fileType: file.fileType,
      uploadDate: file.uploadDate,
      isPublic: file.isPublic,
      requiresPassword: false,
      downloadCount: file.downloadCount
    });

  } catch (error) {
    console.error('File info error:', error);
    res.status(500).json({ error: 'Dosya bilgisi alınamadı' });
  }
});

// Kullanıcı kayıt
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tüm alanlar gerekli' });
    }

    const users = readDatabase('users');
    
    // Kullanıcı kontrolü
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Bu email zaten kayıtlı' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      username: username,
      email: email,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeDatabase('users', users);

    res.json({ success: true, message: 'Kullanıcı başarıyla kaydedildi' });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Kayıt hatası' });
  }
});

// Kullanıcı giriş
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email ve şifre gerekli' });
    }

    const users = readDatabase('users');
    const user = users.find(u => u.email === email);

    if (!user) {
      return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Yanlış şifre' });
    }

    // Session oluştur
    const sessions = readDatabase('sessions');
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 saat
    };

    sessions.push(session);
    writeDatabase('sessions', sessions);

    res.json({
      success: true,
      sessionId: sessionId,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Giriş hatası' });
  }
});

// Kullanıcı dosyalarını getir
app.get('/api/user/files', (req, res) => {
  try {
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(401).json({ error: 'Session gerekli' });
    }

    const sessions = readDatabase('sessions');
    const session = sessions.find(s => s.id === sessionId && new Date(s.expiresAt) > new Date());

    if (!session) {
      return res.status(401).json({ error: 'Geçersiz session' });
    }

    const files = readDatabase('files');
    const userFiles = files.filter(f => f.userId === session.userId);

    res.json({ files: userFiles });

  } catch (error) {
    console.error('User files error:', error);
    res.status(500).json({ error: 'Dosyalar alınamadı' });
  }
});

// Vercel için export
module.exports = app;

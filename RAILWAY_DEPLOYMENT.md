# DosyaPaylaşım - Railway Deployment

Bu proje Railway.app üzerinde deploy edilmek üzere optimize edilmiştir.

## Railway Deployment

### Otomatik Deploy
1. GitHub repository'sini Railway'e bağla
2. Railway otomatik olarak deploy edecek

### Manuel Deploy
```bash
# Railway CLI ile
railway login
railway link
railway up
```

## Environment Variables

Railway otomatik olarak şu environment variable'ları ayarlar:
- `PORT` - Railway tarafından otomatik ayarlanır
- `RAILWAY_ENVIRONMENT` - Railway ortamını belirtir
- `NODE_ENV` - Production/Development ortamını belirtir

## Healthcheck

Railway healthcheck endpoint'i: `/health`

Bu endpoint şu bilgileri döner:
- Status: OK
- Timestamp
- Uptime
- Environment

## Sorun Giderme

### Healthcheck Failure
- `/health` endpoint'inin çalıştığını kontrol edin
- Port'un doğru dinlendiğini kontrol edin
- HTTPS redirect'inin devre dışı olduğunu kontrol edin

### Build Hatası
- `bcryptjs` kullanıldığından emin olun (native dependency yok)
- `package-lock.json`'un güncel olduğundan emin olun

## Logs

Railway dashboard'dan logları kontrol edebilirsiniz:
- Server başlatma logları
- Healthcheck durumu
- Error logları

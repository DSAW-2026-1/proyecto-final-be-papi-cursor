require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Importar rutas
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const conversationRoutes = require('./routes/conversations');
const reviewRoutes = require('./routes/reviews');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Seguridad: headers HTTP (XSS, clickjacking, MIME sniffing, etc.) ──────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // permite imágenes desde otros orígenes
}));

// ── CORS: solo aceptar el origen del frontend ──────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// En desarrollo permitir localhost aunque no esté en la variable de entorno
if (!isProd) {
  ALLOWED_ORIGINS.push('http://localhost:3001', 'http://localhost:3000');
}

app.use(cors({
  origin: (origin, cb) => {
    // Permitir solicitudes sin origin (Postman, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origen no permitido — ${origin}`));
  },
  credentials: true,
}));

// ── Rate limiting: protección contra fuerza bruta en auth ─────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ventana de 15 minutos
  max: 20,                   // máx 20 intentos por IP en la ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Por favor espera 15 minutos antes de volver a intentarlo.' },
  skip: () => !isProd,       // solo aplica en producción
});

// ── Límite de tamaño del body (previene payloads maliciosos) ──────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'Unisabana Marketplace API',
    version: '1.0.0',
    status: 'running'
  });
});

// ── Manejo de errores: nunca exponer detalles internos en producción ───────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: isProd ? 'Error interno del servidor.' : err.message
  });
});

// ── Iniciar servidor ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📝 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;

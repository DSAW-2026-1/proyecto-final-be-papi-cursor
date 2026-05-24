const jwt = require('jsonwebtoken');

// Middleware para autenticar el token JWT
// También verifica suspensión: si la cuenta está suspendida devuelve 403
// con { error, suspended: true } para que el frontend pueda cerrar sesión.
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'Acceso denegado. Token no proporcionado.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'unisabana-marketplace-secret-2026');
    req.user = decoded;

    // Verificar suspensión contra la BD (el token no refleja cambios post-emisión)
    const database = require('../database');
    const user = await database.users.findById(decoded.id);

    if (user && user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      const fecha = new Date(user.suspendedUntil).toLocaleDateString('es-CO', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      return res.status(403).json({
        error: `Tu cuenta está suspendida hasta el ${fecha}. Contacta al administrador.`,
        suspended: true
      });
    }

    // Auto-rehabilitar si ya pasó el tiempo de suspensión
    if (user && user.status === 'suspended' && user.suspendedUntil && new Date(user.suspendedUntil) <= new Date()) {
      await database.users.update(decoded.id, { status: 'active', suspendedUntil: null });
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado. Por favor inicia sesión nuevamente.'
      });
    }
    return res.status(403).json({
      error: 'Token inválido.'
    });
  }
};

// Middleware para verificar si el usuario tiene un rol específico
const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Usuario no autenticado.'
      });
    }

    const hasRole = roles.some(role => req.user.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'No tienes permisos para acceder a este recurso.'
      });
    }

    next();
  };
};

// Middleware para verificar si el usuario es administrador
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Usuario no autenticado.'
    });
  }

  if (!req.user.roles.includes('admin')) {
    return res.status(403).json({
      error: 'Acceso denegado. Se requiere rol de administrador.'
    });
  }

  next();
};

// checkSuspension se mantiene por compatibilidad pero ya no es necesario
// usarlo explícitamente — authenticateToken lo hace automáticamente.
const checkSuspension = (req, res, next) => next();

module.exports = {
  authenticateToken,
  authorizeRole,
  isAdmin,
  checkSuspension
};

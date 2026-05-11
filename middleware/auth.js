const jwt = require('jsonwebtoken');

// Middleware para autenticar el token JWT
const authenticateToken = (req, res, next) => {
  // Obtener el header de autorización
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Acceso denegado. Token no proporcionado.' 
    });
  }

  try {
    // Verificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'unisabana-marketplace-secret-2026');
    
    // Agregar la información del usuario a la request
    req.user = decoded;
    
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

    // Verificar si el usuario tiene alguno de los roles permitidos
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

// Middleware para verificar que el usuario no esté suspendido
// Usar en rutas de compra/venta
const checkSuspension = async (req, res, next) => {
  try {
    const database = require('../database');
    const user = await database.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      const fecha = new Date(user.suspendedUntil).toLocaleDateString('es-CO', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      return res.status(403).json({ error: `Cuenta suspendida hasta ${fecha}.` });
    }

    // Si ya pasó la suspensión, limpiar automáticamente
    if (user.status === 'suspended' && user.suspendedUntil && new Date(user.suspendedUntil) <= new Date()) {
      await database.users.update(req.user.id, { status: 'active', suspendedUntil: null });
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticateToken,
  authorizeRole,
  isAdmin,
  checkSuspension
};

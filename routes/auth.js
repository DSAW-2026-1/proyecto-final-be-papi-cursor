const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ticket 1: Generar registro con validación de correo institucional
router.post('/register', async (req, res) => {
  try {
    // Trim para evitar espacios accidentales
    const email    = (req.body.email    || '').trim().toLowerCase();
    const password = (req.body.password || '');
    const name     = (req.body.name     || '').trim();

    // Validar que los campos requeridos estén presentes
    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Por favor proporciona email, contraseña y nombre.'
      });
    }

    // El rol admin NUNCA se asigna desde registro público
    if (req.body.roles && req.body.roles.includes('admin')) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    // Validar correo institucional
    // Debe tener al menos 5 caracteres antes del @ y terminar en @unisabana.edu.co
    const emailRegex = /^[a-zA-Z0-9._-]{5,}@unisabana\.edu\.co$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'El correo debe ser institucional (@unisabana.edu.co) y tener al menos 5 caracteres antes del @.'
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await database.users.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'Este correo ya está registrado.'
      });
    }

    // Validar contraseña (mínimo 6 caracteres)
    if (password.length < 6) {
      return res.status(400).json({
        error: 'La contraseña debe tener al menos 6 caracteres.'
      });
    }

    // Hashear la contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Crear el nuevo usuario
    const newUser = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      name,
      roles: ['buyer'], // Por defecto, todos son compradores
      createdAt: new Date().toISOString()
    };

    await database.users.create(newUser);

    // No devolver la contraseña en la respuesta
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      message: 'Usuario registrado exitosamente.',
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      error: 'Error al registrar usuario.'
    });
  }
});

// Ticket 21: Inicio de sesión y entrega de llave de acceso
router.post('/login', async (req, res) => {
  try {
    const email    = (req.body.email    || '').trim().toLowerCase();
    const password = (req.body.password || '');

    // Validar que los campos requeridos estén presentes
    if (!email || !password) {
      return res.status(400).json({
        error: 'Por favor proporciona email y contraseña.'
      });
    }

    // Buscar el usuario por email
    const user = await database.users.findByEmail(email);

    if (!user) {
      return res.status(401).json({
        error: 'Credenciales inválidas.'
      });
    }

    // Verificar la contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Credenciales inválidas.'
      });
    }

    // Verificar si la cuenta está suspendida
    if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      const fecha = new Date(user.suspendedUntil).toLocaleDateString('es-CO', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      return res.status(403).json({
        error: `Tu cuenta está suspendida hasta el ${fecha}. Contacta al administrador.`,
        suspended: true
      });
    }

    // Generar el token JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        roles: user.roles
      },
      process.env.JWT_SECRET || 'unisabana-marketplace-secret-2026',
      { expiresIn: '24h' }
    );

    // No devolver la contraseña en la respuesta
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error al iniciar sesión.'
    });
  }
});

// Ruta para obtener el perfil del usuario autenticado
// Incluye sellerRating si el usuario es vendedor (TRD §4.5)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await database.users.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado.'
      });
    }

    const { password: _, ...userWithoutPassword } = user;

    // Agregar calificación promedio si es vendedor (visible en perfil — TRD §4.5)
    if (user.roles.includes('seller')) {
      const sellerRating = await database.reviews.calculateSellerRating(user.id);
      userWithoutPassword.sellerRating = sellerRating; // null si < 20 reseñas
    }

    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
});

// PUT /auth/profile — actualizar datos del perfil (nombre, carrera, foto)
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await database.users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const updates = {};

    if (req.body.name !== undefined) {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
      updates.name = name;
    }

    if (req.body.career !== undefined) {
      updates.career = req.body.career.trim() || null;
    }

    if (req.body.photo !== undefined) {
      // Validar que sea una URL válida o vacío
      const photo = req.body.photo.trim();
      if (photo && !/^https?:\/\/.+/.test(photo)) {
        return res.status(400).json({ error: 'La foto debe ser una URL válida (http/https).' });
      }
      updates.photo = photo || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron campos para actualizar.' });
    }

    const updated = await database.users.update(user.id, updates);
    const { password: _, ...userWithoutPassword } = updated;

    res.json({ message: 'Perfil actualizado exitosamente.', user: userWithoutPassword });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error al actualizar el perfil.' });
  }
});

// Ruta para actualizar el rol del usuario (agregar rol de vendedor)
router.post('/become-seller', authenticateToken, async (req, res) => {
  const user = await database.users.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      error: 'Usuario no encontrado.'
    });
  }

  if (user.roles.includes('seller')) {
    return res.status(400).json({
      error: 'Ya tienes el rol de vendedor.'
    });
  }

  user.roles.push('seller');
  await database.users.update(user.id, { roles: user.roles });

  const { password: _, ...userWithoutPassword } = user;

  res.json({
    message: 'Ahora eres un vendedor.',
    user: userWithoutPassword
  });
});

// POST /auth/admin-login — login exclusivo para administradores
router.post('/admin-login', async (req, res) => {
  try {
    const email    = (req.body.email    || '').trim().toLowerCase();
    const password = (req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Por favor proporciona email y contraseña.' });
    }
    const user = await database.users.findByEmail(email);
    if (!user || !user.roles.includes('admin')) {
      return res.status(401).json({ error: 'Credenciales inválidas o sin permisos de administrador.' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciales inválidas o sin permisos de administrador.' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, roles: user.roles },
      process.env.JWT_SECRET || 'unisabana-marketplace-secret-2026',
      { expiresIn: '8h' }
    );
    const { password: _, ...userWithoutPassword } = user;
    res.json({ message: 'Inicio de sesión de administrador exitoso.', token, user: userWithoutPassword });
  } catch (error) {
    console.error('Error en admin-login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// Cambiar contraseña del usuario autenticado
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Por favor proporciona la contraseña actual y la nueva.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const user = await database.users.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Verificar que la contraseña actual sea correcta
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    }

    // Hashear y guardar la nueva contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await database.users.update(user.id, { password: hashedPassword });

    res.json({ message: 'Contraseña actualizada exitosamente.' });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
});

// Ruta para quitar el rol de vendedor
router.post('/leave-seller', authenticateToken, async (req, res) => {
  const user = await database.users.findById(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  if (!user.roles.includes('seller')) {
    return res.status(400).json({ error: 'No tienes el rol de vendedor.' });
  }

  user.roles = user.roles.filter(r => r !== 'seller');
  await database.users.update(user.id, { roles: user.roles });

  const { password: _, ...userWithoutPassword } = user;

  res.json({
    message: 'Has dejado de ser vendedor.',
    user: userWithoutPassword
  });
});

module.exports = router;

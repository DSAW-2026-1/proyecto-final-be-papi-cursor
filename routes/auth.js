const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
// ⚠️ DB en memoria: los datos se pierden entre cold-starts en Vercel. Pendiente migración a PostgreSQL.
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ticket 1: Generar registro con validación de correo institucional
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validar que los campos requeridos estén presentes
    if (!email || !password || !name) {
      return res.status(400).json({ 
        error: 'Por favor proporciona email, contraseña y nombre.' 
      });
    }

    // Bloquear intento de registrar admin desde endpoint público
    if (email && email.toLowerCase().includes('admin')) {
      // Verificación extra: si el body pide explícitamente rol admin
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
    const { email, password } = req.body;

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
router.get('/profile', authenticateToken, async (req, res) => {
  const user = await database.users.findById(req.user.id);
  
  if (!user) {
    return res.status(404).json({ 
      error: 'Usuario no encontrado.' 
    });
  }

  const { password: _, ...userWithoutPassword } = user;
  
  res.json({ user: userWithoutPassword });
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
    const { email, password } = req.body;
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

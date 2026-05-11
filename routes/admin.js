const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const database = require('../database');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users    = await database.users.getAll();
    const products = await database.products.getAll();
    const orders   = await database.orders.getAll();

    const activeProducts   = products.filter(p => p.isActive && !p.hidden);
    const pendingOrders    = orders.filter(o => o.status === 'pending');
    const deliveredOrders  = orders.filter(o => o.status === 'delivered');
    const totalRevenue     = deliveredOrders.reduce((sum, o) => sum + Number(o.total), 0);

    res.json({
      dashboard: {
        users:    { total: users.length, buyers: users.filter(u => u.roles.includes('buyer')).length, sellers: users.filter(u => u.roles.includes('seller')).length },
        products: { total: products.length, active: activeProducts.length, hidden: products.filter(p => p.hidden).length },
        orders:   { total: orders.length, pending: pendingOrders.length, delivered: deliveredOrders.length },
        revenue:  { total: parseFloat(totalRevenue.toFixed(2)), currency: 'COP' },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error al obtener dashboard:', error);
    res.status(500).json({ error: 'Error al obtener las métricas del dashboard.' });
  }
});

// ── Gestión de usuarios ───────────────────────────────────────────────────────

// GET /admin/users?search=
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let users = await database.users.getAll();

    if (search) {
      const q = search.toLowerCase();
      users = users.filter(u =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }

    const usersWithoutPasswords = users.map(({ password, ...u }) => u);
    res.json({ count: usersWithoutPasswords.length, users: usersWithoutPasswords });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
});

// POST /admin/users — crear usuario con cualquier rol (incluyendo admin)
router.post('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { email, password, name, roles = ['buyer'] } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password y name son requeridos.' });
    }
    const existing = await database.users.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Este correo ya está registrado.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(), email, password: hashedPassword, name,
      roles: Array.isArray(roles) ? roles : [roles],
      status: 'active', createdAt: new Date().toISOString()
    };
    await database.users.create(newUser);
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ message: 'Usuario creado exitosamente.', user: userWithoutPassword });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error al crear el usuario.' });
  }
});

// DELETE /admin/users/:id
router.delete('/users/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const user = await database.users.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    }
    await database.users.delete(req.params.id);
    res.json({ message: 'Usuario eliminado exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error al eliminar el usuario.' });
  }
});

// PATCH /admin/users/:id/suspend — suspender por N días
router.patch('/users/:id/suspend', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { days } = req.body;
    if (!days || isNaN(days) || days < 1) {
      return res.status(400).json({ error: 'Proporciona un número de días válido (mínimo 1).' });
    }
    const user = await database.users.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const updated = await database.users.update(req.params.id, {
      status: 'suspended',
      suspendedUntil
    });
    const { password: _, ...userWithoutPassword } = updated;
    res.json({
      message: `Usuario suspendido hasta ${suspendedUntil}.`,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error al suspender usuario:', error);
    res.status(500).json({ error: 'Error al suspender el usuario.' });
  }
});

// PUT /admin/users/:id/status — rehabilitar usuario (mantener compatibilidad)
router.put('/users/:id/status', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['suspended', 'active'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use "suspended" or "active".' });
    }
    const user = await database.users.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const updates = { status };
    if (status === 'active') updates.suspendedUntil = null;

    const updatedUser = await database.users.update(req.params.id, updates);
    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json({
      message: `Usuario ${status === 'suspended' ? 'suspendido' : 'rehabilitado'} exitosamente.`,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error al actualizar estado del usuario:', error);
    res.status(500).json({ error: 'Error al actualizar el estado del usuario.' });
  }
});

// ── Gestión de productos ──────────────────────────────────────────────────────

// GET /admin/products?search=
router.get('/products', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let products = await database.products.getAll();

    if (search) {
      const q = search.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    res.json({ count: products.length, products });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener los productos.' });
  }
});

// DELETE /admin/products/:id — soft delete
router.delete('/products/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const product = await database.products.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });

    await database.products.update(req.params.id, { isActive: false });
    res.json({ message: 'Producto eliminado por administrador.', productId: req.params.id });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error al eliminar el producto.' });
  }
});

// PATCH /admin/products/:id/hide — ocultar/mostrar producto
router.patch('/products/:id/hide', authenticateToken, isAdmin, async (req, res) => {
  try {
    const product = await database.products.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });

    const hidden = !product.hidden; // toggle
    const updated = await database.products.update(req.params.id, { hidden });
    res.json({
      message: hidden ? 'Producto ocultado.' : 'Producto visible nuevamente.',
      product: updated
    });
  } catch (error) {
    console.error('Error al ocultar producto:', error);
    res.status(500).json({ error: 'Error al ocultar el producto.' });
  }
});

// ── Órdenes ───────────────────────────────────────────────────────────────────
router.get('/orders', authenticateToken, isAdmin, async (req, res) => {
  try {
    const orders = await database.orders.getAll();
    res.json({ count: orders.length, orders });
  } catch (error) {
    console.error('Error al obtener órdenes:', error);
    res.status(500).json({ error: 'Error al obtener las órdenes.' });
  }
});

// ── Reportes ──────────────────────────────────────────────────────────────────
router.get('/reports', authenticateToken, isAdmin, async (req, res) => {
  try {
    const reports = await database.reports.getAll();
    res.json({ reports });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({ error: 'Error al obtener los reportes.' });
  }
});

router.put('/reports/:id/resolve', authenticateToken, isAdmin, async (req, res) => {
  try {
    const report = await database.reports.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado.' });

    const updatedReport = await database.reports.update(req.params.id, {
      status: 'resolved', resolvedAt: new Date().toISOString()
    });
    res.json({ message: 'Reporte resuelto exitosamente.', report: updatedReport });
  } catch (error) {
    console.error('Error al resolver reporte:', error);
    res.status(500).json({ error: 'Error al resolver el reporte.' });
  }
});

// ── Crear admin (inicialización) ──────────────────────────────────────────────
router.post('/create-admin', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Por favor proporciona email, contraseña y nombre.' });
    }
    const allUsers = await database.users.getAll();
    const existingAdmin = allUsers.find(u => u.roles.includes('admin'));
    if (existingAdmin) {
      return res.status(400).json({ error: 'Ya existe un administrador en el sistema.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = {
      id: uuidv4(), email, password: hashedPassword, name,
      roles: ['admin', 'buyer', 'seller'],
      status: 'active', createdAt: new Date().toISOString()
    };
    await database.users.create(admin);
    const { password: _, ...adminWithoutPassword } = admin;
    res.status(201).json({ message: 'Administrador creado exitosamente.', user: adminWithoutPassword });
  } catch (error) {
    console.error('Error al crear admin:', error);
    res.status(500).json({ error: 'Error al crear el administrador.' });
  }
});

module.exports = router;

// ✅ routes/admin.js — completado

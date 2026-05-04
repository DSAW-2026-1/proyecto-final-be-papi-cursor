const express = require('express');
const database = require('../database');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Ticket 8: Ver métricas básicas del marketplace (dashboard)
router.get('/dashboard', authenticateToken, isAdmin, (req, res) => {
  try {
    // Obtener todos los usuarios
    const users = database.users.getAll();
    
    // Obtener todos los productos activos
    const products = database.products.getAll();
    const activeProducts = products.filter(p => p.isActive);
    
    // Obtener todas las órdenes
    const orders = database.orders.getAll();
    const pendingOrders = orders.filter(o => o.status === 'pending');
    const deliveredOrders = orders.filter(o => o.status === 'delivered');
    
    // Calcular ingresos totales
    const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.total, 0);
    
    // Contar vendedores
    const sellers = users.filter(u => u.roles.includes('seller'));
    
    // Contar compradores
    const buyers = users.filter(u => u.roles.includes('buyer'));

    const dashboard = {
      users: {
        total: users.length,
        buyers: buyers.length,
        sellers: sellers.length
      },
      products: {
        total: products.length,
        active: activeProducts.length,
        inactive: products.length - activeProducts.length
      },
      orders: {
        total: orders.length,
        pending: pendingOrders.length,
        delivered: deliveredOrders.length
      },
      revenue: {
        total: parseFloat(totalRevenue.toFixed(2)),
        currency: 'COP'
      },
      generatedAt: new Date().toISOString()
    };

    res.json({ dashboard });

  } catch (error) {
    console.error('Error al obtener dashboard:', error);
    res.status(500).json({ 
      error: 'Error al obtener las métricas del dashboard.' 
    });
  }
});

// Obtener todos los usuarios (solo admin)
router.get('/users', authenticateToken, isAdmin, (req, res) => {
  try {
    const users = database.users.getAll();
    
    // No devolver las contraseñas
    const usersWithoutPasswords = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.json({ 
      count: usersWithoutPasswords.length,
      users: usersWithoutPasswords 
    });

  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ 
      error: 'Error al obtener los usuarios.' 
    });
  }
});

// Obtener todos los productos (solo admin)
router.get('/products', authenticateToken, isAdmin, (req, res) => {
  try {
    const products = database.products.getAll();

    res.json({ 
      count: products.length,
      products 
    });

  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ 
      error: 'Error al obtener los productos.' 
    });
  }
});

// Obtener todas las órdenes (solo admin)
router.get('/orders', authenticateToken, isAdmin, (req, res) => {
  try {
    const orders = database.orders.getAll();

    res.json({ 
      count: orders.length,
      orders 
    });

  } catch (error) {
    console.error('Error al obtener órdenes:', error);
    res.status(500).json({ 
      error: 'Error al obtener las órdenes.' 
    });
  }
});

// Desactivar un producto (solo admin)
router.patch('/products/:id/deactivate', authenticateToken, isAdmin, (req, res) => {
  try {
    const product = database.products.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        error: 'Producto no encontrado.' 
      });
    }

    const updatedProduct = database.products.update(req.params.id, { 
      isActive: false 
    });

    res.json({ 
      message: 'Producto desactivado exitosamente.',
      product: updatedProduct
    });

  } catch (error) {
    console.error('Error al desactivar producto:', error);
    res.status(500).json({ 
      error: 'Error al desactivar el producto.' 
    });
  }
});

// Crear un usuario admin (solo para inicialización)
router.post('/create-admin', async (req, res) => {
  try {
    const bcrypt = require('bcrypt');
    const { email, password, name } = req.body;

    // Verificar si ya existe un admin
    const existingAdmin = database.users.getAll().find(u => u.roles.includes('admin'));
    
    if (existingAdmin) {
      return res.status(400).json({ 
        error: 'Ya existe un administrador en el sistema.' 
      });
    }

    if (!email || !password || !name) {
      return res.status(400).json({ 
        error: 'Por favor proporciona email, contraseña y nombre.' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { v4: uuidv4 } = require('uuid');

    const admin = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      name,
      roles: ['admin', 'buyer', 'seller'],
      createdAt: new Date().toISOString()
    };

    database.users.create(admin);

    const { password: _, ...adminWithoutPassword } = admin;

    res.status(201).json({ 
      message: 'Administrador creado exitosamente.',
      user: adminWithoutPassword
    });

  } catch (error) {
    console.error('Error al crear admin:', error);
    res.status(500).json({ 
      error: 'Error al crear el administrador.' 
    });
  }
});

module.exports = router;

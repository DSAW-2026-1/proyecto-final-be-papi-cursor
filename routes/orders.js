const express = require('express');
const { v4: uuidv4 } = require('uuid');
// ⚠️ DB en memoria: los datos se pierden entre cold-starts en Vercel. Pendiente migración a PostgreSQL.
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { createNotification, NotificationTypes } = require('../utils/notifications');

const router = express.Router();

// Ticket 31: Generación de órdenes y ciclo de vida de la venta (crear orden)
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const cart = await database.carts.findByUser(req.user.id);

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ 
        error: 'El carrito está vacío.' 
      });
    }

    // Agrupar productos por vendedor
    const ordersBySeller = {};

    for (const item of cart.items) {
      const product = await database.products.findById(item.productId);

      if (!product || !product.isActive) {
        return res.status(400).json({ 
          error: `Producto ${item.productId} no disponible.` 
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          error: `Stock insuficiente para ${product.name}.` 
        });
      }

      // Agrupar por vendedor
      if (!ordersBySeller[product.sellerId]) {
        ordersBySeller[product.sellerId] = [];
      }

      ordersBySeller[product.sellerId].push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        priceAtPurchase: product.price
      });
    }

    // Crear una orden por cada vendedor
    const createdOrders = [];

    for (const [sellerId, items] of Object.entries(ordersBySeller)) {
      const total = items.reduce((sum, item) => sum + (item.priceAtPurchase * item.quantity), 0);

      const order = {
        id: uuidv4(),
        buyerId: req.user.id,
        sellerId,
        items,
        total,
        status: 'pending', // pending, delivered, cancelled
        createdAt: new Date().toISOString(),
        deliveredAt: null
      };

      await database.orders.create(order);
      createdOrders.push(order);

      // Reducir stock de los productos
      for (const item of items) {
        const product = await database.products.findById(item.productId);
        const newStock = product.stock - item.quantity;
        await database.products.update(item.productId, { stock: newStock });
      }

      // Crear notificación para el vendedor
      createNotification({
        userId: sellerId,
        type: NotificationTypes.NEW_ORDER,
        message: `Tienes un nuevo pedido por $${total.toFixed(2)}`,
        relatedId: order.id
      });
    }

    // Vaciar el carrito
    await database.carts.update(req.user.id, { items: [], updatedAt: new Date().toISOString() });

    res.status(201).json({ 
      message: 'Órdenes creadas exitosamente.',
      orders: createdOrders
    });

  } catch (error) {
    console.error('Error al crear órdenes:', error);
    res.status(500).json({ 
      error: 'Error al crear las órdenes.' 
    });
  }
});

// Ticket 31 (parte 2): Generación de órdenes — marcar como entregada (vendedor)
router.patch('/:id/deliver', authenticateToken, async (req, res) => {
  try {
    const order = await database.orders.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        error: 'Orden no encontrada.' 
      });
    }

    // Verificar que el usuario sea el vendedor de esta orden
    if (order.sellerId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Solo el vendedor puede marcar la orden como entregada.' 
      });
    }

    if (order.status === 'delivered') {
      return res.status(400).json({ 
        error: 'Esta orden ya fue entregada.' 
      });
    }

    // Actualizar el estado de la orden
    const updatedOrder = await database.orders.update(req.params.id, {
      status: 'delivered',
      deliveredAt: new Date().toISOString()
    });

    // Notificar al comprador
    createNotification({
      userId: order.buyerId,
      type: NotificationTypes.ORDER_DELIVERED,
      message: 'Tu pedido ha sido marcado como entregado',
      relatedId: order.id
    });

    res.json({ 
      message: 'Orden marcada como entregada.',
      order: updatedOrder
    });

  } catch (error) {
    console.error('Error al entregar orden:', error);
    res.status(500).json({ 
      error: 'Error al marcar la orden como entregada.' 
    });
  }
});

// Obtener órdenes del usuario (como comprador y vendedor)
router.get('/my-orders', authenticateToken, async (req, res) => {
  try {
    // Órdenes como comprador
    const purchases = await database.orders.findByBuyer(req.user.id);
    
    // Órdenes como vendedor
    const sales = await database.orders.findBySeller(req.user.id);

    // Agregar información adicional
    const purchasesWithDetails = await Promise.all(purchases.map(async (order) => {
      const seller = await database.users.findById(order.sellerId);
      return {
        ...order,
        seller: seller ? { id: seller.id, name: seller.name, email: seller.email } : null
      };
    }));

    const salesWithDetails = await Promise.all(sales.map(async (order) => {
      const buyer = await database.users.findById(order.buyerId);
      return {
        ...order,
        buyer: buyer ? { id: buyer.id, name: buyer.name, email: buyer.email } : null
      };
    }));

    res.json({ 
      purchases: purchasesWithDetails,
      sales: salesWithDetails
    });

  } catch (error) {
    console.error('Error al obtener órdenes:', error);
    res.status(500).json({ 
      error: 'Error al obtener las órdenes.' 
    });
  }
});

// Obtener una orden específica
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await database.orders.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        error: 'Orden no encontrada.' 
      });
    }

    // Verificar que el usuario sea el comprador o vendedor de esta orden
    if (order.buyerId !== req.user.id && order.sellerId !== req.user.id) {
      return res.status(403).json({ 
        error: 'No tienes permiso para ver esta orden.' 
      });
    }

    // Agregar información del comprador y vendedor
    const buyer = await database.users.findById(order.buyerId);
    const seller = await database.users.findById(order.sellerId);

    const orderWithDetails = {
      ...order,
      buyer: buyer ? { id: buyer.id, name: buyer.name, email: buyer.email } : null,
      seller: seller ? { id: seller.id, name: seller.name, email: seller.email } : null
    };

    res.json({ order: orderWithDetails });

  } catch (error) {
    console.error('Error al obtener orden:', error);
    res.status(500).json({ 
      error: 'Error al obtener la orden.' 
    });
  }
});

// Cancelar una orden (solo si está pendiente y el usuario es el comprador)
router.patch('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const order = await database.orders.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        error: 'Orden no encontrada.' 
      });
    }

    if (order.buyerId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Solo el comprador puede cancelar la orden.' 
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Solo se pueden cancelar órdenes pendientes.' 
      });
    }

    // Devolver el stock
    for (const item of order.items) {
      const product = await database.products.findById(item.productId);
      if (product) {
        const newStock = product.stock + item.quantity;
        await database.products.update(item.productId, { stock: newStock });
      }
    }

    const updatedOrder = await database.orders.update(req.params.id, {
      status: 'cancelled'
    });

    res.json({ 
      message: 'Orden cancelada exitosamente.',
      order: updatedOrder
    });

  } catch (error) {
    console.error('Error al cancelar orden:', error);
    res.status(500).json({ 
      error: 'Error al cancelar la orden.' 
    });
  }
});

module.exports = router;

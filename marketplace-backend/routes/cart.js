const express = require('express');
const { v4: uuidv4 } = require('uuid');
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ticket 1: Obtener el carrito del usuario
router.get('/', authenticateToken, (req, res) => {
  try {
    let cart = database.carts.findByUser(req.user.id);

    // Si no existe un carrito, crear uno vacío
    if (!cart) {
      cart = {
        id: uuidv4(),
        userId: req.user.id,
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      database.carts.create(cart);
    }

    // Agregar información de productos a los items
    const cartWithProducts = {
      ...cart,
      items: cart.items.map(item => {
        const product = database.products.findById(item.productId);
        return {
          ...item,
          product: product || null
        };
      })
    };

    // Calcular total
    const total = cartWithProducts.items.reduce((sum, item) => {
      return sum + (item.product ? item.product.price * item.quantity : 0);
    }, 0);

    res.json({ 
      cart: cartWithProducts,
      total
    });

  } catch (error) {
    console.error('Error al obtener carrito:', error);
    res.status(500).json({ 
      error: 'Error al obtener el carrito.' 
    });
  }
});

// Agregar producto al carrito
router.post('/add', authenticateToken, (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ 
        error: 'Por favor proporciona el ID del producto.' 
      });
    }

    // Verificar que el producto exista
    const product = database.products.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ 
        error: 'Producto no encontrado o no disponible.' 
      });
    }

    // Verificar que el usuario no esté comprando su propio producto
    if (product.sellerId === req.user.id) {
      return res.status(400).json({ 
        error: 'No puedes agregar tus propios productos al carrito.' 
      });
    }

    // Verificar stock
    if (product.stock < quantity) {
      return res.status(400).json({ 
        error: 'Stock insuficiente.' 
      });
    }

    // Obtener o crear carrito
    let cart = database.carts.findByUser(req.user.id);
    
    if (!cart) {
      cart = {
        id: uuidv4(),
        userId: req.user.id,
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      database.carts.create(cart);
    }

    // Verificar si el producto ya está en el carrito
    const existingItemIndex = cart.items.findIndex(item => item.productId === productId);

    if (existingItemIndex !== -1) {
      // Actualizar cantidad
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      
      if (newQuantity > product.stock) {
        return res.status(400).json({ 
          error: 'Stock insuficiente para esta cantidad.' 
        });
      }

      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      // Agregar nuevo item
      cart.items.push({
        id: uuidv4(),
        productId,
        quantity: parseInt(quantity),
        addedAt: new Date().toISOString()
      });
    }

    cart.updatedAt = new Date().toISOString();
    database.carts.update(req.user.id, { items: cart.items, updatedAt: cart.updatedAt });

    res.json({ 
      message: 'Producto agregado al carrito.',
      cart
    });

  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    res.status(500).json({ 
      error: 'Error al agregar producto al carrito.' 
    });
  }
});

// Actualizar cantidad de un producto en el carrito
router.put('/update/:itemId', authenticateToken, (req, res) => {
  try {
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ 
        error: 'La cantidad debe ser al menos 1.' 
      });
    }

    const cart = database.carts.findByUser(req.user.id);

    if (!cart) {
      return res.status(404).json({ 
        error: 'Carrito no encontrado.' 
      });
    }

    const itemIndex = cart.items.findIndex(item => item.id === req.params.itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ 
        error: 'Producto no encontrado en el carrito.' 
      });
    }

    // Verificar stock
    const product = database.products.findById(cart.items[itemIndex].productId);
    if (!product || quantity > product.stock) {
      return res.status(400).json({ 
        error: 'Stock insuficiente.' 
      });
    }

    cart.items[itemIndex].quantity = parseInt(quantity);
    cart.updatedAt = new Date().toISOString();
    
    database.carts.update(req.user.id, { items: cart.items, updatedAt: cart.updatedAt });

    res.json({ 
      message: 'Cantidad actualizada.',
      cart
    });

  } catch (error) {
    console.error('Error al actualizar carrito:', error);
    res.status(500).json({ 
      error: 'Error al actualizar el carrito.' 
    });
  }
});

// Eliminar producto del carrito
router.delete('/remove/:itemId', authenticateToken, (req, res) => {
  try {
    const cart = database.carts.findByUser(req.user.id);

    if (!cart) {
      return res.status(404).json({ 
        error: 'Carrito no encontrado.' 
      });
    }

    const itemIndex = cart.items.findIndex(item => item.id === req.params.itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ 
        error: 'Producto no encontrado en el carrito.' 
      });
    }

    cart.items.splice(itemIndex, 1);
    cart.updatedAt = new Date().toISOString();
    
    database.carts.update(req.user.id, { items: cart.items, updatedAt: cart.updatedAt });

    res.json({ 
      message: 'Producto eliminado del carrito.',
      cart
    });

  } catch (error) {
    console.error('Error al eliminar del carrito:', error);
    res.status(500).json({ 
      error: 'Error al eliminar producto del carrito.' 
    });
  }
});

// Vaciar carrito
router.delete('/clear', authenticateToken, (req, res) => {
  try {
    const cart = database.carts.findByUser(req.user.id);

    if (!cart) {
      return res.status(404).json({ 
        error: 'Carrito no encontrado.' 
      });
    }

    cart.items = [];
    cart.updatedAt = new Date().toISOString();
    
    database.carts.update(req.user.id, { items: [], updatedAt: cart.updatedAt });

    res.json({ 
      message: 'Carrito vaciado exitosamente.',
      cart
    });

  } catch (error) {
    console.error('Error al vaciar carrito:', error);
    res.status(500).json({ 
      error: 'Error al vaciar el carrito.' 
    });
  }
});

module.exports = router;

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const database = require('../database');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { createNotification, NotificationTypes } = require('../utils/notifications');

const router = express.Router();

// Ticket 24: Publicar un nuevo artículo en la tienda
router.post('/', authenticateToken, authorizeRole('seller'), async (req, res) => {
  try {
    const { name, price, description, image, stock, category, condition } = req.body;

    // Validar campos requeridos
    if (!name || !price || !description) {
      return res.status(400).json({
        error: 'Por favor proporciona nombre, precio y descripción del producto.'
      });
    }

    // Validar precio
    if (price <= 0) {
      return res.status(400).json({
        error: 'El precio debe ser mayor a 0.'
      });
    }

    // Verificar que el usuario tenga rol de vendedor
    if (!req.user.roles.includes('seller')) {
      return res.status(403).json({
        error: 'Debes ser vendedor para publicar productos.'
      });
    }

    // Crear el producto
    const newProduct = {
      id: uuidv4(),
      sellerId: req.user.id,
      name,
      price: parseFloat(price),
      description,
      image: image || null,
      category: category || null,
      condition: condition || null,
      stock: stock || 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await database.products.create(newProduct);

    res.status(201).json({ 
      message: 'Producto publicado exitosamente.',
      product: newProduct
    });

  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ 
      error: 'Error al publicar el producto.' 
    });
  }
});

// Obtener todos los productos (marketplace)
router.get('/', async (req, res) => {
  try {
    const { search, minPrice, maxPrice, sellerId } = req.query;
    
    let products = (await database.products.getAll()).filter(p => p.isActive && !p.hidden);

    // Filtrar por búsqueda
    if (search) {
      const searchLower = search.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower)
      );
    }

    // Filtrar por rango de precio
    if (minPrice) {
      products = products.filter(p => p.price >= parseFloat(minPrice));
    }
    if (maxPrice) {
      products = products.filter(p => p.price <= parseFloat(maxPrice));
    }

    // Filtrar por vendedor
    if (sellerId) {
      products = products.filter(p => p.sellerId === sellerId);
    }

    // Agregar información del vendedor
    const productsWithSeller = await Promise.all(products.map(async (product) => {
      const seller = await database.users.findById(product.sellerId);
      return {
        ...product,
        seller: seller ? {
          id: seller.id,
          name: seller.name,
          email: seller.email
        } : null
      };
    }));

    res.json({ 
      count: productsWithSeller.length,
      products: productsWithSeller 
    });

  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ 
      error: 'Error al obtener productos.' 
    });
  }
});

// Obtener un producto específico (incluye sellerRating — 3B)
router.get('/:id', async (req, res) => {
  try {
    const product = await database.products.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        error: 'Producto no encontrado.'
      });
    }

    // Producto eliminado (isActive: false) — no disponible
    if (!product.isActive) {
      return res.status(404).json({
        error: 'Este producto ya no está disponible.',
        unavailable: true
      });
    }

    // Producto oculto por admin
    if (product.hidden) {
      return res.status(404).json({
        error: 'Este producto no está disponible.',
        hidden: true
      });
    }

    // Agregar información del vendedor + rating promedio (3B)
    const seller = await database.users.findById(product.sellerId);
    const sellerRating = await database.reviews.calculateSellerRating(product.sellerId);

    const productWithSeller = {
      ...product,
      seller: seller ? {
        id: seller.id,
        name: seller.name,
        email: seller.email,
        sellerRating  // null si no califica, número si califica
      } : null
    };

    res.json({ product: productWithSeller });

  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({
      error: 'Error al obtener el producto.'
    });
  }
});

// Modificar un producto (solo el vendedor dueño)
router.put('/:id', authenticateToken, authorizeRole('seller'), async (req, res) => {
  try {
    const product = await database.products.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        error: 'Producto no encontrado.' 
      });
    }

    // Verificar que el usuario sea el dueño del producto
    if (product.sellerId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Solo puedes editar tus propios productos.' 
      });
    }

    const { name, price, description, image, stock, isActive, category, condition } = req.body;

    // Validar precio si se proporciona
    if (price !== undefined && price <= 0) {
      return res.status(400).json({
        error: 'El precio debe ser mayor a 0.'
      });
    }

    // Actualizar campos
    const updates = {
      updatedAt: new Date().toISOString()
    };

    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = parseFloat(price);
    if (description !== undefined) updates.description = description;
    if (image !== undefined) updates.image = image;
    if (stock !== undefined) updates.stock = parseInt(stock);
    if (isActive !== undefined) updates.isActive = isActive;
    if (category !== undefined) updates.category = category;
    if (condition !== undefined) updates.condition = condition;

    const updatedProduct = await database.products.update(req.params.id, updates);

    res.json({ 
      message: 'Producto actualizado exitosamente.',
      product: updatedProduct
    });

  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ 
      error: 'Error al actualizar el producto.' 
    });
  }
});

// Eliminar un producto (marcar como inactivo)
router.delete('/:id', authenticateToken, authorizeRole('seller'), async (req, res) => {
  try {
    const product = await database.products.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        error: 'Producto no encontrado.' 
      });
    }

    // Verificar que el usuario sea el dueño del producto
    if (product.sellerId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Solo puedes eliminar tus propios productos.' 
      });
    }

    await database.products.update(req.params.id, { isActive: false });

    res.json({ 
      message: 'Producto eliminado exitosamente.' 
    });

  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ 
      error: 'Error al eliminar el producto.' 
    });
  }
});

// Obtener productos del vendedor autenticado
router.get('/my/products', authenticateToken, authorizeRole('seller'), async (req, res) => {
  try {
    const all = await database.products.findBySeller(req.user.id);
    const products = all.filter(p => p.isActive);

    res.json({
      count: products.length,
      products
    });

  } catch (error) {
    console.error('Error al obtener productos del vendedor:', error);
    res.status(500).json({ 
      error: 'Error al obtener tus productos.' 
    });
  }
});

// ── 3A: Reseñas por producto ──────────────────────────────────────────────────

// GET /products/:id/reviews — lista pública de reseñas del producto
router.get('/:id/reviews', async (req, res) => {
  try {
    const product = await database.products.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const reviews = await database.reviews.findByProduct(req.params.id);

    // Enriquecer con nombre del comprador
    const reviewsWithBuyer = await Promise.all(reviews.map(async (rv) => {
      const buyer = await database.users.findById(rv.buyerId);
      return {
        ...rv,
        buyer: buyer ? { id: buyer.id, name: buyer.name } : null
      };
    }));

    const avg = reviewsWithBuyer.length > 0
      ? reviewsWithBuyer.reduce((s, r) => s + r.rating, 0) / reviewsWithBuyer.length
      : null;

    res.json({
      productId: req.params.id,
      count: reviewsWithBuyer.length,
      average: avg !== null ? parseFloat(avg.toFixed(2)) : null,
      reviews: reviewsWithBuyer
    });

  } catch (error) {
    console.error('Error al obtener reseñas:', error);
    res.status(500).json({ error: 'Error al obtener las reseñas.' });
  }
});

// POST /products/:id/reviews — comprador deja reseña (requiere compra completed)
router.post('/:id/reviews', authenticateToken, async (req, res) => {
  try {
    const product = await database.products.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    // El vendedor no puede reseñar su propio producto
    if (product.sellerId === req.user.id) {
      return res.status(403).json({ error: 'No puedes reseñar tus propios productos.' });
    }

    const { rating, comment } = req.body;

    // Validar rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La calificación debe ser un número entre 1 y 5.' });
    }

    // Verificar que exista una venta completed entre este buyer y este producto
    const orderId = await database.reviews.findCompletedOrderForProduct(
      req.user.id,
      product.sellerId,
      req.params.id
    );

    if (!orderId) {
      return res.status(403).json({
        error: 'Solo puedes reseñar productos que hayas comprado.'
      });
    }

    // Un comprador no puede dejar más de una reseña por producto
    const existing = await database.reviews.findByBuyerAndProduct(req.user.id, req.params.id);
    if (existing) {
      return res.status(400).json({ error: 'Ya dejaste una reseña para este producto.' });
    }

    // Crear la reseña
    const review = {
      id: uuidv4(),
      productId: req.params.id,
      buyerId: req.user.id,
      orderId,
      rating: parseInt(rating),
      comment: comment || null,
      createdAt: new Date().toISOString()
    };

    await database.reviews.create(review);

    // Notificar al vendedor
    createNotification({
      userId: product.sellerId,
      type: NotificationTypes.NEW_REVIEW,
      message: `Recibiste una reseña de ${rating} ⭐ en "${product.name}"`,
      relatedId: review.id
    });

    res.status(201).json({
      message: 'Reseña publicada exitosamente.',
      review
    });

  } catch (error) {
    console.error('Error al crear reseña:', error);
    res.status(500).json({ error: 'Error al publicar la reseña.' });
  }
});

module.exports = router;

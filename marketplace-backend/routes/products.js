const express = require('express');
const { v4: uuidv4 } = require('uuid');
const database = require('../database');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const router = express.Router();

// Ticket 3: Publicar un nuevo artículo
router.post('/', authenticateToken, authorizeRole('seller'), (req, res) => {
  try {
    const { name, price, description, image, stock } = req.body;

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
      stock: stock || 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    database.products.create(newProduct);

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
router.get('/', (req, res) => {
  try {
    const { search, minPrice, maxPrice, sellerId } = req.query;
    
    let products = database.products.getAll().filter(p => p.isActive);

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
    const productsWithSeller = products.map(product => {
      const seller = database.users.findById(product.sellerId);
      return {
        ...product,
        seller: seller ? {
          id: seller.id,
          name: seller.name,
          email: seller.email
        } : null
      };
    });

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

// Obtener un producto específico
router.get('/:id', (req, res) => {
  try {
    const product = database.products.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        error: 'Producto no encontrado.' 
      });
    }

    // Agregar información del vendedor
    const seller = database.users.findById(product.sellerId);
    const productWithSeller = {
      ...product,
      seller: seller ? {
        id: seller.id,
        name: seller.name,
        email: seller.email
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
router.put('/:id', authenticateToken, authorizeRole('seller'), (req, res) => {
  try {
    const product = database.products.findById(req.params.id);

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

    const { name, price, description, image, stock, isActive } = req.body;

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

    const updatedProduct = database.products.update(req.params.id, updates);

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
router.delete('/:id', authenticateToken, authorizeRole('seller'), (req, res) => {
  try {
    const product = database.products.findById(req.params.id);

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

    database.products.update(req.params.id, { isActive: false });

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
router.get('/my/products', authenticateToken, authorizeRole('seller'), (req, res) => {
  try {
    const products = database.products.findBySeller(req.user.id);

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

module.exports = router;

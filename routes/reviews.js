const express = require('express');
const database = require('../database');

const router = express.Router();

// GET /reviews?sellerId=xxx — reseñas de un vendedor (compatibilidad con frontend existente)
router.get('/', async (req, res) => {
  try {
    const { sellerId } = req.query;

    if (!sellerId) {
      return res.status(400).json({ error: 'Por favor proporciona el sellerId.' });
    }

    const reviews = await database.reviews.findBySeller(sellerId);

    const reviewsWithBuyer = await Promise.all(reviews.map(async (rv) => {
      const buyer = await database.users.findById(rv.buyerId);
      return {
        ...rv,
        buyer: buyer ? { id: buyer.id, name: buyer.name } : null
      };
    }));

    const sellerRating = await database.reviews.calculateSellerRating(sellerId);

    res.json({
      sellerId,
      count: reviewsWithBuyer.length,
      sellerRating,  // promedio de las primeras 20 ventas completadas (null si no califica)
      reviews: reviewsWithBuyer
    });

  } catch (error) {
    console.error('Error al obtener reseñas:', error);
    res.status(500).json({ error: 'Error al obtener las reseñas.' });
  }
});

// GET /reviews/:id — una reseña específica
router.get('/:id', async (req, res) => {
  try {
    const review = await database.reviews.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada.' });
    }

    const buyer   = await database.users.findById(review.buyerId);
    const product = await database.products.findById(review.productId);

    res.json({
      review: {
        ...review,
        buyer:   buyer   ? { id: buyer.id,   name: buyer.name   } : null,
        product: product ? { id: product.id, name: product.name } : null
      }
    });

  } catch (error) {
    console.error('Error al obtener reseña:', error);
    res.status(500).json({ error: 'Error al obtener la reseña.' });
  }
});

module.exports = router;

// ✅ routes/reviews.js — actualizado para esquema v2 (product_id)

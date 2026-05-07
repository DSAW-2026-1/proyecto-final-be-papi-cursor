const express = require('express');
const { v4: uuidv4 } = require('uuid');
// ⚠️ DB en memoria: los datos se pierden entre cold-starts en Vercel. Pendiente migración a PostgreSQL.
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { createNotification, NotificationTypes } = require('../utils/notifications');

const router = express.Router();

// Ticket 8: Dejar una reseña a un vendedor tras una compra
router.post('/', authenticateToken, (req, res) => {
  try {
    const { sellerId, orderId, rating, comment } = req.body;

    // Validar campos requeridos
    if (!sellerId || !orderId || !rating) {
      return res.status(400).json({ 
        error: 'Por favor proporciona sellerId, orderId y rating.' 
      });
    }

    // Validar rating (1-5)
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        error: 'La calificación debe estar entre 1 y 5.' 
      });
    }

    // Verificar que la orden exista
    const order = database.orders.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Orden no encontrada.' 
      });
    }

    // Verificar que el usuario sea el comprador de esta orden
    if (order.buyerId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Solo puedes dejar reseñas en órdenes donde fuiste el comprador.' 
      });
    }

    // Verificar que la orden esté entregada
    if (order.status !== 'delivered') {
      return res.status(400).json({ 
        error: 'Solo puedes dejar reseñas en órdenes completadas.' 
      });
    }

    // Verificar que el vendedor de la orden coincida
    if (order.sellerId !== sellerId) {
      return res.status(400).json({ 
        error: 'El vendedor no coincide con la orden.' 
      });
    }

    // Verificar que no exista ya una reseña para esta orden
    const existingReview = database.reviews.findByOrder(orderId);
    
    if (existingReview) {
      return res.status(400).json({ 
        error: 'Ya dejaste una reseña para esta orden.' 
      });
    }

    // Crear la reseña
    const review = {
      id: uuidv4(),
      sellerId,
      buyerId: req.user.id,
      orderId,
      rating: parseInt(rating),
      comment: comment || '',
      createdAt: new Date().toISOString()
    };

    database.reviews.create(review);

    // Notificar al vendedor
    createNotification({
      userId: sellerId,
      type: NotificationTypes.NEW_REVIEW,
      message: `Recibiste una nueva reseña de ${rating} estrellas`,
      relatedId: review.id
    });

    res.status(201).json({ 
      message: 'Reseña publicada exitosamente.',
      review
    });

  } catch (error) {
    console.error('Error al crear reseña:', error);
    res.status(500).json({ 
      error: 'Error al publicar la reseña.' 
    });
  }
});

// Ticket 9: Ver las reseñas de un vendedor y su promedio
router.get('/', (req, res) => {
  try {
    const { sellerId } = req.query;

    if (!sellerId) {
      return res.status(400).json({ 
        error: 'Por favor proporciona el sellerId.' 
      });
    }

    // Obtener todas las reseñas del vendedor
    const reviews = database.reviews.findBySeller(sellerId);

    // Calcular el promedio
    const average = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    // Agregar información del comprador
    const reviewsWithBuyer = reviews.map(review => {
      const buyer = database.users.findById(review.buyerId);
      return {
        ...review,
        buyer: buyer ? {
          id: buyer.id,
          name: buyer.name
        } : null
      };
    });

    res.json({ 
      sellerId,
      count: reviews.length,
      average: parseFloat(average.toFixed(2)),
      reviews: reviewsWithBuyer
    });

  } catch (error) {
    console.error('Error al obtener reseñas:', error);
    res.status(500).json({ 
      error: 'Error al obtener las reseñas.' 
    });
  }
});

// Obtener una reseña específica
router.get('/:id', (req, res) => {
  try {
    const reviews = database.reviews.findBySeller('all');
    const review = reviews.find(r => r.id === req.params.id);

    if (!review) {
      return res.status(404).json({ 
        error: 'Reseña no encontrada.' 
      });
    }

    // Agregar información del comprador y vendedor
    const buyer = database.users.findById(review.buyerId);
    const seller = database.users.findById(review.sellerId);

    const reviewWithDetails = {
      ...review,
      buyer: buyer ? { id: buyer.id, name: buyer.name } : null,
      seller: seller ? { id: seller.id, name: seller.name } : null
    };

    res.json({ review: reviewWithDetails });

  } catch (error) {
    console.error('Error al obtener reseña:', error);
    res.status(500).json({ 
      error: 'Error al obtener la reseña.' 
    });
  }
});

module.exports = router;

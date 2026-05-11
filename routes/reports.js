const express = require('express');
const { v4: uuidv4 } = require('uuid');
// ⚠️ DB en memoria: los datos se pierden entre cold-starts en Vercel. Pendiente migración a PostgreSQL.
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ticket 15: Reportar un producto o perfil de usuario
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { targetType, targetId, reason } = req.body;

    if (!targetType || !targetId || !reason) {
      return res.status(400).json({
        error: 'Los campos targetType, targetId y reason son requeridos.'
      });
    }

    if (!['product', 'user'].includes(targetType)) {
      return res.status(400).json({
        error: 'targetType debe ser "product" o "user".'
      });
    }

    const report = {
      id: uuidv4(),
      targetType,
      targetId,
      reason,
      reportedBy: req.user.id,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await database.reports.create(report);

    res.status(201).json({
      message: 'Reporte enviado exitosamente.',
      report
    });

  } catch (error) {
    console.error('Error al crear reporte:', error);
    res.status(500).json({
      error: 'Error al enviar el reporte.'
    });
  }
});

// POST /reports/product/:id
router.post('/product/:id', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'El campo reason es requerido.' });

    const report = {
      id: uuidv4(), targetType: 'product', targetId: req.params.id,
      reason, reportedBy: req.user.id, status: 'pending',
      createdAt: new Date().toISOString()
    };
    await database.reports.create(report);
    res.status(201).json({ message: 'Producto reportado exitosamente.', report });
  } catch (error) {
    console.error('Error al reportar producto:', error);
    res.status(500).json({ error: 'Error al enviar el reporte.' });
  }
});

// POST /reports/user/:id
router.post('/user/:id', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'El campo reason es requerido.' });
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes reportarte a ti mismo.' });
    }

    const report = {
      id: uuidv4(), targetType: 'user', targetId: req.params.id,
      reason, reportedBy: req.user.id, status: 'pending',
      createdAt: new Date().toISOString()
    };
    await database.reports.create(report);
    res.status(201).json({ message: 'Usuario reportado exitosamente.', report });
  } catch (error) {
    console.error('Error al reportar usuario:', error);
    res.status(500).json({ error: 'Error al enviar el reporte.' });
  }
});

module.exports = router;

// ✅ routes/reports.js — completado

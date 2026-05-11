const express = require('express');
// ⚠️ DB en memoria: los datos se pierden entre cold-starts en Vercel. Pendiente migración a PostgreSQL.
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ticket 11: Listar y marcar notificaciones como leídas (listar)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const notifications = await database.notifications.findByUser(req.user.id);

    // Ordenar por fecha (más recientes primero)
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Contar no leídas
    const unreadCount = notifications.filter(n => !n.read).length;

    res.json({ 
      count: notifications.length,
      unreadCount,
      notifications
    });

  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    res.status(500).json({ 
      error: 'Error al obtener las notificaciones.' 
    });
  }
});

// Marcar una notificación como leída
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const notifications = await database.notifications.findByUser(req.user.id);
    const notification = notifications.find(n => n.id === req.params.id);

    if (!notification) {
      return res.status(404).json({ 
        error: 'Notificación no encontrada.' 
      });
    }

    // Verificar que la notificación pertenezca al usuario
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ 
        error: 'No tienes permiso para modificar esta notificación.' 
      });
    }

    const updatedNotification = await database.notifications.update(req.params.id, { read: true });

    res.json({ 
      message: 'Notificación marcada como leída.',
      notification: updatedNotification
    });

  } catch (error) {
    console.error('Error al marcar notificación:', error);
    res.status(500).json({ 
      error: 'Error al marcar la notificación.' 
    });
  }
});

// Marcar todas las notificaciones como leídas
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    const notifications = await database.notifications.findByUser(req.user.id);

    for (const notification of notifications) {
      if (!notification.read) {
        await database.notifications.update(notification.id, { read: true });
      }
    }

    res.json({ 
      message: 'Todas las notificaciones marcadas como leídas.',
      count: notifications.length
    });

  } catch (error) {
    console.error('Error al marcar notificaciones:', error);
    res.status(500).json({ 
      error: 'Error al marcar las notificaciones.' 
    });
  }
});

// Eliminar una notificación
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const notifications = await database.notifications.findByUser(req.user.id);
    const notification = notifications.find(n => n.id === req.params.id);

    if (!notification) {
      return res.status(404).json({ 
        error: 'Notificación no encontrada.' 
      });
    }

    // Verificar que la notificación pertenezca al usuario
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ 
        error: 'No tienes permiso para eliminar esta notificación.' 
      });
    }

    // En nuestra implementación en memoria, simplemente la marcamos como eliminada
    // En una BD real, usarías un DELETE
    await database.notifications.update(req.params.id, { deleted: true });

    res.json({ 
      message: 'Notificación eliminada exitosamente.'
    });

  } catch (error) {
    console.error('Error al eliminar notificación:', error);
    res.status(500).json({ 
      error: 'Error al eliminar la notificación.' 
    });
  }
});

module.exports = router;

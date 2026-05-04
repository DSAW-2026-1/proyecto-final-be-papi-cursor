const express = require('express');
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ticket 7: Listar notificaciones del usuario
router.get('/', authenticateToken, (req, res) => {
  try {
    const notifications = database.notifications.findByUser(req.user.id);

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
router.patch('/:id/read', authenticateToken, (req, res) => {
  try {
    const notifications = database.notifications.findByUser(req.user.id);
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

    const updatedNotification = database.notifications.update(req.params.id, { read: true });

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
router.patch('/read-all', authenticateToken, (req, res) => {
  try {
    const notifications = database.notifications.findByUser(req.user.id);

    notifications.forEach(notification => {
      if (!notification.read) {
        database.notifications.update(notification.id, { read: true });
      }
    });

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
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const notifications = database.notifications.findByUser(req.user.id);
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
    database.notifications.update(req.params.id, { deleted: true });

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

const { v4: uuidv4 } = require('uuid');
const database = require('../database');

// Función para crear notificaciones internas
const createNotification = ({ userId, type, message, relatedId = null }) => {
  const notification = {
    id: uuidv4(),
    userId,
    type, // 'order', 'message', 'review', etc.
    message,
    relatedId, // ID de la orden, conversación, etc.
    read: false,
    createdAt: new Date().toISOString()
  };

  database.notifications.create(notification);
  
  return notification;
};

// Tipos de notificaciones
const NotificationTypes = {
  NEW_ORDER: 'new_order',
  ORDER_DELIVERED: 'order_delivered',
  NEW_MESSAGE: 'new_message',
  NEW_REVIEW: 'new_review',
  PRODUCT_SOLD: 'product_sold'
};

module.exports = {
  createNotification,
  NotificationTypes
};

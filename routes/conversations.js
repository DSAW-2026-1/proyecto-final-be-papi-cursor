const express = require('express');
const { v4: uuidv4 } = require('uuid');
// ⚠️ DB en memoria: los datos se pierden entre cold-starts en Vercel. Pendiente migración a PostgreSQL.
const database = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { createNotification, NotificationTypes } = require('../utils/notifications');

const router = express.Router();

// Ticket 4: Crear una conversación entre comprador y vendedor
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ 
        error: 'Por favor proporciona el ID del producto.' 
      });
    }

    // Verificar que el producto exista
    const product = await database.products.findById(productId);
    
    if (!product || !product.isActive) {
      return res.status(404).json({ 
        error: 'Producto no encontrado o no disponible.' 
      });
    }

    // Verificar que el comprador no sea el mismo vendedor
    if (product.sellerId === req.user.id) {
      return res.status(400).json({ 
        error: 'No puedes iniciar una conversación con tu propio producto.' 
      });
    }

    // Verificar si ya existe una conversación entre estos usuarios para este producto
    const existingConversation = await database.conversations.findByUsers(req.user.id, product.sellerId);
    
    if (existingConversation && existingConversation.productId === productId) {
      return res.json({ 
        message: 'Ya existe una conversación para este producto.',
        conversation: existingConversation
      });
    }

    // Crear nueva conversación
    const conversation = {
      id: uuidv4(),
      buyerId: req.user.id,
      sellerId: product.sellerId,
      productId,
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString()
    };

    await database.conversations.create(conversation);

    res.status(201).json({ 
      message: 'Conversación creada exitosamente.',
      conversation
    });

  } catch (error) {
    console.error('Error al crear conversación:', error);
    res.status(500).json({ 
      error: 'Error al crear la conversación.' 
    });
  }
});

// Obtener todas las conversaciones del usuario
router.get('/', authenticateToken, async (req, res) => {
  try {
    const conversations = await database.conversations.findByUser(req.user.id);

    // Agregar información adicional
    const conversationsWithDetails = await Promise.all(conversations.map(async (conv) => {
      const product = await database.products.findById(conv.productId);
      const otherUser = await database.users.findById(
        conv.buyerId === req.user.id ? conv.sellerId : conv.buyerId
      );
      
      // Obtener el último mensaje
      const messages = await database.messages.findByConversation(conv.id);
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

      return {
        ...conv,
        product: product ? {
          id: product.id,
          name: product.name,
          image: product.image
        } : null,
        otherUser: otherUser ? {
          id: otherUser.id,
          name: otherUser.name
        } : null,
        lastMessage,
        unreadCount: messages.filter(m => !m.read && m.senderId !== req.user.id).length
      };
    }));

    res.json({
      count: conversationsWithDetails.length,
      conversations: conversationsWithDetails
    });

  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    res.status(500).json({ 
      error: 'Error al obtener las conversaciones.' 
    });
  }
});

// Obtener una conversación específica con sus mensajes
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const conversation = await database.conversations.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ 
        error: 'Conversación no encontrada.' 
      });
    }

    // Verificar que el usuario sea parte de la conversación
    if (conversation.buyerId !== req.user.id && conversation.sellerId !== req.user.id) {
      return res.status(403).json({ 
        error: 'No tienes permiso para ver esta conversación.' 
      });
    }

    // Obtener mensajes
    const messages = await database.messages.findByConversation(req.params.id);

    // Marcar mensajes como leídos
    for (const message of messages) {
      if (message.senderId !== req.user.id && !message.read) {
        await database.messages.update(message.id, { read: true });
      }
    }

    // Agregar información del producto y usuarios
    const product = await database.products.findById(conversation.productId);
    const buyer = await database.users.findById(conversation.buyerId);
    const seller = await database.users.findById(conversation.sellerId);

    const conversationWithDetails = {
      ...conversation,
      product: product ? { id: product.id, name: product.name, image: product.image } : null,
      buyer: buyer ? { id: buyer.id, name: buyer.name } : null,
      seller: seller ? { id: seller.id, name: seller.name } : null,
      messages
    };

    res.json({ conversation: conversationWithDetails });

  } catch (error) {
    console.error('Error al obtener conversación:', error);
    res.status(500).json({ 
      error: 'Error al obtener la conversación.' 
    });
  }
});

// Obtener mensajes de una conversación (endpoint independiente)
router.get('/:id/messages', authenticateToken, async (req, res) => {
  try {
    const conversation = await database.conversations.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada.' });
    }

    if (conversation.buyerId !== req.user.id && conversation.sellerId !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver esta conversación.' });
    }

    const messages = await database.messages.findByConversation(req.params.id);

    // Marcar como leídos
    for (const message of messages) {
      if (message.senderId !== req.user.id && !message.read) {
        await database.messages.update(message.id, { read: true });
      }
    }

    res.json({ messages });
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({ error: 'Error al obtener los mensajes.' });
  }
});

// Enviar un mensaje en una conversación
router.post('/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ 
        error: 'El mensaje no puede estar vacío.' 
      });
    }

    const conversation = await database.conversations.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ 
        error: 'Conversación no encontrada.' 
      });
    }

    // Verificar que el usuario sea parte de la conversación
    if (conversation.buyerId !== req.user.id && conversation.sellerId !== req.user.id) {
      return res.status(403).json({ 
        error: 'No tienes permiso para enviar mensajes en esta conversación.' 
      });
    }

    // Crear el mensaje
    const message = {
      id: uuidv4(),
      conversationId: req.params.id,
      senderId: req.user.id,
      content: content.trim(),
      read: false,
      createdAt: new Date().toISOString()
    };

    await database.messages.create(message);

    // Actualizar última actividad de la conversación
    await database.conversations.update(req.params.id, {
      lastMessageAt: new Date().toISOString()
    });

    // Notificar al otro usuario
    const recipientId = conversation.buyerId === req.user.id 
      ? conversation.sellerId 
      : conversation.buyerId;

    createNotification({
      userId: recipientId,
      type: NotificationTypes.NEW_MESSAGE,
      message: 'Tienes un nuevo mensaje',
      relatedId: conversation.id
    });

    res.status(201).json({
      success: true,
      message  // objeto del mensaje
    });

  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({ 
      error: 'Error al enviar el mensaje.' 
    });
  }
});

module.exports = router;

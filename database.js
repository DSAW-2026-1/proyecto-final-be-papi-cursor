// Base de datos en memoria para desarrollo
// En producción, reemplazar con una base de datos real (PostgreSQL, MongoDB, etc.)

const db = {
  users: [],
  products: [],
  carts: [],
  orders: [],
  conversations: [],
  messages: [],
  reviews: [],
  notifications: []
};

// Funciones helper para la base de datos
const database = {
  // Usuarios
  users: {
    findByEmail: (email) => db.users.find(u => u.email === email),
    findById: (id) => db.users.find(u => u.id === id),
    create: (user) => {
      db.users.push(user);
      return user;
    },
    getAll: () => db.users,
    update: (id, updates) => {
      const index = db.users.findIndex(u => u.id === id);
      if (index !== -1) {
        db.users[index] = { ...db.users[index], ...updates };
        return db.users[index];
      }
      return null;
    }
  },

  // Productos
  products: {
    findById: (id) => db.products.find(p => p.id === id),
    findBySeller: (sellerId) => db.products.filter(p => p.sellerId === sellerId),
    getAll: () => db.products,
    create: (product) => {
      db.products.push(product);
      return product;
    },
    update: (id, updates) => {
      const index = db.products.findIndex(p => p.id === id);
      if (index !== -1) {
        db.products[index] = { ...db.products[index], ...updates };
        return db.products[index];
      }
      return null;
    },
    delete: (id) => {
      const index = db.products.findIndex(p => p.id === id);
      if (index !== -1) {
        return db.products.splice(index, 1)[0];
      }
      return null;
    }
  },

  // Carritos
  carts: {
    findByUser: (userId) => db.carts.find(c => c.userId === userId),
    create: (cart) => {
      db.carts.push(cart);
      return cart;
    },
    update: (userId, updates) => {
      const index = db.carts.findIndex(c => c.userId === userId);
      if (index !== -1) {
        db.carts[index] = { ...db.carts[index], ...updates };
        return db.carts[index];
      }
      return null;
    },
    delete: (userId) => {
      const index = db.carts.findIndex(c => c.userId === userId);
      if (index !== -1) {
        return db.carts.splice(index, 1)[0];
      }
      return null;
    }
  },

  // Órdenes
  orders: {
    findById: (id) => db.orders.find(o => o.id === id),
    findByBuyer: (buyerId) => db.orders.filter(o => o.buyerId === buyerId),
    findBySeller: (sellerId) => db.orders.filter(o => o.sellerId === sellerId),
    getAll: () => db.orders,
    create: (order) => {
      db.orders.push(order);
      return order;
    },
    update: (id, updates) => {
      const index = db.orders.findIndex(o => o.id === id);
      if (index !== -1) {
        db.orders[index] = { ...db.orders[index], ...updates };
        return db.orders[index];
      }
      return null;
    }
  },

  // Conversaciones
  conversations: {
    findById: (id) => db.conversations.find(c => c.id === id),
    findByUsers: (user1Id, user2Id) => db.conversations.find(
      c => (c.buyerId === user1Id && c.sellerId === user2Id) ||
           (c.buyerId === user2Id && c.sellerId === user1Id)
    ),
    findByUser: (userId) => db.conversations.filter(
      c => c.buyerId === userId || c.sellerId === userId
    ),
    create: (conversation) => {
      db.conversations.push(conversation);
      return conversation;
    }
  },

  // Mensajes
  messages: {
    findByConversation: (conversationId) => db.messages.filter(
      m => m.conversationId === conversationId
    ),
    create: (message) => {
      db.messages.push(message);
      return message;
    }
  },

  // Reseñas
  reviews: {
    findBySeller: (sellerId) => db.reviews.filter(r => r.sellerId === sellerId),
    findByOrder: (orderId) => db.reviews.find(r => r.orderId === orderId),
    create: (review) => {
      db.reviews.push(review);
      return review;
    }
  },

  // Notificaciones
  notifications: {
    findByUser: (userId) => db.notifications.filter(n => n.userId === userId),
    create: (notification) => {
      db.notifications.push(notification);
      return notification;
    },
    update: (id, updates) => {
      const index = db.notifications.findIndex(n => n.id === id);
      if (index !== -1) {
        db.notifications[index] = { ...db.notifications[index], ...updates };
        return db.notifications[index];
      }
      return null;
    }
  }
};

module.exports = database;

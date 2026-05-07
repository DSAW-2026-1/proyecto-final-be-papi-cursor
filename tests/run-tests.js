/**
 * Suite de pruebas autosuficientes — 20 tickets del Marketplace Unisabana
 * Cada test crea su propio estado; no depende de otros tests.
 * Ejecutar: node tests/run-tests.js
 */

'use strict';

const BASE = 'http://localhost:3001/api';
const ts = () => Date.now();

// ─── utilidades ─────────────────────────────────────────────────────────────

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  return { status: res.status, body: json };
}

const get  = (p, t)    => req('GET',    p, null, t);
const post = (p, b, t) => req('POST',   p, b,    t);
const put  = (p, b, t) => req('PUT',    p, b,    t);
const del  = (p, t)    => req('DELETE', p, null, t);
const patch = (p, b, t) => req('PATCH', p, b,   t);

// Crea usuario único, devuelve { token, userId, email }
async function createUser(suffix = '', roles = ['buyer']) {
  const email = `test${suffix}${ts()}@unisabana.edu.co`;
  const password = 'password123';
  const reg = await post('/auth/register', { email, password, name: `Test User ${suffix}` });
  if (reg.status !== 201) throw new Error(`Register failed: ${JSON.stringify(reg.body)}`);
  const login = await post('/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);
  return { token: login.body.token, userId: login.body.user.id, email };
}

// Crea vendedor (comprador + become-seller)
async function createSeller(suffix = '') {
  const u = await createUser(suffix);
  const r = await post('/auth/become-seller', {}, u.token);
  if (r.status !== 200) throw new Error(`Become-seller failed: ${JSON.stringify(r.body)}`);
  // Re-login to get token with seller role
  const login = await post('/auth/login', { email: u.email, password: 'password123' });
  return { ...u, token: login.body.token };
}

// Singleton admin — el sistema solo permite uno; usamos credenciales fijas para poder
// re-loguearnos si el servidor ya tenía un admin de una ejecución anterior
const ADMIN_EMAIL = 'admin.test@unisabana.edu.co';
const ADMIN_PASS = 'adminpass123';
let _adminCache = null;
async function createAdmin() {
  if (_adminCache) return _adminCache;
  // Intenta crear admin; si ya existe (400) lo ignora y procede al login
  await post('/admin/create-admin', { email: ADMIN_EMAIL, password: ADMIN_PASS, name: 'Admin' });
  const login = await post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
  if (login.status !== 200) throw new Error(`Admin login failed: ${JSON.stringify(login.body)}`);
  _adminCache = { token: login.body.token, userId: login.body.user.id };
  return _adminCache;
}

// ─── runner ─────────────────────────────────────────────────────────────────

const results = [];

async function test(id, name, fn) {
  process.stdout.write(`  ${id} ${name} ... `);
  try {
    await fn();
    results.push({ id, name, pass: true });
    console.log('✅ PASS');
  } catch (e) {
    results.push({ id, name, pass: false, error: e.message });
    console.log(`❌ FAIL — ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ─── tests ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 Suite de pruebas — Unisabana Marketplace\n');

  // ── T1: Generar registro con validación de correo institucional ──────────
  await test('T1', 'Registro con correo institucional válido → 201', async () => {
    const r = await post('/auth/register', {
      email: `valido${ts()}@unisabana.edu.co`,
      password: 'password123',
      name: 'Usuario Válido',
    });
    assert(r.status === 201, `Esperaba 201, recibió ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.user, 'Respuesta no incluye user');
    assert(!r.body.user.password, 'Respuesta expone contraseña');
  });

  await test('T1b', 'Registro con correo no institucional → 400', async () => {
    const r = await post('/auth/register', {
      email: 'usuario@gmail.com',
      password: 'password123',
      name: 'Usuario Inválido',
    });
    assert(r.status === 400, `Esperaba 400, recibió ${r.status}`);
  });

  await test('T1c', 'Registro con correo duplicado → 409', async () => {
    const email = `dup${ts()}@unisabana.edu.co`;
    await post('/auth/register', { email, password: 'password123', name: 'User A' });
    const r2 = await post('/auth/register', { email, password: 'password123', name: 'User B' });
    assert(r2.status === 409, `Esperaba 409, recibió ${r2.status}`);
  });

  // ── T21: Inicio de sesión y entrega de llave de acceso ──────────────────
  await test('T21', 'Login con credenciales válidas → 200 + token JWT', async () => {
    const email = `login${ts()}@unisabana.edu.co`;
    await post('/auth/register', { email, password: 'password123', name: 'Login Test' });
    const r = await post('/auth/login', { email, password: 'password123' });
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(r.body.token, 'No se entregó token');
    assert(r.body.user, 'No se entregó user');
  });

  await test('T21b', 'Login con contraseña incorrecta → 401', async () => {
    const email = `badpw${ts()}@unisabana.edu.co`;
    await post('/auth/register', { email, password: 'correcta', name: 'Bad PW Test' });
    const r = await post('/auth/login', { email, password: 'incorrecta' });
    assert(r.status === 401, `Esperaba 401, recibió ${r.status}`);
  });

  // ── T17: Middleware de autenticación JWT ─────────────────────────────────
  await test('T17', 'Sin token → 401 en ruta protegida', async () => {
    const r = await get('/auth/profile');
    assert(r.status === 401, `Esperaba 401, recibió ${r.status}`);
  });

  await test('T17b', 'Token inválido → 401 o 403', async () => {
    const r = await get('/auth/profile', 'token-falso-invalido');
    assert(r.status === 401 || r.status === 403, `Esperaba 401/403, recibió ${r.status}`);
  });

  await test('T17c', 'Token válido → 200 en GET /auth/profile', async () => {
    const u = await createUser('t17');
    const r = await get('/auth/profile', u.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(r.body.user.id === u.userId, 'User ID no coincide');
  });

  // ── T18: Middleware de autorización por rol ──────────────────────────────
  await test('T18', 'Comprador intenta publicar producto → 403', async () => {
    const buyer = await createUser('t18buyer');
    const r = await post('/products', { name: 'Producto', price: 10, description: 'Desc' }, buyer.token);
    assert(r.status === 403, `Esperaba 403, recibió ${r.status}`);
  });

  await test('T18b', 'Comprador intenta acceder a dashboard admin → 403', async () => {
    const buyer = await createUser('t18adm');
    const r = await get('/admin/dashboard', buyer.token);
    assert(r.status === 403, `Esperaba 403, recibió ${r.status}`);
  });

  // ── T32: Carrito de compras ──────────────────────────────────────────────
  await test('T32', 'GET /cart sin items → 200 con carrito vacío', async () => {
    const buyer = await createUser('t32');
    const r = await get('/cart', buyer.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(Array.isArray(r.body.cart.items), 'items no es array');
    assert(r.body.cart.items.length === 0, 'Carrito no está vacío');
  });

  await test('T32b', 'Agregar producto al carrito → 200', async () => {
    const seller = await createSeller('t32s');
    const prod = await post('/products', { name: 'Item Carrito', price: 5000, description: 'Desc', stock: 5 }, seller.token);
    assert(prod.status === 201, `Producto no creado: ${JSON.stringify(prod.body)}`);
    const buyer = await createUser('t32b');
    const r = await post('/cart/add', { productId: prod.body.product.id, quantity: 1 }, buyer.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── T24: Publicar nuevo artículo ─────────────────────────────────────────
  await test('T24', 'Vendedor publica producto → 201', async () => {
    const seller = await createSeller('t24');
    const r = await post('/products', {
      name: 'Libro de Cálculo',
      price: 35000,
      description: 'Usado, buen estado',
      stock: 1,
    }, seller.token);
    assert(r.status === 201, `Esperaba 201, recibió ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.product.id, 'No se devolvió ID del producto');
  });

  await test('T24b', 'Publicar producto sin precio → 400', async () => {
    const seller = await createSeller('t24b');
    const r = await post('/products', { name: 'Sin precio', description: 'Desc' }, seller.token);
    assert(r.status === 400, `Esperaba 400, recibió ${r.status}`);
  });

  // ── T31: Generación de órdenes ───────────────────────────────────────────
  await test('T31', 'Crear orden desde carrito → 201', async () => {
    const seller = await createSeller('t31s');
    const prod = await post('/products', { name: 'Calculadora', price: 50000, description: 'Científica', stock: 2 }, seller.token);
    const buyer = await createUser('t31b');
    await post('/cart/add', { productId: prod.body.product.id, quantity: 1 }, buyer.token);
    const r = await post('/orders/create', {}, buyer.token);
    assert(r.status === 201, `Esperaba 201, recibió ${r.status}: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body.orders) && r.body.orders.length > 0, 'No se crearon órdenes');
  });

  await test('T31b', 'Carrito vacío no genera orden → 400', async () => {
    const buyer = await createUser('t31empty');
    const r = await post('/orders/create', {}, buyer.token);
    assert(r.status === 400, `Esperaba 400, recibió ${r.status}`);
  });

  // ── T4: Crear conversación ───────────────────────────────────────────────
  await test('T4', 'Comprador inicia conversación sobre producto → 201', async () => {
    const seller = await createSeller('t4s');
    const prod = await post('/products', { name: 'Auriculares', price: 80000, description: 'Sony', stock: 1 }, seller.token);
    const buyer = await createUser('t4b');
    const r = await post('/conversations', { productId: prod.body.product.id }, buyer.token);
    assert(r.status === 201 || r.status === 200, `Esperaba 200/201, recibió ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.conversation, 'No se devolvió conversación');
  });

  await test('T4b', 'Vendedor no puede conversar consigo mismo → 400', async () => {
    const seller = await createSeller('t4self');
    const prod = await post('/products', { name: 'Auto-conv', price: 1000, description: 'Test', stock: 1 }, seller.token);
    const r = await post('/conversations', { productId: prod.body.product.id }, seller.token);
    assert(r.status === 400, `Esperaba 400, recibió ${r.status}`);
  });

  // ── T5: Enviar mensaje ───────────────────────────────────────────────────
  await test('T5', 'Enviar mensaje en conversación activa → 201', async () => {
    const seller = await createSeller('t5s');
    const prod = await post('/products', { name: 'Tablet', price: 200000, description: 'Samsung', stock: 1 }, seller.token);
    const buyer = await createUser('t5b');
    const conv = await post('/conversations', { productId: prod.body.product.id }, buyer.token);
    const convId = conv.body.conversation.id;
    const r = await post(`/conversations/${convId}/messages`, { content: '¿Aún disponible?' }, buyer.token);
    assert(r.status === 201, `Esperaba 201, recibió ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.data || r.body.message, 'No se devolvió mensaje');
  });

  await test('T5b', 'Mensaje vacío → 400', async () => {
    const seller = await createSeller('t5bs');
    const prod = await post('/products', { name: 'MsgEmpty', price: 1000, description: 'Desc', stock: 1 }, seller.token);
    const buyer = await createUser('t5bb');
    const conv = await post('/conversations', { productId: prod.body.product.id }, buyer.token);
    const r = await post(`/conversations/${conv.body.conversation.id}/messages`, { content: '' }, buyer.token);
    assert(r.status === 400, `Esperaba 400, recibió ${r.status}`);
  });

  // ── T6: Listar historial de mensajes ─────────────────────────────────────
  await test('T6', 'GET /conversations/:id incluye mensajes ordenados → 200', async () => {
    const seller = await createSeller('t6s');
    const prod = await post('/products', { name: 'Mochila', price: 60000, description: 'Lona', stock: 1 }, seller.token);
    const buyer = await createUser('t6b');
    const conv = await post('/conversations', { productId: prod.body.product.id }, buyer.token);
    const convId = conv.body.conversation.id;
    await post(`/conversations/${convId}/messages`, { content: 'Hola' }, buyer.token);
    await post(`/conversations/${convId}/messages`, { content: 'Sigue disponible' }, seller.token);
    const r = await get(`/conversations/${convId}`, buyer.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(Array.isArray(r.body.conversation.messages), 'messages no es array');
    assert(r.body.conversation.messages.length >= 2, `Esperaba ≥2 mensajes, recibió ${r.body.conversation.messages.length}`);
  });

  // ── T7: Listar todas las conversaciones ──────────────────────────────────
  await test('T7', 'GET /conversations lista conversaciones del usuario → 200', async () => {
    const seller = await createSeller('t7s');
    const prod = await post('/products', { name: 'Silla', price: 120000, description: 'Ergonómica', stock: 1 }, seller.token);
    const buyer = await createUser('t7b');
    await post('/conversations', { productId: prod.body.product.id }, buyer.token);
    const r = await get('/conversations', buyer.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(Array.isArray(r.body.conversations), 'conversations no es array');
    assert(r.body.conversations.length >= 1, 'No se listó la conversación creada');
  });

  // ── T8: Dejar reseña tras compra ─────────────────────────────────────────
  await test('T8', 'Dejar reseña en orden entregada → 201', async () => {
    const seller = await createSeller('t8s');
    const prod = await post('/products', { name: 'Libro', price: 25000, description: 'Novela', stock: 2 }, seller.token);
    const buyer = await createUser('t8b');
    await post('/cart/add', { productId: prod.body.product.id, quantity: 1 }, buyer.token);
    const order = await post('/orders/create', {}, buyer.token);
    const orderId = order.body.orders[0].id;
    // Vendedor marca como entregada
    await patch(`/orders/${orderId}/deliver`, {}, seller.token);
    const r = await post('/reviews', { sellerId: seller.userId, orderId, rating: 5, comment: 'Excelente' }, buyer.token);
    assert(r.status === 201, `Esperaba 201, recibió ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.review, 'No se devolvió review');
  });

  await test('T8b', 'Reseña sin compra previa → 403 o 404', async () => {
    const seller = await createSeller('t8s2');
    const buyer = await createUser('t8b2');
    const r = await post('/reviews', {
      sellerId: seller.userId,
      orderId: '00000000-0000-0000-0000-000000000000',
      rating: 4,
      comment: 'Sin compra',
    }, buyer.token);
    assert(r.status === 403 || r.status === 404, `Esperaba 403/404, recibió ${r.status}`);
  });

  // ── T9: Ver reseñas y promedio de vendedor ───────────────────────────────
  await test('T9', 'GET /reviews?sellerId retorna reseñas y promedio → 200', async () => {
    const seller = await createSeller('t9s');
    const prod = await post('/products', { name: 'Mouse', price: 45000, description: 'Inalámbrico', stock: 2 }, seller.token);
    const buyer = await createUser('t9b');
    await post('/cart/add', { productId: prod.body.product.id, quantity: 1 }, buyer.token);
    const order = await post('/orders/create', {}, buyer.token);
    await patch(`/orders/${order.body.orders[0].id}/deliver`, {}, seller.token);
    await post('/reviews', { sellerId: seller.userId, orderId: order.body.orders[0].id, rating: 4 }, buyer.token);
    const r = await get(`/reviews?sellerId=${seller.userId}`);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(typeof r.body.average === 'number', 'No se devolvió promedio numérico');
    assert(r.body.reviews.length >= 1, 'No se listaron reseñas');
  });

  // ── T10: Notificación in-app (efecto secundario de crear orden) ──────────
  await test('T10', 'Notificación creada automáticamente al generar orden → GET /notifications retorna ≥1', async () => {
    const seller = await createSeller('t10s');
    const prod = await post('/products', { name: 'Teclado', price: 90000, description: 'Mecánico', stock: 1 }, seller.token);
    const buyer = await createUser('t10b');
    await post('/cart/add', { productId: prod.body.product.id, quantity: 1 }, buyer.token);
    await post('/orders/create', {}, buyer.token);
    // El vendedor debe haber recibido notificación de nueva orden
    const r = await get('/notifications', seller.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(r.body.notifications.length >= 1, `Vendedor no recibió notificación. Total: ${r.body.notifications.length}`);
  });

  // ── T11: Listar y marcar notificaciones ──────────────────────────────────
  await test('T11', 'GET /notifications → 200 con lista', async () => {
    const seller = await createSeller('t11s');
    const prod = await post('/products', { name: 'Monitor', price: 500000, description: 'Full HD', stock: 1 }, seller.token);
    const buyer = await createUser('t11b');
    await post('/cart/add', { productId: prod.body.product.id, quantity: 1 }, buyer.token);
    await post('/orders/create', {}, buyer.token);
    const r = await get('/notifications', seller.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(typeof r.body.unreadCount === 'number', 'No incluye unreadCount');
  });

  await test('T11b', 'PATCH /notifications/:id/read marca como leída → 200', async () => {
    const seller = await createSeller('t11bs');
    const prod = await post('/products', { name: 'Impresora', price: 300000, description: 'Láser', stock: 1 }, seller.token);
    const buyer = await createUser('t11bb');
    await post('/cart/add', { productId: prod.body.product.id, quantity: 1 }, buyer.token);
    await post('/orders/create', {}, buyer.token);
    const notifs = await get('/notifications', seller.token);
    assert(notifs.body.notifications.length >= 1, 'No hay notificaciones para marcar');
    const notifId = notifs.body.notifications[0].id;
    const r = await patch(`/notifications/${notifId}/read`, {}, seller.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── T12: Dashboard admin ─────────────────────────────────────────────────
  await test('T12', 'GET /admin/dashboard con token admin → 200 con métricas', async () => {
    const admin = await createAdmin('t12');
    const r = await get('/admin/dashboard', admin.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}: ${JSON.stringify(r.body)}`);
    const d = r.body.dashboard;
    assert(typeof d.users.total === 'number', 'dashboard.users.total no es número');
    assert(typeof d.products.active === 'number', 'dashboard.products.active no es número');
  });

  // ── T13: Eliminar producto como admin ────────────────────────────────────
  await test('T13', 'DELETE /admin/products/:id como admin → 200, producto desactivado', async () => {
    const admin = await createAdmin('t13');
    const seller = await createSeller('t13s');
    const prod = await post('/products', { name: 'Producto a borrar', price: 10000, description: 'Desc', stock: 1 }, seller.token);
    const productId = prod.body.product.id;
    const r = await del(`/admin/products/${productId}`, admin.token);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}: ${JSON.stringify(r.body)}`);
    // Verificar que ya no aparece en el listado público
    const list = await get('/products');
    const stillActive = list.body.products.find(p => p.id === productId);
    assert(!stillActive, 'El producto sigue activo después de ser eliminado por admin');
  });

  await test('T13b', 'DELETE /admin/products/:id como comprador → 403', async () => {
    const seller = await createSeller('t13s2');
    const prod = await post('/products', { name: 'No borrable', price: 1000, description: 'Desc', stock: 1 }, seller.token);
    const buyer = await createUser('t13b');
    const r = await del(`/admin/products/${prod.body.product.id}`, buyer.token);
    assert(r.status === 403, `Esperaba 403, recibió ${r.status}`);
  });

  // ── T14: Suspender/rehabilitar usuario ───────────────────────────────────
  await test('T14', 'PUT /admin/users/:id/status → existe endpoint', async () => {
    const admin = await createAdmin('t14');
    const buyer = await createUser('t14u');
    const r = await put(`/admin/users/${buyer.userId}/status`, { status: 'suspended' }, admin.token);
    assert(r.status !== 404, `Endpoint no existe (404). T14 no está implementado en el backend.`);
    assert(r.status === 200 || r.status === 204, `Esperaba 200/204, recibió ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── T15: Reportar producto o perfil ──────────────────────────────────────
  await test('T15', 'POST /reports → existe endpoint', async () => {
    const seller = await createSeller('t15s');
    const prod = await post('/products', { name: 'ReportMe', price: 1000, description: 'Desc', stock: 1 }, seller.token);
    const buyer = await createUser('t15b');
    const r = await post('/reports', {
      targetType: 'product',
      targetId: prod.body.product.id,
      reason: 'Contenido inapropiado',
    }, buyer.token);
    assert(r.status !== 404, `Endpoint no existe (404). T15 no está implementado en el backend.`);
    assert(r.status === 201, `Esperaba 201, recibió ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── T16: Listar y gestionar reportes (admin) ─────────────────────────────
  await test('T16', 'GET /admin/reports → existe endpoint', async () => {
    const admin = await createAdmin('t16');
    const r = await get('/admin/reports', admin.token);
    assert(r.status !== 404, `Endpoint no existe (404). T16 no está implementado en el backend.`);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}`);
    assert(Array.isArray(r.body.reports), 'No devuelve array de reportes');
  });

  await test('T16b', 'PUT /admin/reports/:id/resolve → existe endpoint', async () => {
    const admin = await createAdmin('t16b');
    const seller = await createSeller('t16bs');
    const prod = await post('/products', { name: 'ReportMe2', price: 500, description: 'Desc', stock: 1 }, seller.token);
    const buyer = await createUser('t16bb');
    const created = await post('/reports', { targetType: 'product', targetId: prod.body.product.id, reason: 'Test reporte' }, buyer.token);
    assert(created.status === 201, `No se pudo crear reporte previo: ${created.status}`);
    const r = await put(`/admin/reports/${created.body.report.id}/resolve`, {}, admin.token);
    assert(r.status !== 404, `Endpoint no existe (404). T16b no está implementado.`);
    assert(r.status === 200, `Esperaba 200, recibió ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── T19: Validación y sanitización global de inputs ──────────────────────
  // Probada a través del comportamiento del API (backend valida inputs en cada ruta)
  await test('T19', 'Registro sin campos requeridos → 400', async () => {
    const r = await post('/auth/register', { email: `t19${ts()}@unisabana.edu.co` }); // falta password y name
    assert(r.status === 400, `Esperaba 400, recibió ${r.status}`);
  });

  await test('T19b', 'Producto con precio negativo → 400', async () => {
    const seller = await createSeller('t19s');
    const r = await post('/products', { name: 'Test', price: -100, description: 'Desc' }, seller.token);
    assert(r.status === 400, `Esperaba 400, recibió ${r.status}`);
  });

  await test('T19c', 'Contraseña < 6 caracteres → 400', async () => {
    const r = await post('/auth/register', {
      email: `t19c${ts()}@unisabana.edu.co`,
      password: '123',
      name: 'Test',
    });
    assert(r.status === 400, `Esperaba 400, recibió ${r.status}`);
  });

  // ─── Resumen ─────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log('📋 RESUMEN\n');

  const passed = results.filter(r => r.pass);
  const failed = results.filter(r => !r.pass);

  console.log(`✅ PASS: ${passed.length}`);
  console.log(`❌ FAIL: ${failed.length}`);
  console.log(`📊 Total: ${results.length}\n`);

  console.log('┌─────────────┬────────┬───────────────────────────────────────────┐');
  console.log('│ Ticket      │ Estado │ Detalle                                   │');
  console.log('├─────────────┼────────┼───────────────────────────────────────────┤');
  for (const r of results) {
    const id     = r.id.padEnd(11);
    const status = r.pass ? ' ✅ PASS' : ' ❌ FAIL';
    const detail = r.pass ? '' : (r.error || '').substring(0, 40);
    console.log(`│ ${id} │${status} │ ${detail.padEnd(41)} │`);
  }
  console.log('└─────────────┴────────┴───────────────────────────────────────────┘');

  if (failed.length > 0) {
    console.log('\n❌ TICKETS FALLIDOS — errores exactos:\n');
    for (const r of failed) {
      console.log(`  ${r.id} — ${r.name}`);
      console.log(`  Error: ${r.error}\n`);
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Error fatal en la suite:', err);
  process.exit(1);
});

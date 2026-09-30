'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const CONTRACT_BREAK = process.env.CONTRACT_BREAK === '1';

const users = new Map();          // username -> user
const tokens = new Map();         // token -> userId
const orders = new Map();         // orderId -> order
let nextUserId = 1;
let nextOrderId = 1;

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

function error(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  return json(res, status, body);
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function issueToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, userId);
  return token;
}

function authenticate(req, res) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    error(res, 401, 'AUTH_REQUIRED', 'Bearer token is required');
    return null;
  }
  const token = auth.slice('Bearer '.length).trim();
  const userId = tokens.get(token);
  if (!userId) {
    error(res, 401, 'INVALID_TOKEN', 'Bearer token is invalid');
    return null;
  }
  return { userId, token };
}

function serializeOrder(order, { breakContract = false } = {}) {
  const out = {
    id: String(order.id),
    ownerId: String(order.ownerId),
    item: order.item,
    quantity: order.quantity,
    totalAmount: order.totalAmount,
    status: order.status,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt
  };
  if (breakContract) {
    delete out.status; // controlled incompatibility for TC-010
  }
  return out;
}

function validateOrderInput(body) {
  const issues = [];
  if (typeof body.item !== 'string' || body.item.trim().length === 0) {
    issues.push({ field: 'item', issue: 'required_non_empty_string' });
  }
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 10) {
    issues.push({ field: 'quantity', issue: 'integer_between_1_and_10' });
  }
  return issues;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { status: 'ok', contractBreak: CONTRACT_BREAK });
    }

    if (req.method === 'POST' && path === '/auth/register') {
      const body = await readBody(req);
      const issues = [];
      if (typeof body.username !== 'string' || body.username.trim().length < 3) {
        issues.push({ field: 'username', issue: 'minimum_3_characters' });
      }
      if (typeof body.password !== 'string' || body.password.length < 8) {
        issues.push({ field: 'password', issue: 'minimum_8_characters' });
      }
      if (issues.length) return error(res, 400, 'VALIDATION_ERROR', 'Invalid registration data', issues);
      if (users.has(body.username)) return error(res, 409, 'USERNAME_EXISTS', 'Username already exists');

      const user = {
        id: nextUserId++,
        username: body.username,
        passwordHash: hashPassword(body.password)
      };
      users.set(user.username, user);
      const accessToken = issueToken(user.id);
      return json(res, 201, {
        user: { id: String(user.id), username: user.username },
        accessToken,
        tokenType: 'Bearer'
      });
    }

    if (req.method === 'POST' && path === '/auth/login') {
      const body = await readBody(req);
      const user = users.get(body.username);
      if (!user || typeof body.password !== 'string' || hashPassword(body.password) !== user.passwordHash) {
        return error(res, 401, 'INVALID_CREDENTIALS', 'Username or password is invalid');
      }
      const accessToken = issueToken(user.id);
      return json(res, 200, { accessToken, tokenType: 'Bearer' });
    }

    if (req.method === 'GET' && path === '/orders') {
      const auth = authenticate(req, res); if (!auth) return;
      const page = Number(url.searchParams.get('page') || '1');
      const limit = Number(url.searchParams.get('limit') || '10');
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
        return error(res, 400, 'INVALID_PAGINATION', 'page must be >= 1 and limit must be 1..50');
      }
      const own = Array.from(orders.values()).filter(o => o.ownerId === auth.userId);
      const total = own.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const data = own.slice(start, start + limit).map(o => serializeOrder(o));
      return json(res, 200, { data, pagination: { page, limit, total, totalPages } });
    }

    if (req.method === 'POST' && path === '/orders') {
      const auth = authenticate(req, res); if (!auth) return;
      const body = await readBody(req);
      const issues = validateOrderInput(body);
      if (issues.length) return error(res, 400, 'VALIDATION_ERROR', 'Invalid order data', issues);
      const order = {
        id: nextOrderId++,
        ownerId: auth.userId,
        item: body.item.trim(),
        quantity: body.quantity,
        totalAmount: body.quantity * 10,
        status: 'created',
        createdAt: new Date().toISOString(),
        confirmedAt: null
      };
      orders.set(order.id, order);
      return json(res, 201, serializeOrder(order));
    }

    const getMatch = path.match(/^\/orders\/(\d+)$/);
    if (req.method === 'GET' && getMatch) {
      const auth = authenticate(req, res); if (!auth) return;
      const id = Number(getMatch[1]);
      const order = orders.get(id);
      if (!order) return error(res, 404, 'ORDER_NOT_FOUND', 'Order was not found');
      if (order.ownerId !== auth.userId) return error(res, 403, 'FORBIDDEN', 'You cannot access another user\'s order');
      return json(res, 200, serializeOrder(order, { breakContract: CONTRACT_BREAK && order.status === 'created' }));
    }

    const confirmMatch = path.match(/^\/orders\/(\d+)\/confirm$/);
    if (req.method === 'PUT' && confirmMatch) {
      const auth = authenticate(req, res); if (!auth) return;
      const id = Number(confirmMatch[1]);
      const order = orders.get(id);
      if (!order) return error(res, 404, 'ORDER_NOT_FOUND', 'Order was not found');
      if (order.ownerId !== auth.userId) return error(res, 403, 'FORBIDDEN', 'You cannot modify another user\'s order');

      // Idempotent effect: once confirmed, repeated identical calls do not create
      // another state transition and confirmedAt is preserved.
      if (order.status !== 'confirmed') {
        order.status = 'confirmed';
        order.confirmedAt = new Date().toISOString();
      }
      return json(res, 200, serializeOrder(order));
    }

    return error(res, 404, 'ROUTE_NOT_FOUND', 'Route was not found');
  } catch (e) {
    if (e && e.message === 'Invalid JSON') return error(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    console.error(e);
    return error(res, 500, 'INTERNAL_ERROR', 'Unexpected server error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Orders API listening at http://127.0.0.1:${PORT}`);
  console.log(`CONTRACT_BREAK=${CONTRACT_BREAK ? '1' : '0'}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

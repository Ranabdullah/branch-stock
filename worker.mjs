const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
const error = (message, status = 400) => json({ error: message }, status);
const idFormat = /^[0-9a-f-]{36}$/i;
const tokenFormat = /^[0-9a-f]{64}$/i;

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authorize(request, env) {
  const key = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!key) return null;
  const digest = await hash(key);
  if (env.OWNER_KEY && tokenFormat.test(env.OWNER_KEY) && digest === await hash(env.OWNER_KEY)) return { role: 'owner' };
  const shop = await env.DB.prepare('SELECT id FROM shops WHERE link_hash = ? AND active = 1').bind(digest).first();
  return shop && { role: 'shop', shopId: shop.id, linkHash: digest };
}

async function dashboard(env, access) {
  const owner = access.role === 'owner';
  const scope = owner ? null : access.shopId;
  const shop = owner ? null : access.shopId;
  const [shops, products, stock, movements, workspace] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, active FROM shops WHERE (? IS NULL OR id = ?) ORDER BY name').bind(scope, scope),
    env.DB.prepare('SELECT id, name, sku, shop_id, active FROM products WHERE (? IS NULL OR shop_id IS NULL OR shop_id = ?) ORDER BY name').bind(scope, scope),
    env.DB.prepare('SELECT shop_id, product_id, quantity FROM stock WHERE (? IS NULL OR shop_id = ?)').bind(shop, shop),
    env.DB.prepare('SELECT * FROM movements WHERE (? IS NULL OR shop_id = ?) ORDER BY recorded_at DESC, rowid DESC LIMIT 200').bind(shop, shop),
    env.DB.prepare('SELECT name FROM workspace_settings WHERE id = 1')
  ]);
  return json({ role: access.role, shopId: access.shopId, name: workspace.results[0]?.name, shops: shops.results, products: products.results, stock: stock.results, movements: movements.results });
}

async function move(db, access, data) {
  const { id, shopId, productId, kind, quantity } = data;
  if (!idFormat.test(id) || !idFormat.test(shopId) || !idFormat.test(productId)
      || !['set', 'in', 'out'].includes(kind) || !Number.isSafeInteger(quantity)
      || quantity < (kind === 'set' ? 0 : 1) || quantity > 100000000) return error('Enter a valid whole quantity.');
  if (access.shopId && access.shopId !== shopId) return error('This link belongs to a different shop.', 403);
  const note = typeof data.note === 'string' ? data.note.trim().slice(0, 180) : '';
  const result = await db.prepare(`
    WITH entry AS (
      SELECT sh.id AS sid, p.id AS pid, coalesce(st.quantity, 0) AS prior
      FROM shops sh JOIN products p ON p.id = ?
      LEFT JOIN stock st ON st.shop_id = sh.id AND st.product_id = p.id
      WHERE sh.id = ? AND sh.active = 1 AND p.active = 1
        AND (p.shop_id IS NULL OR p.shop_id = sh.id)
        AND (? IS NULL OR sh.link_hash = ?)
    ), adjustment AS (
      SELECT *, CASE ? WHEN 'set' THEN ? WHEN 'in' THEN prior + ? ELSE prior - ? END AS next
      FROM entry
    )
    INSERT INTO movements(id,shop_id,product_id,kind,entered,before_qty,after_qty,actor,note)
    SELECT ?, sid, pid, ?, ?, prior, next, ?, ? FROM adjustment WHERE next BETWEEN 0 AND 100000000
    ON CONFLICT(id) DO NOTHING
  `).bind(productId, shopId, access.linkHash ?? null, access.linkHash ?? null,
    kind, quantity, quantity, quantity, id, kind, quantity, access.role, note).run();
  if (result.meta.changes) return json({ saved: true }, 201);
  const existing = await db.prepare('SELECT * FROM movements WHERE id = ?').bind(id).first();
  if (existing && existing.shop_id === shopId && existing.product_id === productId &&
      existing.kind === kind && existing.entered === quantity && existing.actor === access.role && existing.note === note) return json({ saved: true });
  return error('Could not record the change. Check shop access, product status and available stock.', 409);
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (!env.DB) return error('This deployment has no shared stock database.', 503);
  const access = await authorize(request, env);
  if (!access) return error('Enter a valid owner key or open an active shop link.', 401);
  if (url.pathname === '/api/dashboard' && request.method === 'GET') return dashboard(env, access);
  if (request.method !== 'POST') return error('Route not found.', 404);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return error('Expected JSON.', 415);
  const raw = await new Response(request.body).text();
  if (raw.length > 4096) return error('Request is too large.', 413);
  let data;
  try { data = JSON.parse(raw); } catch { return error('Invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return error('Invalid request.');
  const db = env.DB;
  if (url.pathname === '/api/move') return move(db, access, data);
  const name = typeof data.name === 'string' ? data.name.trim().slice(0, 100) : '';
  if (url.pathname === '/api/products') {
    if (!name) return error('Enter a product name.');
    const sku = typeof data.sku === 'string' ? data.sku.trim().slice(0, 60) : '';
    const productId = crypto.randomUUID();
    if (access.shopId) {
      const result = await db.prepare('INSERT INTO products (id,name,sku,shop_id) SELECT ?,?,?,id FROM shops WHERE id=? AND active=1 AND link_hash=?')
        .bind(productId, name, sku, access.shopId, access.linkHash).run();
      if (!result.meta.changes) return error('Shop link has been revoked.', 403);
    } else {
      await db.prepare('INSERT INTO products (id,name,sku) VALUES(?,?,?)').bind(productId, name, sku).run();
    }
    return json({ id: productId }, 201);
  }
  if (access.role !== 'owner') return error('Owner access is required.', 403);
  if (url.pathname === '/api/workspace') {
    if (!name) return error('Enter a workspace name.');
    await db.prepare('INSERT INTO workspace_settings(id,name) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name').bind(name).run();
    return json({ saved: true });
  }
  if (url.pathname === '/api/shops') {
    if (!name) return error('Enter a shop name.');
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO shops(id,name) VALUES(?,?)').bind(id, name).run();
    return json({ id }, 201);
  }
  if (url.pathname === '/api/link' && idFormat.test(data.id)) {
    const key = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const result = await db.prepare('UPDATE shops SET link_hash = ? WHERE id = ? AND active = 1').bind(await hash(key), data.id).run();
    if (!result.meta.changes) return error('Select an active shop.', 404);
    return json({ key });
  }
  if (url.pathname === '/api/archive' && idFormat.test(data.id) && ['products', 'shops'].includes(data.type)) {
    const sql = data.type === 'shops'
      ? 'UPDATE shops SET active = 0, link_hash = NULL WHERE id = ?'
      : 'UPDATE products SET active = 0 WHERE id = ?';
    const result = await db.prepare(sql).bind(data.id).run();
    return result.meta.changes ? json({ archived: true }) : error('Record not found.', 404);
  }
  return error('Route not found.', 404);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch { return error('Stock service unavailable. Retry without closing the page.', 500); }
  }
};

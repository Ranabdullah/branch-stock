CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  link_hash TEXT UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  shop_id TEXT REFERENCES shops(id),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS stock (
  shop_id TEXT NOT NULL REFERENCES shops(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 0 AND 100000000),
  PRIMARY KEY(shop_id, product_id)
);
CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  kind TEXT NOT NULL CHECK(kind IN ('set','in','out')),
  entered INTEGER NOT NULL CHECK(entered BETWEEN 0 AND 100000000),
  before_qty INTEGER NOT NULL,
  after_qty INTEGER NOT NULL CHECK(after_qty BETWEEN 0 AND 100000000),
  actor TEXT NOT NULL CHECK(actor IN ('owner','shop')),
  note TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS movements_shop_date ON movements(shop_id, recorded_at DESC);
CREATE TRIGGER IF NOT EXISTS apply_movement AFTER INSERT ON movements BEGIN
  INSERT INTO stock(shop_id, product_id, quantity) VALUES(NEW.shop_id, NEW.product_id, NEW.after_qty)
  ON CONFLICT(shop_id, product_id) DO UPDATE SET quantity = excluded.quantity;
END;

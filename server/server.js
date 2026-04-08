const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Database setup
const Database = require('better-sqlite3');
const basePath = process.env.USER_DATA_PATH || path.join(__dirname, '..', 'data');
if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });

const dbPath = path.join(basePath, 'sdfashion.db');

// If packaged, and the database doesn't exist, try to copy the initial one from resources
const sourceDb = path.join(__dirname, '..', 'data', 'sdfashion.db');
if (process.env.USER_DATA_PATH && !fs.existsSync(dbPath) && fs.existsSync(sourceDb)) {
  fs.copyFileSync(sourceDb, dbPath);
}

const db = new Database(dbPath);

// Tables তৈরি করো
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    total REAL NOT NULL,
    discount REAL DEFAULT 0,
    paid REAL NOT NULL,
    due REAL DEFAULT 0,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER,
    item_name TEXT,
    size TEXT,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY(sale_id) REFERENCES sales(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

// Migrate sale_items to allow free-text items if needed
const saleItemsInfo = db.prepare("PRAGMA table_info('sale_items')").all();
const hasItemName = saleItemsInfo.some(c => c.name === 'item_name');
const hasSize = saleItemsInfo.some(c => c.name === 'size');
const productIdNotNull = saleItemsInfo.some(c => c.name === 'product_id' && c.notnull === 1);

if (!hasItemName || !hasSize || productIdNotNull) {
  db.exec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS sale_items_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER,
      item_name TEXT,
      size TEXT,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
    INSERT INTO sale_items_v2 (id, sale_id, product_id, item_name, size, quantity, price)
      SELECT id, sale_id, product_id, NULL, NULL, quantity, price FROM sale_items;
    DROP TABLE sale_items;
    ALTER TABLE sale_items_v2 RENAME TO sale_items;
    COMMIT;
  `);
}

// Default user check
try {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!user) {
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
      .run('admin', 'admin', 'admin');
  }
} catch (err) {
  console.error('Error setting up default user:', err);
}


// API Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
    if (user) {
      // In a real app, you'd use JWT. For this simple case, we'll just confirm.
      res.json({ token: 'dummy-token-for-' + user.id, username: user.username });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = db.prepare(`
      SELECT COUNT(id) as count, SUM(total) as total
      FROM sales WHERE DATE(created_at) = ?
    `).get(today);

    res.json({ today: todayStats });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load dashboard data' });
  }
});

app.get('/api/report', (req, res) => {
  const { month } = req.query; // e.g., "2024-04"
  try {
    const stats = db.prepare(`
      SELECT COUNT(id) as count, SUM(total) as total
      FROM sales WHERE strftime('%Y-%m', created_at) = ?
    `).get(month);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load report' });
  }
});

app.get('/api/sales', (req, res) => {
  try {
    const sales = db.prepare('SELECT * FROM sales ORDER BY created_at DESC').all();
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch sales' });
  }
});

app.post('/api/sales', (req, res) => {
  const { customerName, customerPhone, note, items } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ message: 'No items in sale' });
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const insertSale = db.prepare('INSERT INTO sales (total, paid, note, customer_id) VALUES (?, ?, ?, ?)');
  const insertItem = db.prepare('INSERT INTO sale_items (sale_id, product_id, item_name, size, quantity, price) VALUES (?, ?, ?, ?, ?, ?)');

  try {
    const result = db.transaction(() => {
      let customerId = null;
      if (customerName) {
        let customer = db.prepare('SELECT id FROM customers WHERE name = ?').get(customerName);
        if (customer) {
          customerId = customer.id;
        } else {
          const custResult = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(customerName, customerPhone);
          customerId = custResult.lastInsertRowid;
        }
      }

      const saleInfo = insertSale.run(total, total, note, customerId);
      const saleId = saleInfo.lastInsertRowid;

      for (const item of items) {
        insertItem.run(saleId, item.product_id, item.product_name, item.size, item.quantity, item.price);
      }
      return { saleId };
    })();
    res.status(201).json({ message: 'Sale completed!', saleId: result.saleId });
  } catch (err) {
    console.error('Sale transaction failed:', err);
    res.status(500).json({ message: 'Failed to complete sale' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

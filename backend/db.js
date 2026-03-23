const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || '/data/rental.db';

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function runMigrations() {
  // Fix: recreate projects table without FK on created_by if it has one
  // (old DBs fail with "FOREIGN KEY constraint failed" when JWT user doesn't match DB)
  try {
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='projects'").get();
    if (sql && sql.sql && sql.sql.includes('created_by TEXT REFERENCES')) {
      console.log('Migrating projects table: removing created_by FK constraint...');
      db.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN TRANSACTION;
        ALTER TABLE projects RENAME TO _projects_old;
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          contact_id TEXT REFERENCES contacts(id),
          status TEXT DEFAULT 'draft',
          start_date DATE,
          end_date DATE,
          venue TEXT,
          description TEXT,
          notes TEXT,
          eula_text TEXT,
          signature_data TEXT,
          signed_at DATETIME,
          signed_by TEXT,
          created_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO projects SELECT * FROM _projects_old;
        DROP TABLE _projects_old;
        COMMIT;
        PRAGMA foreign_keys = ON;
      `);
      console.log('Migration complete.');
    }
  } catch(e) {
    console.error('Migration error (non-fatal):', e.message);
    db.pragma('foreign_keys = ON');
  }

  // Migration: add project_line_items table if missing (upgrading from older versions)
  try {
    db.prepare("SELECT 1 FROM project_line_items LIMIT 1").get();
  } catch(e) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_line_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        unit_price REAL DEFAULT 0,
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created project_line_items table.');
  }

  // Migration: add maintenance_records table if missing (upgrading from v1)
  try {
    db.prepare("SELECT 1 FROM maintenance_records LIMIT 1").get();
  } catch(e) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS maintenance_records (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        type TEXT DEFAULT 'repair',
        description TEXT NOT NULL,
        cost REAL,
        vendor TEXT,
        notes TEXT,
        status TEXT DEFAULT 'open',
        resolution_notes TEXT,
        reported_by TEXT,
        resolved_by TEXT,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created maintenance_records table.');
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT DEFAULT 'operator',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS manufacturers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#4f46e5',
      parent_id TEXT REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS storage_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS equipment_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      manufacturer_id TEXT REFERENCES manufacturers(id),
      category_id TEXT REFERENCES categories(id),
      description TEXT,
      weight_kg REAL,
      rental_price_day REAL DEFAULT 0,
      replacement_value REAL DEFAULT 0,
      image_path TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL REFERENCES equipment_models(id),
      barcode TEXT UNIQUE NOT NULL,
      serial_number TEXT,
      storage_location_id TEXT REFERENCES storage_locations(id),
      condition TEXT DEFAULT 'excellent',
      notes TEXT,
      purchase_date DATE,
      purchase_price REAL,
      status TEXT DEFAULT 'available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      address TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_id TEXT REFERENCES contacts(id),
      status TEXT DEFAULT 'draft',
      start_date DATE,
      end_date DATE,
      venue TEXT,
      description TEXT,
      notes TEXT,
      eula_text TEXT,
      signature_data TEXT,
      signed_at DATETIME,
      signed_by TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      asset_id TEXT NOT NULL REFERENCES assets(id),
      checked_out_at DATETIME,
      checked_out_by TEXT,
      checked_in_at DATETIME,
      checked_in_by TEXT,
      expected_return_date DATE,
      notes TEXT,
      status TEXT DEFAULT 'booked'
    );

    CREATE TABLE IF NOT EXISTS project_line_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      description TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      notes TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scan_log (
      id TEXT PRIMARY KEY,
      barcode TEXT,
      asset_id TEXT,
      project_id TEXT,
      action TEXT,
      user_id TEXT,
      result TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS maintenance_records (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      type TEXT DEFAULT 'repair',
      description TEXT NOT NULL,
      cost REAL,
      vendor TEXT,
      notes TEXT,
      status TEXT DEFAULT 'open',
      resolution_notes TEXT,
      reported_by TEXT,
      resolved_by TEXT,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO settings VALUES ('company_name', 'My Rental Company');
    INSERT OR IGNORE INTO settings VALUES ('eula_default', 'By signing below, the client acknowledges receipt of the listed equipment in good working condition and agrees to return all items in the same condition. The client accepts full financial responsibility for any loss, theft, or damage to the equipment during the rental period. Equipment must be returned by the agreed date. Late returns may incur additional charges.');
  `);

  runMigrations();

  // Seed default admin user
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const { v4: uuidv4 } = require('uuid');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(), 'admin', hash, 'Administrator', 'admin'
    );
    console.log('Default admin created: admin / admin123');
  }

  // Seed sample categories
  const catExists = db.prepare('SELECT id FROM categories LIMIT 1').get();
  if (!catExists) {
    const { v4: uuidv4 } = require('uuid');
    const cats = [
      [uuidv4(), 'Lighting', '#f59e0b'],
      [uuidv4(), 'Audio', '#3b82f6'],
      [uuidv4(), 'Video', '#8b5cf6'],
      [uuidv4(), 'Rigging', '#ef4444'],
      [uuidv4(), 'Power', '#10b981'],
      [uuidv4(), 'Cables', '#6b7280'],
    ];
    const ins = db.prepare('INSERT INTO categories (id, name, color) VALUES (?, ?, ?)');
    cats.forEach(c => ins.run(...c));
  }
}

module.exports = { getDb };

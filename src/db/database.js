"use strict";

const { Pool } = require("pg");
const { env } = require("../config/env");

const pool = env.databaseUrl
  ? new Pool({
      connectionString: env.databaseUrl,
      ssl: /localhost|127\.0\.0\.1/.test(env.databaseUrl)
        ? false
        : { rejectUnauthorized: false }
    })
  : null;

let schemaReady = false;
let schemaError = "";

async function initializeSchema() {
  if (!pool) return false;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id BIGSERIAL PRIMARY KEY,
      confirmation_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 30),
      reservation_at TIMESTAMPTZ NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      staff_notes TEXT NOT NULL DEFAULT '',
      order_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      order_total_sar NUMERIC(12,2) NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'form',
      language TEXT NOT NULL DEFAULT 'ar',
      status TEXT NOT NULL DEFAULT 'new',
      reminder_sent_at TIMESTAMPTZ,
      reminder_message_sid TEXT,
      reminder_attempts INTEGER NOT NULL DEFAULT 0,
      reminder_last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS staff_notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS order_items JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS order_total_sar NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'form';
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE SEQUENCE IF NOT EXISTS reservation_number_seq START WITH 1 INCREMENT BY 1 MINVALUE 1;
    CREATE INDEX IF NOT EXISTS reservations_reminder_due_idx
      ON reservations (reservation_at)
      WHERE reminder_sent_at IS NULL AND status IN ('new','confirmed');
    CREATE INDEX IF NOT EXISTS reservations_created_idx ON reservations (created_at DESC);

    CREATE TABLE IF NOT EXISTS table_orders (
      id BIGSERIAL PRIMARY KEY,
      order_code TEXT UNIQUE NOT NULL,
      table_number TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      order_mode TEXT NOT NULL DEFAULT 'table',
      notes TEXT NOT NULL DEFAULT '',
      staff_notes TEXT NOT NULL DEFAULT '',
      order_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      order_total_sar NUMERIC(12,2) NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'ar',
      source TEXT NOT NULL DEFAULT 'sara_voice',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS order_mode TEXT NOT NULL DEFAULT 'table';
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS staff_notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE SEQUENCE IF NOT EXISTS table_order_number_seq START WITH 1 INCREMENT BY 1 MINVALUE 1;
    CREATE INDEX IF NOT EXISTS table_orders_active_idx ON table_orders (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS menu_item_overrides (
      id BIGSERIAL PRIMARY KEY,
      item_key TEXT UNIQUE NOT NULL,
      category TEXT,
      name_ar TEXT,
      name_en TEXT,
      name_fr TEXT,
      description_ar TEXT,
      description_en TEXT,
      description_fr TEXT,
      price_text TEXT,
      image_url TEXT,
      signature BOOLEAN,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      calories INTEGER,
      modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_custom BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      category_sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE menu_item_overrides ADD COLUMN IF NOT EXISTS category_sort_order INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE menu_item_overrides ADD COLUMN IF NOT EXISTS calories INTEGER;
    ALTER TABLE menu_item_overrides ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE menu_item_overrides ADD COLUMN IF NOT EXISTS modifiers JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS menu_item_overrides_active_idx
      ON menu_item_overrides (active, visible, updated_at DESC);

    CREATE TABLE IF NOT EXISTS menu_categories (
      id BIGSERIAL PRIMARY KEY,
      name_ar TEXT UNIQUE NOT NULL,
      name_en TEXT NOT NULL DEFAULT '',
      name_fr TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS menu_images (
      id UUID PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS restaurant_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      name_ar TEXT NOT NULL DEFAULT 'كافيه فيكتور هوغو',
      name_en TEXT NOT NULL DEFAULT 'Café Victor Hugo',
      name_fr TEXT NOT NULL DEFAULT 'Café Victor Hugo',
      subtitle_ar TEXT NOT NULL DEFAULT 'مقهى ومطعم',
      subtitle_en TEXT NOT NULL DEFAULT 'Café & Restaurant',
      subtitle_fr TEXT NOT NULL DEFAULT 'Café & Restaurant',
      hero_eyebrow_ar TEXT NOT NULL DEFAULT 'منيو ذكي • سارة',
      hero_eyebrow_en TEXT NOT NULL DEFAULT 'Smart Menu • Sara',
      hero_eyebrow_fr TEXT NOT NULL DEFAULT 'Menu intelligent • Sara',
      hero_title_ar TEXT NOT NULL DEFAULT 'حياكم الله',
      hero_title_en TEXT NOT NULL DEFAULT 'Welcome',
      hero_title_fr TEXT NOT NULL DEFAULT 'Bienvenue',
      hero_text_ar TEXT NOT NULL DEFAULT 'اطلب، احجز، أو اسأل سارة عن المنيو.',
      hero_text_en TEXT NOT NULL DEFAULT 'Order, reserve a table, or ask Sara about the menu.',
      hero_text_fr TEXT NOT NULL DEFAULT 'Commandez, réservez une table ou demandez conseil à Sara.',
      announcement_ar TEXT NOT NULL DEFAULT '',
      announcement_en TEXT NOT NULL DEFAULT '',
      announcement_fr TEXT NOT NULL DEFAULT '',
      announcement_visible BOOLEAN NOT NULL DEFAULT FALSE,
      logo_url TEXT NOT NULL DEFAULT 'https://digitalmenu.tn/storage/logos/cafe-victor-hugo-la-marsa-177633909869e21c70f3bb8-logo.jpg',
      banner_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO restaurant_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);

  return true;
}

async function ensureSchemaReady() {
  if (!pool) return false;
  if (schemaReady) return true;

  try {
    await initializeSchema();
    schemaReady = true;
    schemaError = "";
    return true;
  } catch (error) {
    schemaReady = false;
    schemaError = String(error?.message || error).slice(0, 500);
    console.error("Database schema initialization failed:", error);
    return false;
  }
}

function getSchemaState() {
  return { ready: schemaReady, error: schemaError };
}

module.exports = {
  ensureSchemaReady,
  getSchemaState,
  initializeSchema,
  pool
};

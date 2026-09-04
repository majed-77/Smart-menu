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
      name_ar TEXT NOT NULL DEFAULT 'مطاعم سفرة الديرة',
      name_en TEXT NOT NULL DEFAULT 'Safrat Al-Dayrah',
      name_fr TEXT NOT NULL DEFAULT 'Safrat Al-Dayrah',
      subtitle_ar TEXT NOT NULL DEFAULT 'رز ولحم ودجاج على الأصول',
      subtitle_en TEXT NOT NULL DEFAULT 'Authentic Saudi rice, lamb and chicken',
      subtitle_fr TEXT NOT NULL DEFAULT 'Riz, agneau et poulet à la saoudienne',
      hero_eyebrow_ar TEXT NOT NULL DEFAULT 'منيو ذكي • سارة',
      hero_eyebrow_en TEXT NOT NULL DEFAULT 'Smart Menu • Sara',
      hero_eyebrow_fr TEXT NOT NULL DEFAULT 'Menu intelligent • Sara',
      hero_title_ar TEXT NOT NULL DEFAULT 'سفرة تجمعكم',
      hero_title_en TEXT NOT NULL DEFAULT 'A table that brings everyone together',
      hero_title_fr TEXT NOT NULL DEFAULT 'Une table qui rassemble',
      hero_text_ar TEXT NOT NULL DEFAULT 'أطباق رز سعودية ومذاق شعبي أصيل. اطلب، احجز، أو اسأل سارة.',
      hero_text_en TEXT NOT NULL DEFAULT 'Authentic Saudi rice platters. Order, reserve, or ask Sara.',
      hero_text_fr TEXT NOT NULL DEFAULT 'Plats de riz saoudiens authentiques. Commandez, réservez ou demandez à Sara.',
      announcement_ar TEXT NOT NULL DEFAULT 'السعرات تقديرية للحصة الموضحة.',
      announcement_en TEXT NOT NULL DEFAULT 'Calories are estimated per listed serving.',
      announcement_fr TEXT NOT NULL DEFAULT 'Les calories sont estimées par portion indiquée.',
      announcement_visible BOOLEAN NOT NULL DEFAULT TRUE,
      logo_url TEXT NOT NULL DEFAULT '/assets/images/safrat-aldayrah-logo.svg',
      banner_url TEXT NOT NULL DEFAULT '/assets/images/safrat-aldayrah-hero.webp',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- restaurant_settings existed in older Smart Menu releases with fewer columns.
    -- CREATE TABLE IF NOT EXISTS does not add new fields to an existing table, so
    -- explicitly migrate every editable branding field before the dashboard uses it.
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS name_ar TEXT NOT NULL DEFAULT 'مطاعم سفرة الديرة';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS name_en TEXT NOT NULL DEFAULT 'Safrat Al-Dayrah';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS name_fr TEXT NOT NULL DEFAULT 'Safrat Al-Dayrah';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS subtitle_ar TEXT NOT NULL DEFAULT 'رز ولحم ودجاج على الأصول';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS subtitle_en TEXT NOT NULL DEFAULT 'Authentic Saudi rice, lamb and chicken';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS subtitle_fr TEXT NOT NULL DEFAULT 'Riz, agneau et poulet à la saoudienne';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_eyebrow_ar TEXT NOT NULL DEFAULT 'منيو ذكي • سارة';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_eyebrow_en TEXT NOT NULL DEFAULT 'Smart Menu • Sara';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_eyebrow_fr TEXT NOT NULL DEFAULT 'Menu intelligent • Sara';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_title_ar TEXT NOT NULL DEFAULT 'سفرة تجمعكم';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_title_en TEXT NOT NULL DEFAULT 'A table that brings everyone together';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_title_fr TEXT NOT NULL DEFAULT 'Une table qui rassemble';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_text_ar TEXT NOT NULL DEFAULT 'أطباق رز سعودية ومذاق شعبي أصيل. اطلب، احجز، أو اسأل سارة.';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_text_en TEXT NOT NULL DEFAULT 'Authentic Saudi rice platters. Order, reserve, or ask Sara.';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS hero_text_fr TEXT NOT NULL DEFAULT 'Plats de riz saoudiens authentiques. Commandez, réservez ou demandez à Sara.';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS announcement_ar TEXT NOT NULL DEFAULT 'السعرات تقديرية للحصة الموضحة.';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS announcement_en TEXT NOT NULL DEFAULT 'Calories are estimated per listed serving.';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS announcement_fr TEXT NOT NULL DEFAULT 'Les calories sont estimées par portion indiquée.';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS announcement_visible BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '/assets/images/safrat-aldayrah-logo.svg';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS banner_url TEXT NOT NULL DEFAULT '/assets/images/safrat-aldayrah-hero.webp';
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    INSERT INTO restaurant_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS app_migrations (
      key TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    DO $migration$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM app_migrations WHERE key='safrat-aldayrah-v1') THEN
        UPDATE restaurant_settings SET
          name_ar='مطاعم سفرة الديرة', name_en='Safrat Al-Dayrah', name_fr='Safrat Al-Dayrah',
          subtitle_ar='رز ولحم ودجاج على الأصول',
          subtitle_en='Authentic Saudi rice, lamb and chicken',
          subtitle_fr='Riz, agneau et poulet à la saoudienne',
          hero_eyebrow_ar='منيو ذكي • سارة', hero_eyebrow_en='Smart Menu • Sara', hero_eyebrow_fr='Menu intelligent • Sara',
          hero_title_ar='سفرة تجمعكم',
          hero_title_en='A table that brings everyone together',
          hero_title_fr='Une table qui rassemble',
          hero_text_ar='أطباق رز سعودية ومذاق شعبي أصيل. اطلب، احجز، أو اسأل سارة.',
          hero_text_en='Authentic Saudi rice platters. Order, reserve, or ask Sara.',
          hero_text_fr='Plats de riz saoudiens authentiques. Commandez, réservez ou demandez à Sara.',
          announcement_ar='السعرات تقديرية للحصة الموضحة.',
          announcement_en='Calories are estimated per listed serving.',
          announcement_fr='Les calories sont estimées par portion indiquée.',
          announcement_visible=TRUE,
          logo_url='/assets/images/safrat-aldayrah-logo.svg',
          banner_url='/assets/images/safrat-aldayrah-hero.webp',
          updated_at=NOW()
        WHERE id=1;

        DELETE FROM menu_item_overrides;
        DELETE FROM menu_categories;
        INSERT INTO app_migrations (key) VALUES ('safrat-aldayrah-v1');
      END IF;
    END
    $migration$;
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

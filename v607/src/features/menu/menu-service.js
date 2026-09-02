"use strict";

const crypto = require("crypto");
const { pool, ensureSchemaReady } = require("../../db/database");
const { BASE_CATEGORIES, BASE_MENU_ITEMS } = require("../../data/base-menu");
const {
  cleanImageUrl,
  cleanText,
  clampInteger,
  normalizeMenuModifiers
} = require("../../lib/validation");

function cloneBaseItems() {
  return BASE_MENU_ITEMS.map((item) => ({
    ...item,
    modifiers: Array.isArray(item.modifiers) ? item.modifiers.map((m) => ({ ...m })) : []
  }));
}

async function ensureBaseCategories() {
  if (!pool || !(await ensureSchemaReady())) return;

  for (const category of BASE_CATEGORIES) {
    await pool.query(
      `INSERT INTO menu_categories (name_ar, name_en, name_fr, sort_order, visible)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (name_ar) DO UPDATE SET
         name_en = CASE WHEN menu_categories.name_en = '' THEN EXCLUDED.name_en ELSE menu_categories.name_en END,
         name_fr = CASE WHEN menu_categories.name_fr = '' THEN EXCLUDED.name_fr ELSE menu_categories.name_fr END`,
      [
        category.nameAr,
        category.nameEn || "",
        category.nameFr || "",
        category.sortOrder,
        category.visible !== false
      ]
    );
  }
}

async function readCategories() {
  if (!pool || !(await ensureSchemaReady())) {
    return BASE_CATEGORIES.map((category, index) => ({
      id: null,
      nameAr: category.nameAr,
      nameEn: category.nameEn || "",
      nameFr: category.nameFr || "",
      sortOrder: Number(category.sortOrder ?? index),
      visible: category.visible !== false
    }));
  }

  await ensureBaseCategories();
  const result = await pool.query(
    `SELECT id, name_ar, name_en, name_fr, sort_order, visible
     FROM menu_categories
     ORDER BY sort_order, id`
  );

  return result.rows.map((row) => ({
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en || "",
    nameFr: row.name_fr || "",
    sortOrder: Number(row.sort_order || 0),
    visible: row.visible !== false
  }));
}

async function readOverrides() {
  if (!pool || !(await ensureSchemaReady())) return [];
  const result = await pool.query(
    `SELECT
       item_key, category,
       name_ar, name_en, name_fr,
       description_ar, description_en, description_fr,
       price_text, image_url, signature, active, visible,
       calories, modifiers, is_custom, sort_order, category_sort_order, updated_at
     FROM menu_item_overrides
     ORDER BY category_sort_order, sort_order, id`
  );
  return result.rows;
}

function mergeBaseItem(item, row) {
  if (!row) return { ...item };

  return {
    ...item,
    category: row.category ?? item.category,
    nameAr: row.name_ar ?? item.nameAr,
    nameEn: row.name_en ?? item.nameEn,
    nameFr: row.name_fr ?? item.nameFr,
    descriptionAr: row.description_ar ?? item.descriptionAr,
    descriptionEn: row.description_en ?? item.descriptionEn,
    descriptionFr: row.description_fr ?? item.descriptionFr,
    priceText: row.price_text ?? item.priceText,
    imageUrl: row.image_url ?? item.imageUrl,
    signature: row.signature == null ? item.signature : Boolean(row.signature),
    active: row.active == null ? item.active : Boolean(row.active),
    visible: row.visible == null ? item.visible : Boolean(row.visible),
    calories: row.calories == null ? item.calories : Number(row.calories),
    modifiers: Array.isArray(row.modifiers) ? row.modifiers : item.modifiers,
    sortOrder: Number(row.sort_order ?? item.sortOrder),
    categorySortOrder: Number(row.category_sort_order ?? item.categorySortOrder),
    custom: false
  };
}

function mapCustomItem(row) {
  return {
    itemKey: row.item_key,
    category: row.category || "أخرى",
    nameAr: row.name_ar || "صنف جديد",
    nameEn: row.name_en || row.name_ar || "",
    nameFr: row.name_fr || row.name_ar || "",
    descriptionAr: row.description_ar || "",
    descriptionEn: row.description_en || row.description_ar || "",
    descriptionFr: row.description_fr || row.description_ar || "",
    priceText: row.price_text || "—",
    imageUrl: row.image_url || "",
    signature: Boolean(row.signature),
    active: Boolean(row.active),
    visible: row.visible !== false,
    calories: row.calories == null ? null : Number(row.calories),
    modifiers: Array.isArray(row.modifiers) ? row.modifiers : [],
    custom: true,
    sortOrder: Number(row.sort_order || 0),
    categorySortOrder: Number(row.category_sort_order || 0)
  };
}

async function getMenu({ includeInactive = false } = {}) {
  const base = cloneBaseItems();
  const overrides = await readOverrides();
  const byKey = new Map(overrides.map((row) => [row.item_key, row]));

  const items = base.map((item) => mergeBaseItem(item, byKey.get(item.itemKey)));

  for (const row of overrides) {
    if (row.is_custom) items.push(mapCustomItem(row));
  }

  items.sort(
    (a, b) =>
      Number(a.categorySortOrder || 0) - Number(b.categorySortOrder || 0) ||
      String(a.category || "").localeCompare(String(b.category || ""), "ar") ||
      Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
      String(a.nameAr || "").localeCompare(String(b.nameAr || ""), "ar")
  );

  return includeInactive ? items : items.filter((item) => item.visible !== false);
}

function normalizeMenuPayload(body = {}) {
  return {
    category: cleanText(body.category, 120) || "أخرى",
    nameAr: cleanText(body.nameAr, 160),
    nameEn: cleanText(body.nameEn, 160),
    nameFr: cleanText(body.nameFr, 160),
    descriptionAr: cleanText(body.descriptionAr, 800),
    descriptionEn: cleanText(body.descriptionEn, 800),
    descriptionFr: cleanText(body.descriptionFr, 800),
    priceText: cleanText(body.priceText, 40) || "—",
    imageUrl: cleanImageUrl(body.imageUrl),
    signature: Boolean(body.signature),
    active: body.active !== false,
    visible: body.visible !== false,
    calories:
      body.calories === "" || body.calories == null
        ? null
        : clampInteger(body.calories, 0, 10000, 0),
    modifiers: normalizeMenuModifiers(body.modifiers),
    sortOrder: clampInteger(body.sortOrder, -10000, 10000, 0),
    categorySortOrder: clampInteger(body.categorySortOrder, -10000, 10000, 0)
  };
}

async function saveMenuItem(body = {}) {
  if (!pool || !(await ensureSchemaReady())) {
    const error = new Error("قاعدة البيانات غير جاهزة.");
    error.status = 503;
    throw error;
  }

  const suppliedKey = cleanText(body.itemKey, 200);
  const isCustom = Boolean(body.custom) || !suppliedKey;
  const itemKey = suppliedKey || `custom:${crypto.randomUUID()}`;
  const item = normalizeMenuPayload(body);

  if (!item.nameAr) {
    const error = new Error("اسم الصنف بالعربية مطلوب.");
    error.status = 400;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO menu_item_overrides (
       item_key, category,
       name_ar, name_en, name_fr,
       description_ar, description_en, description_fr,
       price_text, image_url, signature, active, visible,
       calories, modifiers, is_custom, sort_order, category_sort_order, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,NOW()
     )
     ON CONFLICT (item_key) DO UPDATE SET
       category=EXCLUDED.category,
       name_ar=EXCLUDED.name_ar,
       name_en=EXCLUDED.name_en,
       name_fr=EXCLUDED.name_fr,
       description_ar=EXCLUDED.description_ar,
       description_en=EXCLUDED.description_en,
       description_fr=EXCLUDED.description_fr,
       price_text=EXCLUDED.price_text,
       image_url=EXCLUDED.image_url,
       signature=EXCLUDED.signature,
       active=EXCLUDED.active,
       visible=EXCLUDED.visible,
       calories=EXCLUDED.calories,
       modifiers=EXCLUDED.modifiers,
       is_custom=EXCLUDED.is_custom,
       sort_order=EXCLUDED.sort_order,
       category_sort_order=EXCLUDED.category_sort_order,
       updated_at=NOW()
     RETURNING item_key`,
    [
      itemKey,
      item.category,
      item.nameAr,
      item.nameEn,
      item.nameFr,
      item.descriptionAr,
      item.descriptionEn,
      item.descriptionFr,
      item.priceText,
      item.imageUrl,
      item.signature,
      item.active,
      item.visible,
      item.calories,
      JSON.stringify(item.modifiers),
      isCustom,
      item.sortOrder,
      item.categorySortOrder
    ]
  );

  return { itemKey: result.rows[0].item_key };
}

async function removeMenuItem(itemKey) {
  const key = cleanText(itemKey, 200);
  if (!key) throw Object.assign(new Error("الصنف غير محدد."), { status: 400 });

  const baseItem = BASE_MENU_ITEMS.find((item) => item.itemKey === key);
  if (baseItem) {
    await pool.query(
      `INSERT INTO menu_item_overrides (item_key, category, active, visible, is_custom)
       VALUES ($1,$2,FALSE,FALSE,FALSE)
       ON CONFLICT (item_key) DO UPDATE SET active=FALSE, visible=FALSE, updated_at=NOW()`,
      [key, baseItem.category]
    );
    return;
  }

  await pool.query("DELETE FROM menu_item_overrides WHERE item_key=$1 AND is_custom=TRUE", [key]);
}

async function restoreMenuItem(itemKey) {
  const key = cleanText(itemKey, 200);
  await pool.query(
    `UPDATE menu_item_overrides
     SET active=TRUE, visible=TRUE, updated_at=NOW()
     WHERE item_key=$1`,
    [key]
  );
}

async function saveCategory(body = {}) {
  const id = Number(body.id) || null;
  const nameAr = cleanText(body.nameAr, 120);
  const nameEn = cleanText(body.nameEn, 120);
  const nameFr = cleanText(body.nameFr, 120);
  const sortOrder = clampInteger(body.sortOrder, -10000, 10000, 0);
  const visible = body.visible !== false;

  if (!nameAr) throw Object.assign(new Error("اسم القسم بالعربية مطلوب."), { status: 400 });

  if (id) {
    const existing = await pool.query("SELECT name_ar FROM menu_categories WHERE id=$1", [id]);
    if (!existing.rowCount) throw Object.assign(new Error("القسم غير موجود."), { status: 404 });

    const previousName = existing.rows[0].name_ar;
    await pool.query(
      `UPDATE menu_categories
       SET name_ar=$1, name_en=$2, name_fr=$3, sort_order=$4, visible=$5, updated_at=NOW()
       WHERE id=$6`,
      [nameAr, nameEn, nameFr, sortOrder, visible, id]
    );

    if (previousName !== nameAr) {
      await pool.query("UPDATE menu_item_overrides SET category=$1, updated_at=NOW() WHERE category=$2", [
        nameAr,
        previousName
      ]);
    }
    return;
  }

  await pool.query(
    `INSERT INTO menu_categories (name_ar, name_en, name_fr, sort_order, visible)
     VALUES ($1,$2,$3,$4,$5)`,
    [nameAr, nameEn, nameFr, sortOrder, visible]
  );
}

async function reorderCategories(rows) {
  const categories = Array.isArray(rows) ? rows.slice(0, 200) : [];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let index = 0; index < categories.length; index += 1) {
      const id = Number(categories[index]?.id);
      if (!id) continue;
      await client.query(
        "UPDATE menu_categories SET sort_order=$1, updated_at=NOW() WHERE id=$2",
        [index, id]
      );

      const result = await client.query("SELECT name_ar FROM menu_categories WHERE id=$1", [id]);
      if (!result.rowCount) continue;
      const categoryName = result.rows[0].name_ar;

      await client.query(
        "UPDATE menu_item_overrides SET category_sort_order=$1, updated_at=NOW() WHERE category=$2",
        [index, categoryName]
      );

      for (const baseItem of BASE_MENU_ITEMS.filter((item) => item.category === categoryName)) {
        await client.query(
          `INSERT INTO menu_item_overrides (item_key, category, category_sort_order, is_custom)
           VALUES ($1,$2,$3,FALSE)
           ON CONFLICT (item_key) DO UPDATE SET
             category_sort_order=EXCLUDED.category_sort_order,
             updated_at=NOW()`,
          [baseItem.itemKey, categoryName, index]
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function removeCategory(id) {
  const result = await pool.query("SELECT name_ar FROM menu_categories WHERE id=$1", [Number(id)]);
  if (!result.rowCount) throw Object.assign(new Error("القسم غير موجود."), { status: 404 });

  const nameAr = result.rows[0].name_ar;
  const count = (await getMenu({ includeInactive: true })).filter(
    (item) => item.category === nameAr && item.active
  ).length;

  if (count) {
    throw Object.assign(new Error(`انقل أو احذف أصناف القسم أولًا (${count} صنف).`), {
      status: 409
    });
  }

  await pool.query("DELETE FROM menu_categories WHERE id=$1", [Number(id)]);
}

async function reorderItems(rows) {
  const items = Array.isArray(rows) ? rows.slice(0, 500) : [];
  if (!items.length) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const category = cleanText(items[0]?.category, 120);
    const categoryResult = await client.query(
      "SELECT sort_order FROM menu_categories WHERE name_ar=$1",
      [category]
    );
    const categorySortOrder = Number(categoryResult.rows[0]?.sort_order || 0);

    for (let index = 0; index < items.length; index += 1) {
      const itemKey = cleanText(items[index]?.itemKey, 200);
      if (!itemKey) continue;

      await client.query(
        `INSERT INTO menu_item_overrides (
           item_key, category, sort_order, category_sort_order, is_custom
         ) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (item_key) DO UPDATE SET
           category=EXCLUDED.category,
           sort_order=EXCLUDED.sort_order,
           category_sort_order=EXCLUDED.category_sort_order,
           updated_at=NOW()`,
        [itemKey, category, index, categorySortOrder, itemKey.startsWith("custom:")]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getMenu,
  readCategories,
  removeCategory,
  removeMenuItem,
  reorderCategories,
  reorderItems,
  restoreMenuItem,
  saveCategory,
  saveMenuItem
};

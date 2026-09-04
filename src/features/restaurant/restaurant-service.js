"use strict";

const { pool, ensureSchemaReady } = require("../../db/database");
const { cleanText } = require("../../lib/validation");

const DEFAULT_PROFILE = Object.freeze({
  nameAr: "مطاعم سفرة الديرة",
  nameEn: "Safrat Al-Dayrah",
  nameFr: "Safrat Al-Dayrah",
  subtitleAr: "رز ولحم ودجاج على الأصول",
  subtitleEn: "Authentic Saudi rice, lamb and chicken",
  subtitleFr: "Riz, agneau et poulet à la saoudienne",
  heroEyebrowAr: "منيو ذكي • سارة",
  heroEyebrowEn: "Smart Menu • Sara",
  heroEyebrowFr: "Menu intelligent • Sara",
  heroTitleAr: "سفرة تجمعكم",
  heroTitleEn: "A table that brings everyone together",
  heroTitleFr: "Une table qui rassemble",
  heroTextAr: "أطباق رز سعودية ومذاق شعبي أصيل. اطلب، احجز، أو اسأل سارة.",
  heroTextEn: "Authentic Saudi rice platters. Order, reserve, or ask Sara.",
  heroTextFr: "Plats de riz saoudiens authentiques. Commandez, réservez ou demandez à Sara.",
  announcementAr: "السعرات تقديرية للحصة الموضحة.",
  announcementEn: "Calories are estimated per listed serving.",
  announcementFr: "Les calories sont estimées par portion indiquée.",
  announcementVisible: true,
  logoUrl: "/assets/images/safrat-aldayrah-logo.svg",
  bannerUrl: "/assets/images/safrat-aldayrah-hero.webp"
});

function mapProfileRow(row = {}) {
  return {
    nameAr: row.name_ar ?? DEFAULT_PROFILE.nameAr,
    nameEn: row.name_en ?? DEFAULT_PROFILE.nameEn,
    nameFr: row.name_fr ?? DEFAULT_PROFILE.nameFr,
    subtitleAr: row.subtitle_ar ?? DEFAULT_PROFILE.subtitleAr,
    subtitleEn: row.subtitle_en ?? DEFAULT_PROFILE.subtitleEn,
    subtitleFr: row.subtitle_fr ?? DEFAULT_PROFILE.subtitleFr,
    heroEyebrowAr: row.hero_eyebrow_ar ?? DEFAULT_PROFILE.heroEyebrowAr,
    heroEyebrowEn: row.hero_eyebrow_en ?? DEFAULT_PROFILE.heroEyebrowEn,
    heroEyebrowFr: row.hero_eyebrow_fr ?? DEFAULT_PROFILE.heroEyebrowFr,
    heroTitleAr: row.hero_title_ar ?? DEFAULT_PROFILE.heroTitleAr,
    heroTitleEn: row.hero_title_en ?? DEFAULT_PROFILE.heroTitleEn,
    heroTitleFr: row.hero_title_fr ?? DEFAULT_PROFILE.heroTitleFr,
    heroTextAr: row.hero_text_ar ?? DEFAULT_PROFILE.heroTextAr,
    heroTextEn: row.hero_text_en ?? DEFAULT_PROFILE.heroTextEn,
    heroTextFr: row.hero_text_fr ?? DEFAULT_PROFILE.heroTextFr,
    announcementAr: row.announcement_ar ?? "",
    announcementEn: row.announcement_en ?? "",
    announcementFr: row.announcement_fr ?? "",
    announcementVisible: Boolean(row.announcement_visible),
    logoUrl: row.logo_url ?? DEFAULT_PROFILE.logoUrl,
    bannerUrl: row.banner_url ?? ""
  };
}

async function getRestaurantProfile() {
  if (!pool || !(await ensureSchemaReady())) return { ...DEFAULT_PROFILE };
  const result = await pool.query("SELECT * FROM restaurant_settings WHERE id=1");
  return mapProfileRow(result.rows[0] || {});
}

function normalizeProfile(body = {}) {
  return {
    nameAr: cleanText(body.nameAr, 120),
    nameEn: cleanText(body.nameEn, 120),
    nameFr: cleanText(body.nameFr, 120),
    subtitleAr: cleanText(body.subtitleAr, 200),
    subtitleEn: cleanText(body.subtitleEn, 200),
    subtitleFr: cleanText(body.subtitleFr, 200),
    heroEyebrowAr: cleanText(body.heroEyebrowAr, 160),
    heroEyebrowEn: cleanText(body.heroEyebrowEn, 160),
    heroEyebrowFr: cleanText(body.heroEyebrowFr, 160),
    heroTitleAr: cleanText(body.heroTitleAr, 200),
    heroTitleEn: cleanText(body.heroTitleEn, 200),
    heroTitleFr: cleanText(body.heroTitleFr, 200),
    heroTextAr: cleanText(body.heroTextAr, 1000),
    heroTextEn: cleanText(body.heroTextEn, 1000),
    heroTextFr: cleanText(body.heroTextFr, 1000),
    announcementAr: cleanText(body.announcementAr, 500),
    announcementEn: cleanText(body.announcementEn, 500),
    announcementFr: cleanText(body.announcementFr, 500),
    announcementVisible: body.announcementVisible === true,
    logoUrl: cleanText(body.logoUrl, 500),
    bannerUrl: cleanText(body.bannerUrl, 500)
  };
}

async function saveRestaurantProfile(body = {}) {
  if (!pool || !(await ensureSchemaReady())) {
    throw Object.assign(new Error("قاعدة البيانات غير جاهزة."), { status: 503 });
  }

  const profile = normalizeProfile(body);
  if (!profile.nameAr) {
    throw Object.assign(new Error("اسم المطعم بالعربية مطلوب."), { status: 400 });
  }

  await pool.query(
    `INSERT INTO restaurant_settings (
       id,
       name_ar, name_en, name_fr,
       subtitle_ar, subtitle_en, subtitle_fr,
       hero_eyebrow_ar, hero_eyebrow_en, hero_eyebrow_fr,
       hero_title_ar, hero_title_en, hero_title_fr,
       hero_text_ar, hero_text_en, hero_text_fr,
       announcement_ar, announcement_en, announcement_fr,
       announcement_visible, logo_url, banner_url, updated_at
     ) VALUES (
       1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       name_ar=EXCLUDED.name_ar,
       name_en=EXCLUDED.name_en,
       name_fr=EXCLUDED.name_fr,
       subtitle_ar=EXCLUDED.subtitle_ar,
       subtitle_en=EXCLUDED.subtitle_en,
       subtitle_fr=EXCLUDED.subtitle_fr,
       hero_eyebrow_ar=EXCLUDED.hero_eyebrow_ar,
       hero_eyebrow_en=EXCLUDED.hero_eyebrow_en,
       hero_eyebrow_fr=EXCLUDED.hero_eyebrow_fr,
       hero_title_ar=EXCLUDED.hero_title_ar,
       hero_title_en=EXCLUDED.hero_title_en,
       hero_title_fr=EXCLUDED.hero_title_fr,
       hero_text_ar=EXCLUDED.hero_text_ar,
       hero_text_en=EXCLUDED.hero_text_en,
       hero_text_fr=EXCLUDED.hero_text_fr,
       announcement_ar=EXCLUDED.announcement_ar,
       announcement_en=EXCLUDED.announcement_en,
       announcement_fr=EXCLUDED.announcement_fr,
       announcement_visible=EXCLUDED.announcement_visible,
       logo_url=EXCLUDED.logo_url,
       banner_url=EXCLUDED.banner_url,
       updated_at=NOW()`,
    [
      profile.nameAr,
      profile.nameEn,
      profile.nameFr,
      profile.subtitleAr,
      profile.subtitleEn,
      profile.subtitleFr,
      profile.heroEyebrowAr,
      profile.heroEyebrowEn,
      profile.heroEyebrowFr,
      profile.heroTitleAr,
      profile.heroTitleEn,
      profile.heroTitleFr,
      profile.heroTextAr,
      profile.heroTextEn,
      profile.heroTextFr,
      profile.announcementAr,
      profile.announcementEn,
      profile.announcementFr,
      profile.announcementVisible,
      profile.logoUrl,
      profile.bannerUrl
    ]
  );

  return getRestaurantProfile();
}

module.exports = {
  DEFAULT_PROFILE,
  getRestaurantProfile,
  saveRestaurantProfile
};

# Smart Menu AI — v6.0.2

نسخة معاد هيكلتها باحترافية لنظام المنيو الذكي. **العربية هي المصدر الأساسي للبيانات** والأسعار مخزنة وتعرض مباشرة بالريال السعودي (SAR). الإنجليزية والفرنسية ترجمات اختيارية.

## الهيكلة

- `server.js` تشغيل السيرفر فقط.
- `src/app.js` إعداد Express والحماية ومسارات التطبيق.
- `src/config/` قراءة متغيرات البيئة.
- `src/db/` اتصال PostgreSQL وإنشاء/ترقية الجداول.
- `src/data/base-menu.js` المنيو الأساسي العربي ومفاتيح الأصناف المتوافقة مع النسخ السابقة.
- `src/features/menu/` إدارة المنيو والأقسام.
- `src/features/restaurant/` إعدادات المطعم ولوحة الإدارة.
- `src/features/orders/` الطلبات والحجوزات والتذكيرات.
- `src/features/sara/` محركات سارة والصوت والذكاء الاصطناعي.
- `public/` صفحات العميل ولوحة المطعم والـCSS/JavaScript.
- `scripts/` فحوصات Syntax وSmoke Tests.

## الروابط

- العميل: `/`
- لوحة المطعم: `/restaurant`
- Health check: `/health`

## التشغيل

```bash
npm install
npm test
npm start
```

## متغيرات Render

انسخ أسماء المتغيرات من `.env.example` إلى Render Environment. لا ترفع ملف `.env` الحقيقي إلى GitHub.

## ملاحظات التوافق

- مفاتيح الأصناف الأساسية `item_key` بقيت متوافقة مع قاعدة بيانات v5.9.3، لذلك تعديلات المنيو السابقة لا تضيع بعد التحديث.
- مخطط PostgreSQL يستخدم ترقيات `CREATE TABLE IF NOT EXISTS` و`ALTER TABLE ... IF NOT EXISTS` ولا يحذف البيانات الحالية.
- صورة الصنف والشعار والبنر ترفع من لوحة المطعم وتحفظ في PostgreSQL.


## محرك OpenAI + Deepgram التجريبي

- STT: OpenAI (`gpt-4o-transcribe` عبر مسار hybrid).
- LLM: OpenAI، افتراضيًا `gpt-5.4-mini` ويمكن تغييره عبر `OPENAI_LLM_MODEL`.
- TTS: Deepgram Aura-2 للإنجليزية والفرنسية.
- ملاحظة مهمة: Deepgram لا يدرج العربية ضمن لغات TTS الرسمية حاليًا؛ لذلك عند اختيار العربية يستخدم هذا المحرك صوت OpenAI السعودي الاحتياطي تلقائيًا بدل إرسال العربية لصوت غير مدعوم. يمكن ضبط `DEEPGRAM_TTS_MODEL_AR` مستقبلًا إذا توفر نموذج عربي رسمي.

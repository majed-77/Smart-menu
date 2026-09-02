# Smart Menu AI — v6.0.7

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


## v6.0.3 — Deepgram STT + OpenAI

The experimental `openai-deepgram` engine now uses the requested direction:

`Deepgram Nova-3 STT (ar-SA) -> OpenAI LLM -> OpenAI TTS`

- Arabic recognition is pinned to Saudi Arabic via `DEEPGRAM_STT_LANGUAGE_AR=ar-SA`.
- The browser never receives `DEEPGRAM_API_KEY`; audio is sent to the Smart Menu server first.
- The customer UI shows only a simple Sara-ready status, not provider details.
- This engine does not use Deepgram TTS. Existing Deepgram TTS support remains available in the code for future experiments but is not part of this engine.

## v6.0.7 — إصلاح نموذج إعدادات المطعم
- إيقاف التحديث التلقائي كل 5 ثوانٍ أثناء فتح تبويب **إعدادات المطعم**.
- قبل الإصلاح كان التحديث الدوري يعيد تحميل البيانات المحفوظة من الخادم أثناء الكتابة، لذلك النص الذي يحذفه أو يعدله المستخدم كان يرجع قبل الضغط على حفظ.
- التحديث التلقائي للطلبات والحجوزات ما زال يعمل في شاشات التشغيل، ولا يتوقف إلا أثناء إدارة المنيو أو إعدادات المطعم.


## v6.0.7
- منع بقاء JavaScript/CSS القديم بعد النشر عبر إعادة التحقق من الأصول وإضافة version query.
- صفحات العميل ولوحة المطعم ترسل no-store لمنع واجهة قديمة بعد Deploy.
- المسار التجريبي يبقى Deepgram STT (ar-SA) → OpenAI LLM → OpenAI TTS.


## v6.0.7 — تحسين التقاط الصوت مع Deepgram
- حساسية أعلى للمايك في محرك Deepgram STT فقط.
- بداية تسجيل أبكر للكلام الهادئ والقصير.
- مهلة سكوت 1.25 ثانية لتجنب قطع الجملة.
- تقليل تنعيم VAD لتسريع اكتشاف أول مقطع صوتي.
- إضافة Nova-3 keyterm prompting لعبارات سعودية مهمة مثل اعتمد، تمام، حجز، طلب، رقم الجوال.

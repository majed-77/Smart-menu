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

## v6.0.9 — Cartesia voice + steadier Deepgram VAD

- Added a new experimental engine: **Deepgram STT (`ar-SA`) → OpenAI LLM → Cartesia TTS**.
- Cartesia voice ID defaults to `731ace69-ee17-41bc-8c6f-665c9f1db95c` and can be overridden with `CARTESIA_VOICE_ID`.
- Cartesia TTS uses `sonic-3.5`, API version `2026-03-01`, and Arabic language code `ar`.
- The Cartesia API key remains server-side only (`CARTESIA_API_KEY`).
- Deepgram microphone VAD was rebalanced to reduce mid-sentence cuts: start threshold `0.020`, keep threshold `0.0075`, minimum speech `300ms`, end silence `1650ms`.


## v6.0.9 — Saudi dialect hardening for Cartesia
- Keeps the selected Cartesia voice ID.
- Sends Arabic replies through a Saudi-colloquial speech copy before TTS while leaving visible chat text unchanged.
- Strengthens Sara's LLM instruction to avoid formal Arabic phrasing that pulls generic Arabic voices away from a Saudi feel.
- Uses a slightly calmer Arabic Cartesia speed (0.96) for more natural conversational delivery.
- Important: Cartesia's current public TTS language parameter is `ar`, not `ar-SA`; Cartesia Voice Localization currently exposes Modern Standard Arabic as the Arabic accent option, so code alone cannot guarantee a native Saudi phonetic accent for a generic Arabic voice.


## v6.0.11 — Cartesia Playground parity fix
- Keeps the selected Cartesia voice ID `731ace69-ee17-41bc-8c6f-665c9f1db95c`.
- Sends Sara's final reply to Cartesia without Saudi lexical rewrites or added pronunciation diacritics.
- Restores Cartesia generation speed to `1.0` instead of forcing Arabic to `0.96`.
- Keeps `language: ar`, `sonic-3.5`, and API version `2026-03-01`, matching Cartesia's documented TTS request shape.
- Saudi dialect wording remains controlled by Sara's LLM prompt; the TTS layer no longer rewrites the spoken text.
- Goal: make API playback match the behavior heard from the same voice/text in Cartesia Playground as closely as possible.

## v6.0.11 — Adaptive microphone + Cartesia native Arabic voice conditioning
- Replaces fixed Deepgram RMS thresholds with an adaptive ambient-noise floor.
- Requires a short 85ms voice hold before capture to reject plate/music spikes.
- Uses a lower adaptive release threshold and 2.1s end-of-turn hangover to avoid cutting natural pauses.
- Keeps Deepgram STT pinned to ar-SA.
- For Arabic Cartesia TTS, omits the generic language override so the selected voice/model can preserve its native locale/accent conditioning. English/French still send explicit language codes.
- Removes generation speed/volume overrides for Cartesia parity.

## v6.0.12 microphone + Cartesia voice parity
- iPhone microphone capture now enables AGC and no longer forces voiceIsolation, which can gate quiet Arabic consonants.
- Deepgram VAD starts after only 25 ms of confirmed speech with lower adaptive start/release thresholds, reducing clipped first words.
- End-of-turn hangover is 1.8 s to preserve natural pauses without making the conversation feel stuck.
- Fatima voice ID remains unchanged.
- Cartesia Arabic explicitly sends `language: ar`, speed 1, volume 1.
- Default Cartesia model for this specific Fatima voice is pinned to `sonic-3` for parity testing with the voice's known integration profile; override with CARTESIA_TTS_MODEL if your Playground test uses another model.

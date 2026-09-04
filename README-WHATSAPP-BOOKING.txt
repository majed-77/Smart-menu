SMART MENU — RESERVATIONS + WHATSAPP REMINDERS

What was added
- Reservation button and form inside the website.
- PostgreSQL storage for reservations.
- WhatsApp reminder 30 minutes before the reservation.
- Automatic reminder worker every minute.
- Protected /api/reminders/run endpoint for a Render Cron Job.

1) Upload these files to GitHub
- server.js
- smart-menu-ai-multilingual.html
- package.json

2) Add PostgreSQL
Create a PostgreSQL database on Render (or any hosted Postgres).
Add its connection URL to the Web Service environment variable:
DATABASE_URL=postgresql://...

3) Add Twilio WhatsApp environment variables in Render
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
Use ONE of the following sending options:
TWILIO_WHATSAPP_FROM=+1415...
OR
TWILIO_MESSAGING_SERVICE_SID=MG...

For production business-initiated WhatsApp reminders, create an APPROVED WhatsApp Content Template in Twilio and set:
TWILIO_CONTENT_SID=HX...
The template variables are:
{{1}} customer name
{{2}} reservation date
{{3}} reservation time
{{4}} party size

Suggested Arabic template text:
هلا {{1}} 👋 تذكير بحجزك في مطاعم سفرة الديرة بتاريخ {{2}} الساعة {{3}}، لعدد {{4}} أشخاص. ننتظرك 🌷

4) Time zone
Default restaurant timezone is Asia/Riyadh. Optional environment variable:
RESTAURANT_TIMEZONE=Asia/Riyadh

5) Recommended Render Cron Job
The web service has an internal every-minute worker, but a Cron Job is safer if the service sleeps/restarts.
Add a random secret in the web service:
CRON_SECRET=put-a-long-random-secret-here
Then create a Render Cron Job that runs every 5 minutes and POSTs to:
https://YOUR-SERVICE.onrender.com/api/reminders/run
Header:
Authorization: Bearer YOUR_CRON_SECRET

If your Render Cron Job UI only supports shell commands, use:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR-SERVICE.onrender.com/api/reminders/run

Important
- The reminder is marked as sent only after Twilio confirms the message request.
- Duplicate sends are prevented with reminder_sent_at and database row locking.
- Phone numbers must be in international format, e.g. +9665... or +216...
- For real production WhatsApp messages outside the customer-service window, an approved WhatsApp template is normally required.


=== NEW: SARA VOICE BOOKING + PRE-ORDER ===
Sara can now collect and save a table reservation and an optional food/drink pre-order by voice.
Flow: collect missing details -> summarize booking/order -> ask for explicit confirmation -> save only after confirmation.
The PostgreSQL reservations table auto-migrates on startup with:
- order_items JSONB
- order_total_sar NUMERIC
- source (form / sara_voice)

No manual SQL migration is required. After deploying, wait for Render to become Live and test with a future reservation.
Example Arabic test:
"سارة أبي أحجز بكرة الساعة 8 لأربعة أشخاص، واسمي خالد، ورقمي +9665XXXXXXXX، وأبي برغرين كلاسيك."
Sara should collect anything missing, repeat the final summary, ask for approval, and save only after the guest confirms.

=== NEW: SEND EVERY CONFIRMED BOOKING/ORDER TO RESTAURANT WHATSAPP ===
Add this Render environment variable:
RESTAURANT_WHATSAPP_TO=whatsapp:+9665XXXXXXXX

Behavior:
- After Sara/customer explicitly confirms, the reservation/order is saved first.
- The server immediately sends a WhatsApp copy to the restaurant containing:
  booking number, customer name/phone, date/time, party size, items, item notes, total, and reservation notes.
- If WhatsApp fails, the booking remains safely saved in PostgreSQL and the failure is logged in Render.
- TWILIO_WHATSAPP_FROM remains the Twilio/Sandbox sender number.
- RESTAURANT_WHATSAPP_TO is the restaurant's WhatsApp receiving number.

For Twilio Sandbox testing, the restaurant receiving number must first join the same Sandbox (send the current "join ..." code to the Sandbox number). Trial/Sandbox recipient restrictions still apply.


=== Twilio Console Trial fix (v5.1) ===
This build handles the current Twilio Console Trial restriction that returns "ContentSid Required" for free-form WhatsApp API messages.

Restaurant notifications during Trial:
- Uses TWILIO_WHATSAPP_FROM directly.
- Uses a Twilio-provided Trial ContentSid so the API call is accepted.
- Optional Render variable: TWILIO_TRIAL_CONTENT_SID
- The build includes the working Trial ContentSid observed in this project's Twilio Try out WhatsApp flow as the default. If Twilio rotates it, copy the current ContentSid from the Try out WhatsApp API request and set TWILIO_TRIAL_CONTENT_SID in Render.

Important Trial limitation:
Twilio Console Trial does not allow custom WhatsApp message bodies/templates. The Trial notification therefore confirms that a new event was sent, but the full custom order text can only be sent after upgrading Twilio (or when Twilio allows a custom approved template). The reservation/order itself is still stored in PostgreSQL.

Production/upgraded account:
Use an approved custom WhatsApp template or free-form message inside the allowed customer-service window. TWILIO_CONTENT_SID remains available for customer reminders.

Timezone default: Asia/Riyadh.

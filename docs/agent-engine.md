# Agent engine — setup and operations

The conversational agent behind the demo hub, the embeddable widget, and the SMS channel.
Runs entirely on Cloudflare Pages Functions + D1. Code lives in `frontend/functions/`.

## One-time Cloudflare setup (about 10 minutes)

1. **Create the database.** Cloudflare dashboard → *Storage & Databases → D1 → Create* → name `mesa-agents`.
2. **Load the schema + demo data.** Open the new database → *Console* tab → paste the contents of `frontend/schema.sql` → Execute.
   (Or from a terminal: `npx wrangler login` then `npx wrangler d1 execute mesa-agents --remote --file=frontend/schema.sql`.)
   Safe to re-run; it re-seeds the four demo businesses. (The file has no comments or triggers on purpose — the dashboard console's statement splitter can't handle them.)
3. **Bind it to the site.** *Workers & Pages → mesaintelligence-site → Settings → Bindings → Add → D1 database*:
   variable name **`DB`**, database `mesa-agents`. Add it for **Production** and **Preview**.
4. **Add an admin token.** Same Settings page → *Variables and Secrets → Add* → `ADMIN_TOKEN` (secret), any long random string
   (e.g. run `openssl rand -hex 24`). This protects `/api/admin/*`.
5. **Redeploy** (*Deployments → latest → Retry deployment*) so the new bindings take effect.
6. **Check:** open `https://mesaintelligence.ai/api/health` → should show `"db": "ok (4 tenants)"` and `"storage": "d1"`.

Until step 3 is done the site still works: sessions are held in memory (reset often) and the demos use the built-in data.

### Optional variables
| Name | Default | Purpose |
|---|---|---|
| `DEMO_DAILY_CAP` | 600 | Max demo messages per day across all visitors (cost guard) |
| `IP_LIMIT_PER_15MIN` | 30 demo / 90 client | Per-visitor message cap |
| `ANTHROPIC_MODEL` | claude-sonnet-4-5 | Model for all agents |
| `TWILIO_AUTH_TOKEN` | — | Verifies inbound SMS webhooks (set when SMS goes live) |
| `LEAD_FROM` | hello@mesaintelligence.ai | Sender for client notifications (Resend) |

## How it works
- **Tenant** = one business (`tenants` table, or the built-in demo set in `functions/_lib/tenants.js`): persona, hours, services, escalation rules, where to send notifications.
- **Knowledge** = short single-topic docs per tenant (`knowledge` table). Each message runs a full-text search (FTS5/BM25) and the top 4 docs are placed in the model's context. The admin API keeps the search index in sync; if you edit `knowledge` rows directly in the D1 console, run `INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild');` afterwards (or `PATCH /api/admin/knowledge`). Nothing is "trained"; it's retrieval, which is what you want — change a price, and the agent knows immediately.
- **Tools** the agent can call: `check_availability`, `book_appointment` (writes `bookings`, refuses clashes and closed hours), `escalate_to_human` (writes `handoffs`, emails the client if `notify_email` is set), `capture_lead`.
- **Sessions** persist in `conversations`; the last 24 messages are kept in context.
- **Channels:** web (`/api/chat`, SSE), embed (`/embed?tenant=…` framed by `/widget.js`), SMS (`/api/sms`, Twilio).

## Onboarding a real client (no code)
All admin calls use `Authorization: Bearer <ADMIN_TOKEN>`.

```bash
# 1. Create the tenant
curl -X PUT https://mesaintelligence.ai/api/admin/tenants -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{
  "id": "sun-city-plumbing", "name": "Sun City Plumbing", "vertical": "plumbing", "timezone": "America/Denver",
  "greeting": "Sun City Plumbing — how can I help?",
  "presets": ["I have a leak under my sink", "What do you charge for a water heater?"],
  "persona": "You are the dispatcher for Sun City Plumbing in El Paso... (tone, triage rules, what to always ask)",
  "hours": {"mon":["07:00","18:00"],"tue":["07:00","18:00"],"wed":["07:00","18:00"],"thu":["07:00","18:00"],"fri":["07:00","18:00"],"sat":["08:00","14:00"],"sun":null},
  "slot_minutes": 120,
  "services": [{"name":"Service call","minutes":120,"price":95},{"name":"Water heater replacement","minutes":240,"price":0,"note":"quoted on site"}],
  "escalation": "Escalate for: sewage backups, gas lines, anything commercial.",
  "notify_email": "office@suncityplumbing.com",
  "sms_number": null
}'

# 2. Add their knowledge (hours, pricing, policies, service area, FAQs — one topic per doc)
curl -X POST https://mesaintelligence.ai/api/admin/knowledge -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{
  "tenant": "sun-city-plumbing",
  "docs": [
    {"title": "Pricing", "content": "Service call $95, waived with repair..."},
    {"title": "Service area", "content": "El Paso, Horizon City, Socorro, Canutillo..."}
  ]
}'

# 3. Put the widget on their site
<script src="https://mesaintelligence.ai/widget.js" data-tenant="sun-city-plumbing" data-label="Chat with us" defer></script>

# 4. Watch it work
curl https://mesaintelligence.ai/api/admin/activity?tenant=sun-city-plumbing -H "Authorization: Bearer $ADMIN_TOKEN"
curl "https://mesaintelligence.ai/api/admin/activity?conversation=cv_..." -H "Authorization: Bearer $ADMIN_TOKEN"   # full transcript
```

To turn on **SMS** for a client: buy a Twilio number, set its "A message comes in" webhook to `https://mesaintelligence.ai/api/sms` (POST),
set `TWILIO_AUTH_TOKEN` in Pages, and set the tenant's `sms_number` to the number in E.164 (`+15755550123`).

## Local development
```bash
cd frontend && yarn build
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars          # never committed
npx wrangler pages dev build --d1 DB=mesa-agents --persist-to .wrangler/state
# apply the schema to the local DB once (needs a throwaway wrangler config with a DB binding named "DB"):
npx wrangler d1 execute DB -c /path/to/wrangler.test.toml --local --persist-to .wrangler/state --file=schema.sql
```
`node scripts/gen-schema.mjs > schema.sql` regenerates the seed from the demo tenant code.

## Voice (Smart Call Dispatch) — Retell AI
Same tools, same database; Retell handles telephony, speech, and the voice model.

Setup once:
1. Retell dashboard → API Keys → create a key → Cloudflare Pages → Variables and Secrets → `RETELL_API_KEY` (Secret, Production + Preview) → redeploy.
2. Retell dashboard → Phone Numbers → buy a number (575 or 915). Don't assign it in Retell; the admin page does that.
3. Open `https://mesaintelligence.ai/admin`, paste `ADMIN_TOKEN`, pick the business, click **Create voice agent**. Paste the number and click **Assign number**.
   This builds a Retell LLM + agent from the tenant's persona/hours/services/knowledge, points the number at it, and sets the inbound webhook.
4. Re-run **Update voice agent** whenever you change a tenant's persona or knowledge (the chat picks changes up instantly; the voice agent needs this click).

Optional variables: `RETELL_VOICE_ID` (default 11labs-Adrian), `RETELL_MODEL` (falls back to Retell's default if the name is rejected),
`WEBCALL_IP_LIMIT_PER_HOUR` (3), `WEBCALL_DAILY_CAP` (40 browser calls/day for demo tenants), `SITE_ORIGIN` (webhook base; defaults to the request origin).
Per-tenant fields: `voice_number` (E.164), `transfer_number` (adds a transfer-to-office tool), `voice_id`.

Endpoints Retell calls (all verified with X-Retell-Signature using RETELL_API_KEY):
- `POST /api/voice/tool` — custom functions check_availability / book_appointment / escalate_to_human / capture_lead
- `POST /api/voice/inbound` — inbound-call webhook: picks the tenant by number, sets current_time + metadata
- `POST /api/voice/webhook` — call_ended / call_analyzed: stores transcript + summary as a voice conversation, files a lead when follow-up is needed, emails the business
Site: `POST /api/voice/web-call { tenant }` returns a short-lived token for the "Call from your browser" button (retell-client-js-sdk).

## Admin console
`/admin` — paste ADMIN_TOKEN (kept in the tab's sessionStorage). Shows system health, per-business bookings/leads/hand-offs/conversations with transcripts, and the voice setup controls.

## Local Discovery audit (Google Places)
Free listing + website audit on the homepage (section 05, `#audit`) and an unlimited version in `/admin`.

Setup once:
1. Google Cloud (bobby@mesaintelligence.ai) → project "Mesa Intelligence" → billing on → enable **Places API (New)** → Credentials → API key, restricted to Places API (New).
2. Cloudflare Pages → Variables and Secrets → `GOOGLE_PLACES_API_KEY` (Secret, Production + Preview).
3. D1 console → run `frontend/migrations/003-audits.sql` (creates the `audits` table). Then redeploy.
4. Check `/api/health` → `"places": true`.

Flow: `POST /api/audit/search {query}` → pick a listing → `POST /api/audit/run {place_id}` returns score, checks, competitors (AI plan builds in the background) →
`POST /api/audit/report {audit_id, name, email}` returns the plan, emails the owner the report and LEAD_TO a lead alert.
Admin: `GET/POST /api/admin/audit` ({query} | {place_id} | {audit_id}).

Scoring: listing 65% (hours 12, phone 8, website link 10, rating 15, review count vs. local median 15, review recency 10, photos 10, specific category 5) + website 35%
(loads, https, speed, mobile viewport, title, meta description, phone matches Google, tap-to-call, booking/form, LocalBusiness schema). Grades A ≥85, B ≥70, C ≥55, D ≥40.

Cost per public audit ≈ $0.09 Google (Text Search Pro + Place Details Enterprise+Atmosphere + Text Search Enterprise) + a small Claude call; first ~1,000/month free.
Limits (env overrides): `AUDIT_IP_LIMIT_PER_DAY` 3, `AUDIT_DAILY_CAP` 50, `AUDIT_SEARCH_LIMIT_PER_HOUR` 15, `AUDIT_SEARCH_DAILY_CAP` 300, `AUDIT_REPORT_LIMIT_PER_DAY` 5.
Google terms: only place IDs are stored long-term; the `audits` table keeps our derived scores/findings, the plan, and the contact. Show "Google Maps" attribution wherever listing data appears.

## Workflow Intelligence (what happens after the conversation)
Every booking, lead, hand-off and finished call triggers a chain (`functions/_lib/workflow.js`), recorded step-by-step in `workflow_runs`:
1. Confirmation / acknowledgement text to the customer (Twilio) · 2. Google Calendar event (bookings) · 3. Row in a Google Sheet (CRM) ·
4. Owner email (now) · 5. Day-before reminder text (bookings). Plus a daily digest email per business at `digest_hour`.
Unconfigured steps are recorded as "skipped", never fail the conversation. The homepage section 06 shows the visitor's own chain live; `/admin → Workflows` shows every run, lets you set per-business settings and fire a test chain.

Setup once (Cloudflare → Variables and Secrets, Production + Preview, then redeploy):
- **Texting:** Twilio → buy a number → `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (secrets), `TWILIO_FROM` (+1…). A client with its own number: set the tenant's `sms_number`.
  Demo guard: placeholder numbers (555-, repeated digits) are never texted; `DEMO_SMS_DAILY_CAP` (30).
- **Google Calendar + Sheets:** Google Cloud project "Mesa Intelligence" → enable *Google Calendar API* and *Google Sheets API* → IAM → Service Accounts → create (e.g. `mesa-workflows`) → Keys → JSON.
  Set `GOOGLE_SA_EMAIL` (the client_email) and `GOOGLE_SA_KEY` (the private_key value, keep the `\n`s) as secrets.
  Then share each calendar ("Make changes to events") and sheet ("Editor") with that service-account email. Per business: `/admin → Workflows → Calendar ID / Sheet ID`.
  Demo businesses use `DEMO_CALENDAR_ID` / `DEMO_SHEET_ID` / `DEMO_NOTIFY_EMAIL` env vars.
- **Reminders + digests:** set `CRON_TOKEN` (any long random string) and have an external scheduler call `https://mesaintelligence.ai/api/cron/tick?token=<CRON_TOKEN>` every hour
  (cron-job.org is free). Pages has no built-in scheduler.
- Database: run `frontend/migrations/004-workflows.sql` in the D1 console.

Per-business settings (`tenants.workflows_json`, editable in `/admin`): `sms`, `reminders`, `calendar_id`, `sheet_id`, `sheet_tab`, `digest_hour`.
Admin API: `GET /api/admin/workflows?tenant=`, `PUT` (settings), `POST {tenant, test:true, phone?}` (test chain). Public: `GET /api/workflow/runs?conversation=` (demo tenants only, redacted).

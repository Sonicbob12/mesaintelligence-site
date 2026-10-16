# Agent engine — setup and operations

The conversational agent behind the demo hub, the embeddable widget, and the SMS channel.
Runs entirely on Cloudflare Pages Functions + D1. Code lives in `frontend/functions/`.

## One-time Cloudflare setup (about 10 minutes)

1. **Create the database.** Cloudflare dashboard → *Storage & Databases → D1 → Create* → name `mesa-agents`.
2. **Load the schema + demo data.** Open the new database → *Console* tab → paste the contents of `frontend/schema.sql` → Execute.
   (Or from a terminal: `npx wrangler login` then `npx wrangler d1 execute mesa-agents --remote --file=frontend/schema.sql`.)
   Safe to re-run; it re-seeds the four demo businesses.
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
- **Knowledge** = short single-topic docs per tenant (`knowledge` table). Each message runs a full-text search (FTS5/BM25) and the top 4 docs are placed in the model's context. Nothing is "trained"; it's retrieval, which is what you want — change a price, and the agent knows immediately.
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

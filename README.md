# Mesa Intelligence — website

Static React site (Create React App + Tailwind) with two Cloudflare Pages Functions:

- `frontend/functions/api/chat.js`  — sample-agent demo chat, streams from the Anthropic API
- `frontend/functions/api/leads.js` — contact form → email via Resend

## Deploy (Cloudflare Pages)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → this repo.
2. Build settings:
   - Root directory: `frontend`
   - Build command: `yarn build`
   - Build output directory: `build`
3. Settings → Variables and Secrets (Production):
   - `ANTHROPIC_API_KEY` (secret)
   - `RESEND_API_KEY` (secret)
   - `LEAD_TO` = `hello@mesaintelligence.ai`
   - `LEAD_FROM` = `Mesa Intelligence <onboarding@resend.dev>` (switch to `hello@mesaintelligence.ai` after verifying the domain in Resend)
   - `ANTHROPIC_MODEL` (optional)
4. Custom domains → add `mesaintelligence.ai` and `www.mesaintelligence.ai`; set the CNAME records it gives you at Porkbun.

## Local dev

```bash
cd frontend
yarn install
yarn build
npx wrangler pages dev build   # serves the site + functions on :8788
```

Local secrets go in `frontend/.dev.vars` (never committed).

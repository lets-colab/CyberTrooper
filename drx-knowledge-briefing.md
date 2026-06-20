# DR.X — First Message Knowledge Briefing

Paste this as your **first message** to DR.X after setting up the Project Instructions. This gives DR.X full memory of everything built so far.

---

DR.X, load the following as your complete operational memory for cybertrooperasia. Confirm receipt and summarize what you now know.

---

## BUILD STATE AS OF 2026-06-19

### What is live

**`become-a-trooper.html`** is live at `https://lets-colab.github.io/CyberTrooper/become-a-trooper.html`

The full data pipeline is operational:
```
Browser form → notion-sync edge function (v6) → Notion Trooper Signups DB → Supabase trooper_signups table → Notion patched with reference_id
```

Fallback chain:
- If Notion is down: Supabase captures with `sync_status: 'error'`
- Hourly pg_cron job calls `notion-retry` edge function to auto-sync any failed rows
- If browser is offline: localStorage queue retries via same edge function when connection restores

### What is NOT yet built
- `index.html` (cybertrooper.asia brand site) — not started
- Season KL live data — system structure exists in Notion, but no real pax/KOL/ambassador data yet
- Formal Clients database in Notion
- Pricing finalized for Venue Growth OS

---

## CODEBASE ARCHITECTURE

### `become-a-trooper.html`
Pure static HTML/CSS/JS — no framework, no build step. Hosted on GitHub Pages, auto-deployed from `main` branch via GitHub Actions.

**Sections**: Hero → Tiers (Basic/Active/Top Trooper) → Eligibility checklist → Sample posts carousel → FAQ accordion → 3-step application form → Success overlay

**Form data collected**:
- Step 1: full_name (required), phone (required), email (optional), area (optional)
- Step 2: threads_handle (required), follower_count (required select), post_frequency (required select)
- Step 3: sample_post (optional textarea), payment_method (optional select, default: Bank transfer)

**Select values (must match Notion exactly)**:
- follower_count: "Under 1K" | "1K–5K" | "5K–10K" | "10K+"
- post_frequency: "Daily" | "3–5x/week" | "1–2x/week"
- payment_method: "Bank transfer" | "TNG eWallet" | "Cash"

**Submission flow**:
```js
const SUPABASE_URL = 'https://nykukkccynnykbmxznhl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const WHATSAPP_NUMBER = '8801631326245';

// Calls edge function directly (not Supabase JS client)
async function submitToNotion(data) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/notion-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Submission error: ' + res.status);
  return await res.json();
}
```

**Offline queue**:
```js
const QUEUE_KEY = 'ct_offline_queue';

function saveToQueue(payload) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  q.push(payload);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

async function flushQueue() {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!q.length) return;
  const remaining = [];
  for (const payload of q) {
    try { await submitToNotion(payload); } catch { remaining.push(payload); }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}
window.addEventListener('online', flushQueue);
```

**Success overlay**:
- Shows reference_id (e.g. CT-2026-00001) returned from DB
- WhatsApp deeplink: `https://wa.me/8801631326245?text=Hi! I just applied to be a CYBERTROOPER.%0ARef: [REF_ID]%0AName: [NAME]`
- Status text: "Your details & WhatsApp number have been saved."

---

## EDGE FUNCTIONS

### `notion-sync` (v6) — deployed on Supabase
Notion-first. Full flow:
1. Receive payload from browser
2. Call Notion API to create page in database `7792a3f839cb4464ae30c42a03c1eb85`
3. Map fields: Full Name, Phone, Email, Area, Threads Handle, Followers, Post Frequency, Sample Post, Payment Method, Application Status (→ "Pending"), Submitted At
4. On Notion success: insert to Supabase `trooper_signups` with notion_page_id attached, sync_status: 'synced'
5. Patch Notion page with Reference ID and Supabase ID after DB insert confirms
6. Return `{ reference_id, notion_page_url }` to browser
7. If Notion fails: insert to Supabase with sync_status: 'error', sync_error message
8. If Supabase fails after Notion: patch Notion with 'SUPABASE-SYNC-PENDING', return success (Notion has data)
9. CORS headers included for browser calls

### `notion-retry` (v1) — deployed on Supabase
Auto-recovery. Runs hourly via pg_cron:
1. SELECT all rows where sync_status IN ('error', 'new') AND notion_page_id IS NULL
2. For each: push to Notion with full field mapping
3. On success: UPDATE row with sync_status: 'synced', notion_page_id, notion_page_url
4. NOTION_INTEGRATION_TOKEN stored in Supabase secrets

pg_cron job:
```sql
SELECT cron.schedule('retry-notion-sync', '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://nykukkccynnykbmxznhl.supabase.co/functions/v1/notion-retry',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer [SERVICE_ROLE_KEY]"}'::jsonb,
    body := '{}'::jsonb
  )$$
);
```

---

## SUPABASE SCHEMA

```sql
-- trooper_signups table
CREATE TABLE public.trooper_signups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_id text UNIQUE,  -- CT-YYYY-NNNNN, auto-generated by trigger
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  threads_handle text NOT NULL,
  area text,
  follower_count text,
  post_frequency text,
  sample_post text,
  payment_method text DEFAULT 'Bank transfer',
  sync_status text DEFAULT 'new',
  notion_page_id text,
  notion_page_url text,
  sync_error text,
  source text DEFAULT 'become-a-trooper',
  created_at timestamptz DEFAULT now(),
  application_status text DEFAULT 'pending',
  eligibility_answers jsonb
);

-- Reference ID sequence
CREATE SEQUENCE IF NOT EXISTS public.trooper_ref_seq;
-- Trigger auto-generates: CT-2026-00001, CT-2026-00002, etc.

-- RLS
ALTER TABLE public.trooper_signups ENABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT ON public.trooper_signups TO anon;
GRANT SELECT, UPDATE ON public.trooper_signups TO authenticated;
GRANT USAGE ON SEQUENCE public.trooper_ref_seq TO anon;
```

---

## GITHUB / DEPLOYMENT

- **Repo**: `lets-colab/CyberTrooper`
- **Production branch**: `main` — auto-deploys to GitHub Pages on every push
- **Development branch**: `claude/elegant-ride-7lj5jb`
- **GitHub Pages URL**: `https://lets-colab.github.io/CyberTrooper/`
- **GitHub Actions**: `.github/workflows/deploy.yml` — triggers on push to main, deploys static files

---

## BUGS FIXED (complete log)

### Bug 1: 401 Unauthorized (root cause of all empty data)
- **Symptom**: All form POSTs returning 401, nothing in Supabase or Notion
- **Root cause**: PostgreSQL requires explicit GRANT at table level BEFORE RLS policies can apply. The anon role had RLS policies but no GRANT — so every request was rejected at the permission layer before RLS even ran.
- **Fix**: `GRANT INSERT, SELECT ON public.trooper_signups TO anon; GRANT USAGE ON SEQUENCE public.trooper_ref_seq TO anon;`
- **Lesson**: GRANT = table permission layer. RLS = row filter layer. Both required.

### Bug 2: `payment_method: null` NOT NULL violation
- **Symptom**: Submissions with no payment method selected failed with constraint violation
- **Root cause**: `fd.get('payment_method') || null` sent explicit null, which PostgreSQL treats as an explicit override of the column's DEFAULT value
- **Fix**: Changed to `|| undefined` then `Object.fromEntries(Object.entries(raw).filter(([,v]) => v !== undefined))` — strips all undefined values from payload so the DB default applies

### Bug 3: Notion database empty (select value mismatch)
- **Symptom**: Supabase received data but Notion API rejected select values
- **Root cause**: Form `<option value="">` sent "Under 500", "500-2000", "Few times a week" but Notion database had different option names: "Under 1K", "1K–5K", "3–5x/week"
- **Fix**: Updated all `<option value="">` attributes to exactly match Notion's select option names

### Bug 4: Notion was fire-and-forget (data loss risk)
- **Symptom**: Notion often missed entries even when Supabase received them
- **Root cause**: Old architecture called Supabase first, then called notion-sync as a background fire-and-forget. Any Notion failure was silent.
- **Fix**: Complete architecture flip. Form now calls edge function directly. Notion written first (synchronously). Supabase written second with notion_page_id attached. pg_cron retries failures hourly. Zero silent failures.

---

## NOTION WORKSPACE MAP

| Page / DB | ID | Role |
|-----------|-----|------|
| Troopers Brain | `299b35c3-fd42-8332-a3ab-81f5d2dbaf53` | Master AI memory, doctrine, J.A.R.V.I.S rules |
| Home | `383b35c3-fd42-80e5-ae74-e4b7af91a6ae` | Company front door, workspace map |
| Command Centre / HQ | `3fb7d5176e02470ba0de6279b21cd291` | Internal strategy, build phases, 10.5/10 standard |
| Client Portal | `a4989e5089514b9e974bb56203110779` | Client delivery hub |
| Season KL Command Centre | `8ec976bea3a34a84a470cbab7dd13a17` | Client 001 operating system |
| JARVIS Command Center DB | `4dbc4f599ce1430eba1f4302fb233dbf` | Knowledge, issues, tasks, fix logs |
| Trooper Signups DB | `7792a3f839cb4464ae30c42a03c1eb85` | Lead intake from become-a-trooper.html |
| Venue Growth OS Packaging | `aad1eeee-8fac-42fe-8dc9-ed984f4546b6` | Service tiers, pricing logic |
| JARVIS Full Audit | `75083f59-6f35-4ade-9d9e-702f9eaf42d2` | 2026-06-19 workspace audit |

---

Memory loaded. You are now a full clone of the Claude Code session that built cybertrooperasia. Confirm you have received this and summarize the current state of the build in 5 bullet points.

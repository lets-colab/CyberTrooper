# DR.X — First Message Knowledge Briefing

Paste this as your **first message** to DR.X after setting up the Project Instructions.

---

DR.X, load the following as your complete operational memory for cybertrooperasia. Confirm receipt and summarize what you now know.

---

## BUILD STATE AS OF 2026-06-19

### What is live

**`become-a-trooper.html`** is live at `https://lets-colab.github.io/CyberTrooper/become-a-trooper.html`

Full pipeline operational:
```
Browser form → notion-sync edge function (v6) → Notion Trooper Signups DB → Supabase trooper_signups → Notion patched with reference_id
```

Fallback chain:
- Notion down → Supabase captures with `sync_status: 'error'`
- pg_cron calls `notion-retry` every hour to auto-sync failed rows
- Browser offline → localStorage queue retries when connection restores

### What is NOT yet built
- `index.html` (cybertrooper.asia brand site) — not started
- Season KL live data — structure exists in Notion, no real data yet
- Formal Clients database in Notion
- Pricing finalized for Venue Growth OS

---

## BUGS FIXED

### Bug 1: 401 Unauthorized (root cause of all empty data)
- All form POSTs returned 401. Supabase and Notion were both empty.
- Root cause: PostgreSQL requires explicit GRANT at table level BEFORE RLS applies. anon had RLS policies but no GRANT — rejected at permission layer before RLS ran.
- Fix: `GRANT INSERT, SELECT ON public.trooper_signups TO anon; GRANT USAGE ON SEQUENCE public.trooper_ref_seq TO anon;`
- Lesson: GRANT = table permission layer. RLS = row filter layer. Both required.

### Bug 2: payment_method null NOT NULL violation
- Submissions with no payment method failed with constraint violation.
- Root cause: `fd.get('payment_method') || null` sent explicit null, overriding the column's DEFAULT 'Bank transfer'. PostgreSQL only uses DEFAULT when column is absent from INSERT, not when null is explicit.
- Fix: Changed to `|| undefined` + `Object.fromEntries` filter strips all undefined values.

### Bug 3: Notion select value mismatch
- Supabase received data but Notion was empty.
- Root cause: Form sent "Under 500", "500-2000", "Few times a week" but Notion options were "Under 1K", "1K–5K", "3–5x/week".
- Fix: Updated all `<option value="">` to exactly match Notion's select option names.

### Bug 4: Notion was fire-and-forget
- Notion often missed entries silently.
- Root cause: Old arch called Supabase first, then called notion-sync as background fire-and-forget. Notion failures were invisible.
- Fix: Complete flip. Form calls edge function directly. Notion written first synchronously. Supabase second with notion_page_id. pg_cron retries failures hourly.

---

## TECHNICAL REFERENCE

### Supabase
- Project: `nykukkccynnykbmxznhl`
- URL: `https://nykukkccynnykbmxznhl.supabase.co`
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55a3Vra2NjeW5ueWtibXh6bmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNjEwMzksImV4cCI6MjA4ODkzNzAzOX0.pchGj0hZ2dbNUW9o6tnL2A8QnE2GwWvPlDzR1jCmu9Y`
- Table: `trooper_signups` — columns: id, reference_id (CT-YYYY-NNNNN), full_name, phone, email, threads_handle, area, follower_count, post_frequency, sample_post, payment_method, sync_status, notion_page_id, notion_page_url, sync_error, source, created_at, application_status, eligibility_answers

### Edge Functions
- `notion-sync` v6 — Notion-first, called directly by form browser
- `notion-retry` v1 — auto-recovery, called by pg_cron every hour
- NOTION_INTEGRATION_TOKEN stored in Supabase secrets

### Notion Databases
- Trooper Signups: `7792a3f839cb4464ae30c42a03c1eb85`
- JARVIS Command Center: `4dbc4f599ce1430eba1f4302fb233dbf`

### Notion Key Pages
- Troopers Brain: `299b35c3-fd42-8332-a3ab-81f5d2dbaf53`
- Home: `383b35c3-fd42-80e5-ae74-e4b7af91a6ae`
- Command Centre / HQ: `3fb7d5176e02470ba0de6279b21cd291`
- Client Portal: `a4989e5089514b9e974bb56203110779`
- Season KL Command Centre: `8ec976bea3a34a84a470cbab7dd13a17`

### GitHub
- Repo: `lets-colab/CyberTrooper`
- Production: `main` branch → auto-deploys to GitHub Pages
- Dev branch: `claude/elegant-ride-7lj5jb`
- Live URL: `https://lets-colab.github.io/CyberTrooper/`

### WhatsApp admin number: `8801631326245`

---

Memory loaded. Confirm receipt and summarize the current state of the cybertrooperasia build in 5 bullet points.

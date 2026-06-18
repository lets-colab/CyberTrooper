# CYBERTROOPER

Two-page production website for CYBERTROOPER by 3Sixty Marketing.

## Pages

| File | URL | Audience |
|---|---|---|
| `index.html` | cybertrooper.asia | KL brand marketing managers |
| `become-a-trooper.html` | cybertrooper.asia/become-a-trooper | Gen Z KL locals |

## Tech Stack

- Pure HTML/CSS/JS — no build step, no framework
- Three.js r128 (brand site 3D animation)
- GSAP 3.12 + ScrollTrigger (animation orchestration)
- Supabase JS v2 (form submissions)

## Backend

- **Supabase project**: `nykukkccynnykbmxznhl` (ap-southeast-2)
- **Table**: `trooper_signups` (RLS enabled)
- **Auto ref IDs**: `CT-YYYY-NNNNN` format via Postgres sequence

## Deploy

Static files — deploy to any CDN or static host:
- Netlify: drag & drop the folder
- Vercel: `vercel --prod`
- GitHub Pages: push to `gh-pages` branch

No server required. Supabase handles the backend.

## Notion Sync

**Notion database is live:** https://www.notion.so/7792a3f839cb4464ae30c42a03c1eb85  
Database ID: `7792a3f8-39cb-4464-ae30-c42a03c1eb85`

To complete the sync wiring:
1. Grant your Notion integration access to the "Trooper Signups" database
2. Deploy a Supabase Edge Function at `supabase/functions/notion-sync/`
3. Set edge function secret: `NOTION_INTEGRATION_TOKEN`
4. The function receives `{ record_id }`, fetches from Supabase, POSTs to Notion Pages API
5. Updates `notion_page_id` + `notion_page_url` on the Supabase row on success
6. The `notion_page_id`, `notion_page_url`, `sync_error` columns are already on `trooper_signups`

## Video Placeholder

`become-a-trooper.html` has a video element ready for real creator footage.
Add the source in the `<video>` tag:

```html
<source src="your-creator-footage.mp4" type="video/mp4">
```

Recommended: 15–30s looping vertical clip of someone posting on Threads.

## WhatsApp

Success deeplink: `wa.me/8801631326245`
Update `WHATSAPP_NUMBER` in `become-a-trooper.html` if the number changes.

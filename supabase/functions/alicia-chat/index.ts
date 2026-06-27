import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ALICIA runs on Groq's free API (OpenAI-compatible). Set GROQ_API_KEY as a
// Supabase Edge Function secret. GROQ_MODEL is optional (defaults to a current
// free Llama model) so you can swap models without redeploying.
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
const NOTION_TOKEN = Deno.env.get('NOTION_INTEGRATION_TOKEN') ?? '';
const NOTION_DB_ID = '26181d3c4aa44d25a13312de3870e73f';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALICIA_SYSTEM = `You are Alicia, a warm and sharp marketing consultant for CyberTrooper — KL's first Threads creator network by 3Sixty Marketing.

You are a real consultant, not an FAQ bot. When someone tells you about their business (a cafe, a restaurant, an event, a product launch), respond to THEIR specific situation. Reference what they told you. Give them a concrete, tailored angle for how CyberTrooper would help THAT business. Never reply with a generic template.

RULES:
- Address the user's specific business and question every time. If they mention a char kuey teow shop in Changkat, talk about that shop and that neighbourhood.
- NEVER repeat a message you have already sent in this conversation. If you find yourself about to say something you already said, say something new instead.
- Ask one sharp follow-up question when it helps you give better direction.
- Speak like a sharp KL creative professional — confident, warm, direct. No corporate fluff. 2–4 sentences max.
- Never invent pricing or fake statistics. Don't claim specific engagement multipliers or guaranteed results. If asked about price, explain it's tailored after a brief.

KEY FACTS:
- Platform: Threads (Meta) — text-first, authentic, fast-growing in SEA
- Tiers: Seed (5 Troopers/month), Growth (15/month, best value), Elite (30/month)
- Pricing: Tailored after a brief — not published publicly
- How it works: Brand submits a brief -> we match local KL Troopers -> they post about the brand in their own authentic voice on Threads -> brand gets a monthly campaign report
- Good for: F&B venues, cafes, restaurants, bars, events, launches in KL wanting authentic local word-of-mouth
- For creators wanting to join: apply at become-a-trooper.html (KL-based, active Threads account, reviewed every Monday)
- Contact: the Brief Us form on this page, or WhatsApp +60 179 706 8588`;

// Notion "Alicia Brain" stays the single source of truth. Instead of pasting rows
// verbatim (the old bug that caused repetition), we inject the whole brain into
// the model's system prompt as a knowledge base and let it reason over it.
async function fetchNotionKnowledge(): Promise<string> {
  if (!NOTION_TOKEN) return '';
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { property: 'Active', checkbox: { equals: true } },
        sorts: [{ property: 'Priority', direction: 'descending' }],
        page_size: 25,
      }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const rows = data.results ?? [];
    const lines: string[] = [];
    for (const row of rows) {
      const props = row.properties;
      const q = props['Question']?.title?.[0]?.plain_text ?? props['Topic']?.title?.[0]?.plain_text ?? '';
      const a = props['Answer']?.rich_text?.[0]?.plain_text ?? '';
      if (a) lines.push(q ? `Q: ${q}\nA: ${a}` : `- ${a}`);
    }
    return lines.length ? `\n\nKNOWLEDGE BASE (use these facts, but always answer in your own words for the user's specific situation):\n${lines.join('\n\n')}` : '';
  } catch (_) {
    return '';
  }
}

async function askGroq(message: string, history: {role:string,content:string}[], systemPrompt: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 350,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.slice(-8),
        { role: 'user', content: message },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Groq API ${res.status}: ${body}`);
    throw new Error(`Groq API ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "Tell me a bit more about your business and I'll point you in the right direction.";
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const { message, history = [] } = await req.json();
    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'missing_message' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not set');
      return new Response(
        JSON.stringify({ reply: "I'm just getting set up — reach the team directly on the Brief Us form or WhatsApp +60 179 706 8588 and they'll sort you out right away." }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const knowledge = await fetchNotionKnowledge();
    const reply = await askGroq(message, history, ALICIA_SYSTEM + knowledge);
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('alicia-chat error:', err);
    return new Response(
      JSON.stringify({ reply: "I'm having a brief moment — but I don't want to leave you hanging. Tap Brief Us or WhatsApp +60 179 706 8588 and the team will jump straight on it." }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

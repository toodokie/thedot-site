import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Redis } from '@upstash/redis';
import { transporter } from '@/lib/email';
import { Client as NotionClient } from '@notionhq/client';
import { byNamePrompt, byNeedPrompts } from '@/lib/aivc-prompts';

const notion = process.env.NOTION_TOKEN ? new NotionClient({ auth: process.env.NOTION_TOKEN }) : null;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---- config ----
const PER_VISITOR_DAILY = Number(process.env.AIVC_PER_VISITOR_DAILY ?? 3);
const GLOBAL_DAILY = Number(process.env.AIVC_GLOBAL_DAILY ?? 120);
const MODEL = process.env.AIVC_MODEL ?? 'gpt-5.2';
const MODEL_TIMEOUT_MS = Number(process.env.AIVC_MODEL_TIMEOUT_MS ?? 42_000);
const MAX_LEN = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

type MemStore = Map<string, number>;
const mem: MemStore =
  (globalThis as unknown as { __aivcMem?: MemStore }).__aivcMem ??
  ((globalThis as unknown as { __aivcMem?: MemStore }).__aivcMem = new Map());

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0]?.trim() : '') || req.headers.get('x-real-ip') || 'unknown';
}
async function rateLimit(ip: string): Promise<{ ok: true } | { ok: false; reason: 'visitor' | 'global' }> {
  const day = today();
  if (redis) {
    const gKey = `thedot:aivc:global:${day}`;
    const iKey = `thedot:aivc:ip:${ip}:${day}`;
    const g = await redis.incr(gKey);
    if (g === 1) await redis.expire(gKey, 86400);
    if (g > GLOBAL_DAILY) return { ok: false, reason: 'global' };
    const i = await redis.incr(iKey);
    if (i === 1) await redis.expire(iKey, 86400);
    if (i > PER_VISITOR_DAILY) return { ok: false, reason: 'visitor' };
    return { ok: true };
  }
  const gKey = `g:${day}`;
  const iKey = `i:${ip}:${day}`;
  const g = (mem.get(gKey) ?? 0) + 1;
  mem.set(gKey, g);
  if (g > GLOBAL_DAILY) return { ok: false, reason: 'global' };
  const i = (mem.get(iKey) ?? 0) + 1;
  mem.set(iKey, i);
  if (i > PER_VISITOR_DAILY) return { ok: false, reason: 'visitor' };
  return { ok: true };
}

function clean(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
}

// ---- name matching (we decide "named" in code from the model's list) ----
const STOP = new Set([
  'immigration', 'services', 'service', 'inc', 'ltd', 'llp', 'law', 'lawyer', 'lawyers',
  'consultant', 'consultants', 'consulting', 'agency', 'agencies', 'group', 'associates',
  'co', 'corp', 'company', 'the', 'and', 'solutions', 'professional', 'professionals',
  'clinic', 'studio', 'shop', 'store', 'florist', 'dental', 'dentistry', 'hotel', 'restaurant',
]);
function coreTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
}
function isSameBusiness(candidate: string, biz: string): boolean {
  const bt = coreTokens(biz);
  if (bt.length === 0) return false;
  const ct = new Set(coreTokens(candidate));
  return bt.some((t) => ct.has(t));
}
function normKey(name: string): string {
  return coreTokens(name).sort().join(' ');
}

function mode(arr: string[]): string {
  const c = new Map<string, number>();
  for (const a of arr) c.set(a, (c.get(a) ?? 0) + 1);
  let best = arr[0] ?? 'unknown';
  let n = 0;
  for (const [k, v] of c) if (v > n) { n = v; best = k; }
  return best;
}

function buildInput(f: { biz: string; city: string; service: string; need: string; site: string }, needPrompt: string): string {
  const siteLine = f.site ? `\nWebsite: ${f.site}` : '';
  return [
    'You are auditing whether a local business shows up in AI-powered search. Use web search to check real, current results, not your training memory. Be honest and specific. Do NOT mention ChatGPT, OpenAI, Google, Bing, or any specific AI or search-engine name anywhere in your answer. In every summary, do NOT use positional words like "above", "below", "following", or "as listed"; the app shows the businesses in a separate list, so refer to them by name or generically.',
    '',
    `Business name: ${f.biz}`,
    `City / area: ${f.city}`,
    `What they do (plain words): ${f.service}`,
    `A typical customer and their need: ${f.need}${siteLine}`,
    '',
    'Run these checks:',
    `1) BY NAME: Search for "${f.biz}" in ${f.city}. Is the business findable and identifiable? What is said about it? Would you recommend it based on what you find?`,
    `2) BY NEED: A prospective customer searches with this exact question: "${needPrompt}". Search thoroughly the way they would, across several sources, weighting authoritative, widely-cited ones (recognized rankings, directories, and reputable best-of lists) over any single page or random directory listing. List the 5 to 8 businesses that show up most consistently as the genuine top ${f.service} for this need, in ranked order, using their real names. Report the truth: include every business that genuinely ranks, and do NOT deliberately include or exclude ${f.biz}. Only real, findable businesses; never invent or pad. Return this as "recommendations".`,
    f.site ? `3) READABILITY: Based on the website, is it clear who they serve, what they do best, and where they are? Note anything unclear or missing.` : '',
    '',
    'Return ONLY a JSON object, no prose, no code fences, in exactly this shape:',
    '{',
    '  "byName": { "found": true, "wouldRecommend": "yes | maybe | no | unknown", "summary": "one or two plain sentences" },',
    '  "byNeed": { "recommendations": ["Real Business A", "Real Business B", "Real Business C"], "summary": "one or two plain sentences on who actually came up" },',
    f.site ? '  "readability": { "clear": true, "summary": "one or two plain sentences" }' : '  "readability": null',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

type Single = {
  found: boolean;
  wouldRecommend: string;
  nameSummary: string;
  recs: string[];
  needSummary: string;
  readClear?: boolean;
  readSummary?: string;
};

type Report = {
  byName: { found: boolean; wouldRecommend: string; summary: string };
  byNeed: { namedCount: number; runs: number; competitors: string[]; summary: string };
  readability?: { clear: boolean; summary: string };
  verdict: string;
};

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['byName', 'byNeed', 'readability'],
  properties: {
    byName: {
      type: 'object',
      additionalProperties: false,
      required: ['found', 'wouldRecommend', 'summary'],
      properties: {
        found: { type: 'boolean' },
        wouldRecommend: { type: 'string', enum: ['yes', 'maybe', 'no', 'unknown'] },
        summary: { type: 'string' },
      },
    },
    byNeed: {
      type: 'object',
      additionalProperties: false,
      required: ['recommendations', 'summary'],
      properties: {
        recommendations: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
      },
    },
    readability: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['clear', 'summary'],
          properties: {
            clear: { type: 'boolean' },
            summary: { type: 'string' },
          },
        },
        { type: 'null' },
      ],
    },
  },
} as const;

function parseSingle(text: string): Single | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (!obj || typeof obj !== 'object') return null;
    const bn = obj.byName ?? {};
    const bd = obj.byNeed ?? {};
    const rawRecs = Array.isArray(bd.recommendations) ? bd.recommendations : Array.isArray(bd.competitors) ? bd.competitors : [];
    const recs: string[] = rawRecs.map(String).map((s: string) => s.trim()).filter(Boolean);
    const single: Single = {
      found: Boolean(bn.found),
      wouldRecommend: String(bn.wouldRecommend ?? 'unknown'),
      nameSummary: String(bn.summary ?? ''),
      recs,
      needSummary: String(bd.summary ?? ''),
    };
    if (obj.readability && typeof obj.readability === 'object') {
      single.readClear = Boolean(obj.readability.clear);
      single.readSummary = String(obj.readability.summary ?? '');
    }
    return single;
  } catch {
    return null;
  }
}

function makeVerdict(found: boolean, namedCount: number, runs: number, biz: string): string {
  if (namedCount >= runs) return `${biz} comes up consistently when customers describe this need. The work now is to hold and widen that lead.`;
  if (namedCount > 0) return `${biz} shows up only some of the time (${namedCount} of ${runs} checks), which means fragile, inconsistent visibility. That is the gap to make reliable.`;
  if (found) return `${biz} is findable by name, but never came up when a customer described the need, and that is where new clients are won.`;
  return `${biz} barely registers with AI, by name or by need. That is the gap to close first.`;
}

async function callModel(client: OpenAI, input: string): Promise<string> {
  const resp = await client.responses.create({
    model: MODEL,
    tools: [{ type: 'web_search_preview' } as unknown as OpenAI.Responses.Tool],
    text: {
      format: {
        type: 'json_schema',
        name: 'ai_visibility_report',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
    input,
  });
  return (resp as unknown as { output_text?: string }).output_text ?? '';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] ?? char);
}

async function deliverReport(
  email: string,
  f: { biz: string; city: string; service: string; need: string; site: string },
  report: Report,
): Promise<boolean> {
  const agencyTo = process.env.AGENCY_EMAIL || process.env.FROM_EMAIL;
  const from = process.env.FROM_EMAIL || agencyTo;
  if (!from) return false;

  const safe = {
    email: escapeHtml(email),
    biz: escapeHtml(f.biz),
    city: escapeHtml(f.city),
    service: escapeHtml(f.service),
    need: escapeHtml(f.need),
    site: escapeHtml(f.site || '(none)'),
    nameSummary: escapeHtml(report.byName.summary),
    needSummary: escapeHtml(report.byNeed.summary),
    verdict: escapeHtml(report.verdict),
    competitors: report.byNeed.competitors.map(escapeHtml),
  };

  const agencyHtml = `
      <h2>New AI-visibility check lead</h2>
      <p><strong>Email:</strong> ${safe.email}</p>
      <p><strong>Business:</strong> ${safe.biz}</p>
      <p><strong>City/area:</strong> ${safe.city}</p>
      <p><strong>Service:</strong> ${safe.service}</p>
      <p><strong>Customer need:</strong> ${safe.need}</p>
      <p><strong>Website:</strong> ${safe.site}</p>
      <p><strong>Result:</strong> named in ${report.byNeed.namedCount} of ${report.byNeed.runs} by-need checks</p>
  `;

  const userHtml = `
      <h2>Your AI-visibility check for ${safe.biz}</h2>
      <h3>By name: ${report.byName.found ? 'Found' : 'Not found'}</h3>
      <p><strong>Would be recommended:</strong> ${escapeHtml(report.byName.wouldRecommend)}</p>
      <p>${safe.nameSummary}</p>
      <h3>By need: named ${report.byNeed.namedCount} of ${report.byNeed.runs} times</h3>
      <p>${safe.needSummary}</p>
      ${safe.competitors.length > 0 ? `<p><strong>Other businesses named:</strong> ${safe.competitors.join(', ')}</p>` : ''}
      ${report.readability ? `<h3>Website readability: ${report.readability.clear ? 'Clear' : 'Unclear'}</h3><p>${escapeHtml(report.readability.summary)}</p>` : ''}
      <p><strong>${safe.verdict}</strong></p>
      <p><a href="https://www.thedotcreative.co/contacts">Book an AI-visibility audit</a></p>
  `;

  const sends: Promise<unknown>[] = [];
  if (agencyTo) {
    sends.push(transporter.sendMail({
      from,
      to: agencyTo,
      replyTo: email,
      subject: `AI-visibility lead: ${f.biz}`,
      html: agencyHtml,
    }));
  }
  const userIndex = sends.length;
  sends.push(transporter.sendMail({
    from,
    to: email,
    replyTo: agencyTo,
    subject: `Your AI-visibility check: ${f.biz}`,
    html: userHtml,
  }));

  const results = await Promise.allSettled(sends);
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.error(`[ai-visibility] email ${index} failed:`, result.reason);
  });
  return results[userIndex]?.status === 'fulfilled';
}

async function captureNotion(
  email: string,
  f: { biz: string; city: string; service: string; need: string; site: string },
  report: Report,
): Promise<void> {
  try {
    const db = process.env.NOTION_AIVC_LEADS_DB_ID?.trim();
    if (!notion || !db) return;
    const site = f.site ? (/^https?:\/\//i.test(f.site) ? f.site : 'https://' + f.site) : null;
    const opportunity =
      `AI-visibility: named ${report.byNeed.namedCount}/${report.byNeed.runs} by need for "${f.service}"${site ? ' · ' + site : ''}. ${report.verdict}`.slice(0, 1900);
    await notion.pages.create({
      parent: { database_id: db },
      properties: {
        'Business Name': { title: [{ text: { content: f.biz } }] },
        'Contact Email': { email },
        Location: { rich_text: [{ text: { content: f.city } }] },
        ...(site ? { Website: { url: site } } : {}),
        'Key Opportunity': { rich_text: [{ text: { content: opportunity } }] },
        Source: { select: { name: 'Website Contact' } },
        Status: { select: { name: 'To Qualify' } },
      },
    });
  } catch (err) {
    console.error('[ai-visibility] notion save failed:', err);
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const f = {
    biz: clean(body.biz),
    city: clean(body.city),
    service: clean(body.service),
    need: clean(body.need),
    site: clean(body.site),
  };
  const email = clean(body.email).toLowerCase();
  if (!f.biz || !f.city || !f.service || !f.need) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'bad_email' }, { status: 400 });
  }

  const limit = await rateLimit(clientIp(req));
  if (!limit.ok) {
    return NextResponse.json({ ok: false, capped: limit.reason }, { status: 429 });
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: MODEL_TIMEOUT_MS,
      maxRetries: 0,
    });
    const needPrompts = byNeedPrompts(f);
    const attempts = await Promise.allSettled(needPrompts.map((np) => callModel(client, buildInput(f, np))));
    attempts.forEach((attempt, index) => {
      if (attempt.status === 'rejected') console.error(`[ai-visibility] model run ${index + 1} failed:`, attempt.reason);
    });
    const texts = attempts.map((attempt) => attempt.status === 'fulfilled' ? attempt.value : '');
    const singles = texts.map(parseSingle).filter((s): s is Single => s !== null);
    if (singles.length < texts.filter(Boolean).length) {
      console.error(`[ai-visibility] failed to parse ${texts.filter(Boolean).length - singles.length} model response(s)`);
    }
    if (singles.length === 0) {
      return NextResponse.json({ ok: false, error: 'parse_failed' }, { status: 502 });
    }

    const runsDone = singles.length;
    const namedCount = singles.filter((s) => s.recs.some((r) => isSameBusiness(r, f.biz))).length;
    const found = singles.filter((s) => s.found).length * 2 >= runsDone;
    const wouldRecommend = mode(singles.map((s) => s.wouldRecommend));
    const nameSummary = singles.find((s) => s.nameSummary)?.nameSummary ?? '';
    const freq = new Map<string, { name: string; count: number }>();
    for (const s of singles) {
      for (const r of s.recs) {
        if (isSameBusiness(r, f.biz)) continue;
        const k = normKey(r);
        if (!k) continue;
        const e = freq.get(k) ?? { name: r, count: 0 };
        e.count += 1;
        freq.set(k, e);
      }
    }
    const competitors = [...freq.values()].sort((a, b) => b.count - a.count).slice(0, 6).map((e) => e.name);
    const needSummary = singles.find((s) => s.needSummary)?.needSummary ?? '';

    const readGiven = Boolean(f.site) && singles.some((s) => s.readClear !== undefined);
    const readClear = readGiven && singles.filter((s) => s.readClear).length * 2 >= singles.filter((s) => s.readClear !== undefined).length;
    const readSummary = singles.find((s) => s.readSummary)?.readSummary ?? '';

    const report: Report = {
      byName: { found, wouldRecommend, summary: nameSummary },
      byNeed: { namedCount, runs: runsDone, competitors, summary: needSummary },
      ...(readGiven ? { readability: { clear: readClear, summary: readSummary } } : {}),
      verdict: makeVerdict(found, namedCount, runsDone, f.biz),
    };

    captureNotion(email, f, report).catch(() => {});
    const emailSent = await deliverReport(email, f, report);
    return NextResponse.json({
      ok: true,
      report,
      emailSent,
      prompts: { byName: byNamePrompt(f), byNeed: needPrompts },
      engine: `Checked with ChatGPT (OpenAI ${MODEL}) and live web search`,
    });
  } catch (err) {
    console.error('[ai-visibility] error:', err);
    return NextResponse.json({ ok: false, error: 'upstream' }, { status: 502 });
  }
}

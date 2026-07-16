/**
 * Shared prompt builders for the AI-visibility self-check.
 *
 * Both the UI (AiVisibilitySelfCheck) and the API (/api/ai-visibility) import
 * these, so the prompts a visitor SEES are exactly the ones the check RUNS.
 * The by-need set is three different real-customer phrasings, we report how
 * many of the three name the business.
 */

export type AivcFields = { biz: string; city: string; service: string; need: string; site?: string };

function ph(v: string | undefined, fallback: string): string {
  const t = (v ?? '').trim();
  return t || fallback;
}

export function byNamePrompt(f: AivcFields): string {
  const B = ph(f.biz, '[your business]');
  const C = ph(f.city, '[your city]');
  return `What do you know about ${B} in ${C}? Would you recommend them, and what would make you recommend them more strongly?`;
}

export function byNeedPrompts(f: AivcFields): string[] {
  const C = ph(f.city, '[your city]');
  const S = ph(f.service, '[your service]');
  const N = ph(f.need, '[your typical customer and their problem]');
  return [
    `I'm ${N}. Who are the best ${S} providers in ${C} I should contact, and why?`,
    `What are the best ${S} providers in ${C} in 2026, and who would you recommend first?`,
    `Who are the most trusted ${S} businesses near ${C}, and what makes each one stand out?`,
  ];
}

export function readabilityPrompt(f: AivcFields): string | null {
  const raw = (f.site ?? '').trim();
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  return `Read this page: ${url} . In two or three sentences, who is this business for, what do they do best, and where are they based? Then list anything important that is unclear or missing.`;
}

export const SOURCE_PROMPT = 'What sources are you basing that on?';

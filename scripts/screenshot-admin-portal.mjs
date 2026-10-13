// Eyes on the admin portal. Mints a valid admin session cookie from ADMIN_JWT_SECRET (.env.local)
// and screenshots every /admin/portal surface at desktop width, so an agent can actually SEE the
// rendered pages (Read the PNGs) instead of designing blind. This is how the "cards/yellow were
// invisible" bug was finally caught: a computed-style probe showed --dot-* resolved to empty
// because the design-system stylesheet was never imported on the admin route.
//
//   node scripts/screenshot-admin-portal.mjs            # prod
//   BASE=http://localhost:3000 node scripts/...          # local (run `npm run start` first)
//
// Requires: npx playwright install chromium (one-time). Reads the secret locally; prints nothing sensitive.

import { chromium } from 'playwright'
import { SignJWT } from 'jose'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE || 'https://www.thedotcreative.co'
const OUT = process.env.OUT || '/tmp'
const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').find((l) => l.startsWith('ADMIN_JWT_SECRET='))
if (!line) throw new Error('ADMIN_JWT_SECRET not found in .env.local')
const secret = line.slice('ADMIN_JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '')

const token = await new SignJWT({ role: 'admin' })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('admin').setIssuer('thedot-site').setAudience('thedot-admin')
  .setIssuedAt().setExpirationTime('12h')
  .sign(new TextEncoder().encode(secret))

const pages = [
  ['my-tasks', '/admin/portal'], ['pieces', '/admin/portal/pieces'],
  ['publication', '/admin/portal/publication'], ['calendar', '/admin/portal/calendar'],
  ['plan', '/admin/portal/plan'], ['ideas', '/admin/portal/ideas'],
  ['reports', '/admin/portal/reports'], ['strategy', '/admin/portal/strategy'],
  ['library', '/admin/portal/library'], ['billing', '/admin/portal/billing'],
  ['requests', '/admin/portal/requests'],
]

const domain = new URL(BASE).hostname
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{
  name: 'session', value: token, domain, path: '/',
  httpOnly: true, secure: BASE.startsWith('https'), sameSite: 'Lax',
}])
const page = await ctx.newPage()
for (const [name, path] of pages) {
  const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/admin-${name}.png`, fullPage: true })
  console.log(`${name}: ${resp?.status()} ${page.url().includes('/admin/login') ? 'BOUNCED' : 'ok'} -> ${OUT}/admin-${name}.png`)
}
await browser.close()

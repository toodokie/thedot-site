// Layout checks for the redesigned piece page (plan 4a). Drives the read-only "View as Maria"
// preview with ?layout=v2 at 375px (phone) and 1440px (desktop):
//   - no horizontal scroll on the phone
//   - every button, link and tab outside running text is at least 44px tall on the phone
//   - one h1; body copy at least 16px
//   - the decision bar is inside the viewport
//   - the condensed header collapses past 120px, stays at 60px, expands under 40px, and the page
//     height never changes while it does
//   - with reduced motion the condensed bar has no transition
// Writes PNGs to OUT. Exits 1 on any failure.
//
//   BASE=http://localhost:3000 PIECES=<reel id>,<podcast id>,<linkedin id>,<article id> node scripts/piece-page-phone-check.mjs
import { SignJWT } from 'jose'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'

const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE
  || '/Users/anastasiavolkova/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium } = await import(PLAYWRIGHT)
const BASE = process.env.BASE || 'http://localhost:3000'
const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)
const OUT = process.env.OUT || '/tmp/kanset-piece-page-check'
const PIECES = (process.env.PIECES || '').split(',').map((id) => id.trim()).filter(Boolean)
if (PIECES.length === 0) throw new Error('Set PIECES to a comma list of content ids: one reel, one podcast, one LinkedIn PDF, one article')
mkdirSync(OUT, { recursive: true })

// ADMIN_JWT_SECRET in the environment wins (a throwaway value for a local build); otherwise .env.local.
function readSecret() {
  if (process.env.ADMIN_JWT_SECRET) return process.env.ADMIN_JWT_SECRET
  const envFile = new URL('../.env.local', import.meta.url)
  const line = existsSync(envFile)
    ? readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_JWT_SECRET='))
    : undefined
  if (!line) throw new Error('ADMIN_JWT_SECRET not set and not found in .env.local')
  return line.slice('ADMIN_JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '')
}
const secret = readSecret()
const token = await new SignJWT({ role: 'admin' }).setProtectedHeader({ alg: 'HS256' })
  .setSubject('admin').setIssuer('thedot-site').setAudience('thedot-admin')
  .setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(secret))

const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
]
const failures = []
// PLAYWRIGHT_CHANNEL=chrome uses the installed Google Chrome when no Playwright browser is downloaded.
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {})
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 2,
      // A local `next start` runs in production mode, whose middleware redirects plain http to https.
      ...(LOCAL_HTTP ? { extraHTTPHeaders: { 'x-forwarded-proto': 'https' } } : {}),
    })
    await context.addCookies([{ name: 'session', value: token, domain: new URL(BASE).hostname, path: '/',
      httpOnly: true, secure: BASE.startsWith('https'), sameSite: 'Lax' }])
    const page = await context.newPage()
    for (const id of PIECES) {
      const label = `${vp.name} ${id}`
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto(`${BASE}/admin/portal/pieces/${encodeURIComponent(id)}/maria-preview?layout=v2`, { waitUntil: 'networkidle', timeout: 60000 })
      if (page.url().includes('/admin/login')) { failures.push(`${label}: bounced to login`); continue }
      await page.waitForSelector('[data-piece-page-v2]', { timeout: 20000 })
      await page.screenshot({ path: `${OUT}/${vp.name}-${id}-top.png` })

      const facts = await page.evaluate(() => {
        const root = document.querySelector('[data-piece-page-v2]')
        const overflow = document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth
        const small = [...root.querySelectorAll('button, a, [role="tab"]')].filter((el) => {
          if (el.closest('[inert]') || el.closest('p') || el.closest('dialog:not([open])')) return false
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0 && rect.height < 44
        }).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}" ${Math.round(el.getBoundingClientRect().height)}px`)
        const panel = document.querySelector('[role="tabpanel"]')
        const bar = document.querySelector('[aria-label="Your review"]')
        return {
          overflow,
          small,
          h1: document.querySelectorAll('h1').length,
          bodyFont: panel ? parseFloat(getComputedStyle(panel).fontSize) : 16,
          barInView: bar ? bar.getBoundingClientRect().bottom <= window.innerHeight + 1 : true,
          // Nothing (a sidebar, a bottom nav) may sit on top of the decision bar's corners or centre.
          barCovered: bar ? (() => {
            const r = bar.getBoundingClientRect()
            const y = Math.min(r.top + r.height / 2, window.innerHeight - 2)
            return [r.left + 2, r.left + r.width / 2, r.right - 2].some((x) => {
              const hit = document.elementFromPoint(x, y)
              return !hit || !bar.contains(hit)
            })
          })() : false,
          tall: document.scrollingElement.scrollHeight > window.innerHeight + 200,
        }
      })
      if (facts.h1 !== 1) failures.push(`${label}: ${facts.h1} h1 elements`)
      if (facts.bodyFont < 16) failures.push(`${label}: body copy ${facts.bodyFont}px`)
      if (!facts.barInView) failures.push(`${label}: decision bar outside the viewport`)
      if (facts.barCovered) failures.push(`${label}: decision bar covered by another element`)
      if (vp.name === 'phone') {
        if (facts.overflow > 0) failures.push(`${label}: horizontal scroll of ${facts.overflow}px`)
        for (const item of facts.small) failures.push(`${label}: touch target under 44px: ${item}`)
      }

      if (facts.tall) {
        const states = []
        const heights = []
        for (const y of [0, 130, 60, 30]) {
          await page.evaluate((top) => window.scrollTo(0, top), y)
          await page.waitForTimeout(350)
          states.push(await page.evaluate(() => document.querySelector('[data-collapsed]')?.getAttribute('data-collapsed')))
          heights.push(await page.evaluate(() => document.scrollingElement.scrollHeight))
        }
        if (states.join(',') !== 'false,true,true,false') failures.push(`${label}: header states ${states.join(',')}`)
        if (new Set(heights).size !== 1) failures.push(`${label}: page height changed ${heights.join(',')}`)
        await page.evaluate(() => window.scrollTo(0, 400))
        await page.waitForTimeout(350)
        await page.screenshot({ path: `${OUT}/${vp.name}-${id}-scrolled.png` })
      }

      await page.emulateMedia({ reducedMotion: 'reduce' })
      const transition = await page.evaluate(() => getComputedStyle(document.querySelector('[data-collapsed]')).transitionDuration)
      if (!/^0s(, 0s)*$/.test(transition)) failures.push(`${label}: condensed bar animates with reduced motion (${transition})`)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `${OUT}/${vp.name}-${id}-full.png`, fullPage: true })
      console.log(`${label}: checked`)
    }
    await context.close()
  }
} finally {
  await browser.close()
}
for (const failure of failures) console.error(`FAIL ${failure}`)
console.log(failures.length === 0 ? `PASS: ${PIECES.length} pieces at 375px and 1440px` : `${failures.length} failures`)
process.exit(failures.length === 0 ? 0 : 1)

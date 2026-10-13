// Layout checks for the redesigned piece page (plan 4a). Drives the read-only "View as Maria"
// preview with ?layout=v2 at 375px and 430px (phones) and 1440px (desktop):
//   - no horizontal scroll on the phone
//   - every button, link and tab outside running text is at least 44px tall on the phone
//   - one h1; body copy at least 16px
//   - the decision bar is inside the viewport
//   - the condensed header collapses past 120px, stays at 60px, expands under 40px, and the page
//     height never changes while it does
//   - with reduced motion the condensed bar has no transition
//   - the header's More actions menu opens inside the viewport (a bottom sheet on a phone, 16px
//     clear of both edges as a dropdown on a computer), Escape closes it and focus returns to it
// Writes PNGs to OUT. Exits 1 on any failure.
//
//   BASE=http://localhost:3000 PIECES=<reel id>,<podcast id>,<linkedin id>,<article id> node scripts/piece-page-phone-check.mjs
// Plan 5 adds the agency-mode admin piece page for every PIECES id and, with CLIENT_EMAIL (a fresh
// LOCAL seat; needs the local NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY), the client
// seat checks for the rollout note and the feedback card on CLIENT_PIECE (default: the first id).
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
  { name: 'phone', width: 375, height: 812, isMobile: true, hasTouch: true, phone: true },
  { name: 'phone-430', width: 430, height: 932, isMobile: true, hasTouch: true, phone: true },
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

      // The header's More actions menu stays inside the viewport and hands focus back on Escape.
      const header = page.locator('[data-piece-page-v2] header').first()
      await header.screenshot({ path: `${OUT}/${vp.name}-${id}-header.png` })
      const more = header.getByRole('button', { name: 'More actions' })
      await more.click()
      const menu = page.getByRole('menu', { name: 'More actions' })
      await menu.waitFor({ timeout: 5000 })
      await page.waitForTimeout(100)
      const menuBox = await menu.boundingBox()
      const variant = await menu.getAttribute('data-variant')
      const edge = vp.phone ? 0 : 16
      if (!menuBox || menuBox.x < edge - 0.5 || menuBox.x + menuBox.width > vp.width - edge + 0.5
        || menuBox.y < 0 || menuBox.y + menuBox.height > vp.height + 0.5) {
        failures.push(`${label}: More actions menu outside the viewport ${JSON.stringify(menuBox)}`)
      }
      if (vp.phone && variant !== 'sheet') failures.push(`${label}: More actions menu is a ${variant}, not a bottom sheet`)
      if (vp.phone && menuBox && Math.abs(menuBox.width - vp.width) > 1) failures.push(`${label}: bottom sheet is ${menuBox.width}px wide, not full width`)
      const shortItems = await menu.getByRole('menuitem').evaluateAll((items) => items
        .filter((item) => item.getBoundingClientRect().height < 44).map((item) => item.textContent))
      for (const item of shortItems) failures.push(`${label}: menu item under 44px: ${item}`)
      await page.screenshot({ path: `${OUT}/${vp.name}-${id}-header-menu.png` })
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached', timeout: 5000 })
      if (!(await more.evaluate((el) => el === document.activeElement))) failures.push(`${label}: focus did not return to More actions`)
      console.log(`${label}: More actions menu ${variant} ${JSON.stringify(menuBox)}`)

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
      if (vp.phone) {
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
      // Plan 4b: a phone edits in a full-screen sheet with Done on screen; a computer edits in place.
      // The admin preview keeps drafts in this throwaway browser only; nothing is typed here anyway.
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      const edit = page.locator('[data-piece-page-v2] button', { hasText: /^Edit( text| section)?$/ }).first()
      if (await edit.count()) {
        await edit.scrollIntoViewIfNeeded()
        await edit.click()
        if (vp.phone) {
          const sheet = page.locator('dialog[open]')
          await sheet.waitFor({ timeout: 5000 })
          const box = await sheet.boundingBox()
          if (!box || box.width < vp.width - 1 || box.height < vp.height - 1) failures.push(`${label}: editor sheet is not full screen ${JSON.stringify(box)}`)
          const done = sheet.getByRole('button', { name: 'Done' })
          const doneBox = await done.boundingBox()
          if (!doneBox || doneBox.y + doneBox.height > vp.height || doneBox.height < 44) failures.push(`${label}: Done is off screen or under 44px`)
          await page.screenshot({ path: `${OUT}/${vp.name}-${id}-editing.png` })
          await done.click()
        } else {
          if ((await page.locator('[data-editing-slot]').count()) === 0) failures.push(`${label}: desktop edit did not open in place`)
          if ((await page.locator('dialog[open]').count()) > 0) failures.push(`${label}: desktop edit opened a sheet`)
          await page.screenshot({ path: `${OUT}/${vp.name}-${id}-editing.png` })
          await page.getByRole('button', { name: 'Done' }).first().click()
        }
      } else {
        console.log(`${label}: nothing editable (published or revision in progress); editing check skipped`)
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `${OUT}/${vp.name}-${id}-full.png`, fullPage: true })
      console.log(`${label}: checked`)
    }
    await context.close()
  }

  // Plan 5 (Task 18): the admin piece page in agency mode is Maria's page read-only with the
  // agency panel beside it (below it on a phone) and the "Maria's view" bar, never her decision bar.
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 2,
      ...(LOCAL_HTTP ? { extraHTTPHeaders: { 'x-forwarded-proto': 'https' } } : {}),
    })
    await context.addCookies([{ name: 'session', value: token, domain: new URL(BASE).hostname, path: '/',
      httpOnly: true, secure: BASE.startsWith('https'), sameSite: 'Lax' }])
    const page = await context.newPage()
    for (const id of PIECES) {
      const label = `${vp.name} agency ${id}`
      await page.goto(`${BASE}/admin/portal/pieces/${encodeURIComponent(id)}`, { waitUntil: 'networkidle', timeout: 60000 })
      if (page.url().includes('/admin/login')) { failures.push(`${label}: bounced to login`); continue }
      const facts = await page.evaluate(() => {
        const root = document.querySelector('[data-piece-page-v2]')
        const panel = document.querySelector('aside[aria-label="Agency panel"]')
        const box = (el) => (el ? el.getBoundingClientRect().toJSON() : null)
        return {
          root: box(root), panel: box(panel),
          decisionBars: document.querySelectorAll('[aria-label="Your review"]').length,
          agencyBars: document.querySelectorAll('[aria-label="Maria\'s view"]').length,
          overflow: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
        }
      })
      if (!facts.root) failures.push(`${label}: Maria's page (v2) not rendered in the centre`)
      if (!facts.panel || facts.panel.width === 0) failures.push(`${label}: agency panel missing`)
      if (facts.decisionBars !== 0) failures.push(`${label}: ${facts.decisionBars} client decision bar(s) on the agency page`)
      if (facts.agencyBars !== 1) failures.push(`${label}: ${facts.agencyBars} "Maria's view" bars`)
      if (facts.overflow > 0) failures.push(`${label}: horizontal scroll of ${facts.overflow}px`)
      if (facts.root && facts.panel) {
        if (vp.phone && facts.panel.top < facts.root.bottom - 1) failures.push(`${label}: panel not stacked below the page`)
        if (!vp.phone && facts.panel.left < facts.root.right - 1) failures.push(`${label}: panel not to the right of the page`)
      }
      await page.screenshot({ path: `${OUT}/${vp.name}-agency-${id}-full.png`, fullPage: true })
      console.log(`${label}: checked`)
    }
    await context.close()
  }

  // Plan 5 (Task 18): the client seat's own page. CLIENT_EMAIL must be a fresh LOCAL seat that has
  // never acknowledged the rollout note. Signs in through the real magic-link confirm flow (local
  // Supabase only), then per viewport: the rollout note shows on the seat's first visit only, never
  // together with the feedback card; a new tab (new visit) shows the card, which must not overlap
  // the decision bar, Approve or the assistant button; Close hides it for the visit. Nothing is sent.
  const CLIENT_EMAIL = process.env.CLIENT_EMAIL
  if (CLIENT_EMAIL) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (!LOCAL_HTTP || !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl)) {
      throw new Error('The client-seat check runs only against a local server and a local Supabase')
    }
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const slug = process.env.CLIENT_SLUG || 'kanset'
    const piece = process.env.CLIENT_PIECE || PIECES[0]
    const pieceUrl = `${BASE}/client/${slug}/piece/${encodeURIComponent(piece)}`
    let noteSeen = 0
    const overlap = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    const cardFacts = (page) => page.evaluate(() => {
      const box = (el) => (el && el.getBoundingClientRect().width > 0 ? el.getBoundingClientRect().toJSON() : null)
      const card = [...document.querySelectorAll('aside[role="dialog"]')].find((el) => el.querySelector('legend'))
      const approve = [...document.querySelectorAll('[aria-label="Your review"] button')].find((el) => /^Approv/.test(el.textContent.trim()))
      return {
        notes: [...document.querySelectorAll('dialog[open]')].filter((el) => el.querySelector('#piece-intro-title')).length,
        card: box(card), bar: box(document.querySelector('[aria-label="Your review"]')), approve: box(approve),
        assistant: box(document.querySelector('button[aria-label="Kanset Assistant"]')),
        vh: window.innerHeight, vw: window.innerWidth,
      }
    })
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 2,
        extraHTTPHeaders: { 'x-forwarded-proto': 'https' },
      })
      const link = await supabase.auth.admin.generateLink({ type: 'magiclink', email: CLIENT_EMAIL })
      if (link.error) throw new Error(`generateLink: ${link.error.message}`)
      const page = await context.newPage()
      // The confirm page's form POSTs to the verify route. Behind x-forwarded-proto=https the server
      // sees an https origin, so this same-origin POST says so too; the context's request client
      // keeps the session cookie the 303 sets. The redirect itself (to https://localhost) is not followed.
      const verify = await context.request.post(`${BASE}/client/auth/confirm/verify`, {
        form: { token_hash: link.data.properties.hashed_token, type: 'magiclink', next: `/client/${slug}/piece/${piece}` },
        headers: { origin: BASE.replace(/^http:/, 'https:') }, maxRedirects: 0,
      })
      if (verify.status() !== 303) throw new Error(`client sign-in returned ${verify.status()}`)
      if (/\/client\/login/.test(verify.headers().location || '')) throw new Error(`client sign-in failed: ${verify.headers().location}`)
      await page.goto(pieceUrl, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForSelector('[data-piece-page-v2]', { timeout: 20000 })
      await page.waitForTimeout(500)
      const label = `${vp.name} client ${piece}`
      const first = await cardFacts(page)
      if (first.notes > 1) failures.push(`${label}: ${first.notes} rollout notes at once`)
      if (first.notes === 1) {
        noteSeen += 1
        if (first.card) failures.push(`${label}: feedback card shown together with the rollout note`)
        await page.screenshot({ path: `${OUT}/${vp.name}-client-note.png` })
        await page.getByRole('button', { name: 'Got it' }).click()
        await page.waitForTimeout(300)
        if ((await cardFacts(page)).card) failures.push(`${label}: feedback card appeared in the same visit as the note`)
        await page.reload({ waitUntil: 'networkidle' })
        await page.waitForTimeout(500)
        const reloaded = await cardFacts(page)
        if (reloaded.notes || reloaded.card) failures.push(`${label}: reload in the same visit shows ${reloaded.notes} note(s) and ${reloaded.card ? 'the card' : 'no card'}`)
      }
      // A new tab is a new visit (sessionStorage is per tab).
      const tab = await context.newPage()
      await tab.goto(pieceUrl, { waitUntil: 'networkidle', timeout: 60000 })
      await tab.waitForSelector('[data-piece-page-v2]', { timeout: 20000 })
      await tab.waitForTimeout(500)
      const facts = await cardFacts(tab)
      if (facts.notes) failures.push(`${label}: rollout note shown again on a later visit`)
      if (!facts.card) failures.push(`${label}: feedback card missing on a new visit`)
      else {
        if (facts.card.top < 0 || facts.card.bottom > facts.vh + 0.5 || facts.card.left < 0 || facts.card.right > facts.vw + 0.5) {
          failures.push(`${label}: feedback card outside the viewport ${JSON.stringify(facts.card)}`)
        }
        if (!facts.bar) failures.push(`${label}: decision bar missing`)
        if (overlap(facts.card, facts.bar)) failures.push(`${label}: feedback card overlaps the decision bar (card bottom ${Math.round(facts.card.bottom)}, bar top ${Math.round(facts.bar.top)})`)
        if (overlap(facts.card, facts.approve)) failures.push(`${label}: feedback card overlaps Approve`)
        if (overlap(facts.card, facts.assistant)) failures.push(`${label}: feedback card overlaps the assistant button`)
        console.log(`${label}: card ${JSON.stringify({ top: facts.card.top, bottom: facts.card.bottom })} bar top ${facts.bar?.top} approve ${facts.approve ? 'shown' : 'absent'}`)
        await tab.screenshot({ path: `${OUT}/${vp.name}-client-feedback-card.png` })
        await tab.getByRole('button', { name: 'Close', exact: true }).click()
        await tab.waitForTimeout(200)
        if ((await cardFacts(tab)).card) failures.push(`${label}: Close did not hide the card`)
        await tab.reload({ waitUntil: 'networkidle' })
        await tab.waitForTimeout(500)
        if ((await cardFacts(tab)).card) failures.push(`${label}: card came back in the same visit after Close`)
      }
      await context.close()
      console.log(`${label}: checked`)
    }
    if (noteSeen !== 1) failures.push(`client: rollout note shown on ${noteSeen} visits, expected exactly 1 (use a fresh local seat)`)
  }
} finally {
  await browser.close()
}
for (const failure of failures) console.error(`FAIL ${failure}`)
console.log(failures.length === 0 ? `PASS: ${PIECES.length} pieces at 375px, 430px and 1440px` : `${failures.length} failures`)
process.exit(failures.length === 0 ? 0 : 1)

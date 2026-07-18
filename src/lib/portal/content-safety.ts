import type { ParsedContent } from './frontmatter'
import {
  isAllowedClientVisibleHostname,
  isAllowedPublicEmail,
  isAllowedPublicPhone,
  isAllowedPublicRcicNumber,
  isAllowedPublicSocialHandle,
} from './public-contact-policy'

export type ContentSafetyCode =
  | 'unknown_email'
  | 'unknown_phone'
  | 'unknown_social_handle'
  | 'unknown_regulatory_identifier'
  | 'case_identifier'
  | 'raw_email_header'
  | 'private_financial_context'
  | 'control_marker'
  | 'unsafe_link'

export type ContentSafetyFinding = {
  code: ContentSafetyCode
  field: string
}

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const PHONE = /(?:\+?\d[\s().-]*){10,15}/g
const SOCIAL_HANDLE = /@[A-Z0-9](?:[A-Z0-9_.-]{0,61}[A-Z0-9])?/giu
const RCIC_NUMBER = /\bRCIC\s*(?:#|no\.?|number)?\s*([0-9]{6})\b/giu
const CLIENT_VISIBLE_URL = /(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/giu
// These expressions are used with RegExp.test(). They must not be global: a
// global expression retains lastIndex and can otherwise miss alternating fields.
const CASE_IDENTIFIER = /\b(?:UCI|application\s+(?:number|no\.?)|file\s+(?:number|no\.?)|client\s+id|account\s+number|invoice\s+(?:number|no\.?))\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{3,}\b/iu
const RAW_EMAIL_HEADER = /^(?:from|to|cc|bcc|sent|subject):\s*.+$/imu
const PRIVATE_FINANCIAL = /\b(?:invoice|quote|account|balance|amount\s+due)\b[^\n]{0,50}(?:CAD\s*)?\$\s*\d|(?:CAD\s*)?\$\s*\d[^\n]{0,50}\b(?:invoice|quote|account|balance|amount\s+due)\b/iu
const CONTROL_MARKER = /<!--\s*internal\s*-->|<!--\s*portal-block:|portal_state_mirror/iu

function textFields(content: ParsedContent): Array<[string, string]> {
  const fields: Array<[string, string]> = [
    ['title', content.title],
    ['client_body', content.client_body],
  ]
  for (const block of content.copy_blocks) {
    fields.push([`copy_blocks.${block.key}.label`, block.label])
    fields.push([`copy_blocks.${block.key}.body`, block.body])
  }
  if (content.fact_check_exemption) fields.push(['fact_check_exemption', content.fact_check_exemption])
  for (const entry of content.fact_check_ledger) {
    fields.push([`fact_check_ledger.${entry.claim_key}.claim`, entry.claim])
    if (entry.source_title) fields.push([`fact_check_ledger.${entry.claim_key}.source_title`, entry.source_title])
  }
  return fields
}

function unsafeLink(value: string | null, expectedHosts: readonly string[]): boolean {
  if (!value) return false
  if (/\p{C}/u.test(value) || value.length > 2048) return true
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return true
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
    return !expectedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return true
  }
}

function unsafeClientVisibleLink(value: string): boolean {
  const trimmed = value.replace(/[),.!?;:]+$/u, '')
  if (/\p{C}/u.test(trimmed) || trimmed.length > 2048) return true
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:/iu.test(trimmed)
    const parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return true
    return !isAllowedClientVisibleHostname(parsed.hostname)
  } catch {
    return true
  }
}

export function findContentSafetyFindings(content: ParsedContent): ContentSafetyFinding[] {
  const findings: ContentSafetyFinding[] = []
  for (const [field, text] of textFields(content)) {
    for (const match of text.matchAll(EMAIL)) {
      if (!isAllowedPublicEmail(match[0])) findings.push({ code: 'unknown_email', field })
    }
    for (const match of text.matchAll(PHONE)) {
      const digits = match[0].replace(/\D/g, '')
      if (digits.length >= 10 && digits.length <= 15 && !isAllowedPublicPhone(match[0])) {
        findings.push({ code: 'unknown_phone', field })
      }
    }
    for (const match of text.matchAll(SOCIAL_HANDLE)) {
      // The @ inside an email address belongs to the email check above, not the
      // public-social-identity allow-list.
      const previous = match.index === 0 ? '' : text[match.index - 1]
      if (/[A-Z0-9._%+-]/iu.test(previous)) continue
      if (!isAllowedPublicSocialHandle(match[0])) {
        findings.push({ code: 'unknown_social_handle', field })
      }
    }
    for (const match of text.matchAll(RCIC_NUMBER)) {
      if (!isAllowedPublicRcicNumber(match[1])) {
        findings.push({ code: 'unknown_regulatory_identifier', field })
      }
    }
    for (const match of text.matchAll(CLIENT_VISIBLE_URL)) {
      // Avoid double-classifying the domain portion of an email as a link.
      const previous = match.index === 0 ? '' : text[match.index - 1]
      if (previous === '@') continue
      if (unsafeClientVisibleLink(match[0])) findings.push({ code: 'unsafe_link', field })
    }
    if (CASE_IDENTIFIER.test(text)) findings.push({ code: 'case_identifier', field })
    if (RAW_EMAIL_HEADER.test(text)) findings.push({ code: 'raw_email_header', field })
    if (PRIVATE_FINANCIAL.test(text)) findings.push({ code: 'private_financial_context', field })
    if (CONTROL_MARKER.test(text)) findings.push({ code: 'control_marker', field })
  }

  if (unsafeLink(content.canva_url, ['canva.com'])) findings.push({ code: 'unsafe_link', field: 'canva_url' })
  if (unsafeLink(content.drive_url, ['drive.google.com', 'docs.google.com'])) {
    findings.push({ code: 'unsafe_link', field: 'drive_url' })
  }
  return findings
}

export function assertClientSafeContent(content: ParsedContent, source: string): void {
  const first = findContentSafetyFindings(content)[0]
  if (first) {
    // Do not include the matched value: errors may be written to CI/Vercel/operator logs.
    throw new Error(`Client-content safety check failed (${first.code}) in ${first.field} of ${source}`)
  }
}

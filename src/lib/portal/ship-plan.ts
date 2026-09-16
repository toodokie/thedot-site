// Publishing happens outside the portal: Anastasia posts from Maria's approved copy and moves
// on. The portal's close-out (reconcile the requests, release, record the override, attach the
// permalinks) is a separate ritual that in practice never runs, so canonical falls behind, packs
// drift, requests stay open, and the client projection keeps showing produced work as "still in
// planning". Backfilling that by hand costs an approval round trip per piece and the debt
// regenerates every week.
//
// This module decides the whole close-out from state that already exists at the moment of
// posting, so the record becomes a by-product of shipping. It performs no IO: the caller reads
// the portal and canonical file, and executes the returned steps with the audited commands.

export type ShipDestination = 'instagram' | 'facebook' | 'youtube' | 'linkedin' | 'squarespace'

export type ShipRequest = {
  id: string
  status: string
  blockKey: string | null
  targetKind: string
  baseVersion: number | null
}

export type ShipItemState = {
  status: string
  workingVersion: number | null
  clientVisibleVersion: number | null
  revisionInProgress: boolean
  plannedDate: string | null
  platforms: string[]
  archived: boolean
}

/**
 * The RELEASED BASE as committed in git, never the working file on disk.
 *
 * The reconciler generates the new version from the released bytes at the base version's commit
 * and applies Maria's patches to those. Metadata that is only present in the working copy never
 * reaches the generated version, so a preflight that reads the working file can pass and then
 * fail mid-run.
 */
export type ShipReleasedBase = {
  readable: boolean
  version: number | null
  producer: string | null
  scheduledDate: string | null
}

export type ShipInput = {
  contentId: string
  item: ShipItemState
  requests: ShipRequest[]
  releasedBase: ShipReleasedBase
  /** Destinations the operator is confirming, with the exact public permalink for each. */
  links: Array<{ destination: ShipDestination; liveUrl: string }>
  /** Destinations that already carry a publication target on the version being released. */
  existingTargets: Array<{ destination: string; contentVersion: number }>
  /** True when the client has genuinely approved the version being released. */
  clientApprovedTargetVersion: boolean
  /** True when an agency courtesy release is already on record for the target version. */
  courtesyReleaseRecorded: boolean
}

export type ShipPlan = {
  contentId: string
  /** The version that ends up client-visible and carries the publication evidence. */
  targetVersion: number
  /** 'bundle' needs two or more requests; 'single' is the one-request path; 'none' skips it. */
  reconcile: 'none' | 'single' | 'bundle'
  reconcileRequestIds: string[]
  release: boolean
  courtesyRelease: boolean
  overrideDestinations: ShipDestination[]
  publishDestinations: ShipDestination[]
  blockers: string[]
  warnings: string[]
}

const OPEN_STATUSES = new Set(['pending', 'applying'])

export function planShip(input: ShipInput): ShipPlan {
  const blockers: string[] = []
  const warnings: string[] = []
  const { item, releasedBase, requests } = input

  if (item.archived) blockers.push('the piece is archived')
  if (item.clientVisibleVersion === null) {
    blockers.push('the piece has no released version, so there is nothing to ship against')
  }
  if (!releasedBase.readable) {
    blockers.push('the released base is not readable from the canonical repository, so its '
      + 'provenance commit is unreachable and needs an ancestry repair first')
  }
  // producer no longer gates the courtesy release. 0086 moved that decision onto the named
  // Anastasia override, because a null producer said nothing about conflict of interest and a
  // missing metadata field was hard-blocking releases of pieces that were already public.
  // It still matters editorially: studio-produced content must carry the @loftcreativespace
  // credit in every caption, so a missing value is worth seeing, and portal-health counts them.
  if (releasedBase.readable && !releasedBase.producer) {
    warnings.push('the released base does not declare producer, so the generated version will not '
      + 'either; the release proceeds on the named override, but record it for credit accuracy')
  }

  const base = input.item.clientVisibleVersion ?? 0
  const open = requests.filter((r) => OPEN_STATUSES.has(r.status))
  const conflicted = requests.filter((r) => r.status === 'conflicted')
  if (conflicted.length > 0) {
    blockers.push(`${conflicted.length} request(s) are conflicted and need manual recovery first`)
  }

  // A visual request already prepared into this same revision blocks the copy reconciliation
  // until migration 0083 is applied. Name it rather than failing halfway through.
  const preparedSibling = requests.filter((r) => r.status === 'prepared' && r.baseVersion === base)
  if (preparedSibling.length > 0 && open.length > 0) {
    blockers.push('a sibling request is already prepared into this revision, which the revision '
      + 'guard refuses until migration 0083 is applied')
  }

  const nonCopy = open.filter((r) => r.targetKind !== 'copy_block' || !r.blockKey)
  if (nonCopy.length > 0) {
    blockers.push('only copy edits can be reconciled verbatim; '
      + `${nonCopy.length} open request(s) target something else`)
  }
  const staleBase = open.filter((r) => r.baseVersion !== base)
  if (staleBase.length > 0) {
    blockers.push('open requests do not all sit on the released version')
  }
  const duplicateBlocks = new Set<string>()
  for (const r of open) {
    if (r.blockKey && duplicateBlocks.has(r.blockKey)) {
      blockers.push(`two open requests target the same copy block "${r.blockKey}"`)
    }
    if (r.blockKey) duplicateBlocks.add(r.blockKey)
  }

  const targetVersion = open.length > 0 ? base + 1 : base
  const reconcile = open.length === 0 ? 'none' : open.length === 1 ? 'single' : 'bundle'

  if (open.length > 0) {
    warnings.push(`the reconciler will author v${targetVersion} from the released base and `
      + 'Maria\'s submitted text')
  }
  // The generated version carries the base's date forward, and the reconciler refuses when that
  // disagrees with the date the portal owns.
  if (releasedBase.readable && releasedBase.scheduledDate !== item.plannedDate) {
    blockers.push(`the released base has scheduled_date ${releasedBase.scheduledDate ?? 'missing'}, `
      + `which does not match the portal planned date ${item.plannedDate ?? 'missing'}`)
  }

  if (input.links.length === 0) blockers.push('no permalinks were supplied')
  const seen = new Set<string>()
  for (const link of input.links) {
    if (seen.has(link.destination)) blockers.push(`destination ${link.destination} was supplied twice`)
    seen.add(link.destination)
    if (!/^https:\/\/\S+$/.test(link.liveUrl)) {
      blockers.push(`${link.destination} permalink is not an https URL`)
    }
    if (!item.platforms.includes(link.destination)) {
      warnings.push(`${link.destination} is not one of the piece's declared platforms; it will be `
        + 'recorded as an audited destination override')
    }
  }
  const missing = item.platforms.filter((p) => !seen.has(p as ShipDestination))
  if (missing.length > 0) {
    warnings.push(`no permalink supplied for ${missing.join(', ')}; `
      + 'the piece stays incomplete until every destination is confirmed')
  }

  const alreadyTargeted = new Set(
    input.existingTargets.filter((t) => t.contentVersion === targetVersion).map((t) => t.destination),
  )
  const publishDestinations = input.links.map((l) => l.destination)
  const overrideDestinations = publishDestinations.filter((d) => !alreadyTargeted.has(d))

  return {
    contentId: input.contentId,
    targetVersion,
    reconcile,
    reconcileRequestIds: open.map((r) => r.id),
    release: open.length > 0 || item.clientVisibleVersion !== targetVersion,
    // Re-running the close-out to attach a late permalink must not record a second override.
    courtesyRelease: !input.clientApprovedTargetVersion && !input.courtesyReleaseRecorded,
    overrideDestinations,
    publishDestinations,
    blockers,
    warnings,
  }
}

/**
 * The reason recorded on every agency override. The command is run by Anastasia, so running it
 * IS the authorization, but the sentence has to say what actually happened and must carry the
 * exact prefix that record_content_courtesy_release and the destination override both require.
 */
export function shipOverrideReason(input: {
  destinations: string[]
  publishedOn: string
  targetVersion: number
  appliedEditCount: number
}): string {
  const where = input.destinations.join(', ')
  const edits = input.appliedEditCount === 0
    ? 'No client edits were outstanding'
    : input.appliedEditCount === 1
      ? 'Maria\'s submitted edit was applied verbatim'
      : `Maria's ${input.appliedEditCount} submitted edits were applied verbatim`
  return 'Agency override authorized by Anastasia: this piece was published to '
    + `${where} on ${input.publishedOn}. ${edits} and released as v${input.targetVersion}, so the `
    + 'portal record matches what is live. No second client review is required under the confirmed '
    + 'no-re-review workflow.'
}

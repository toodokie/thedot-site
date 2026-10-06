import type { SupabaseClient } from '@supabase/supabase-js'
import { optionChoices, type OptionChoice } from './review-asset-options'

// The agency reader for cover option picks (migration 0098): every seat's current pick for one
// version, with the options of each group. Service role only (the agency panel, portal-schedule).
export type AgencyOptionPick = { auth_user_id: string; option_group: string; asset_key: string; picked_at: string }
export type AgencyOptionChoice = OptionChoice & { pickedAt: string | null; pickedBy: string | null }

export async function getAgencyOptionChoices(
  admin: SupabaseClient,
  input: { clientId: string; contentItemId: string; contentVersion: number; seatNames?: ReadonlyMap<string, string> },
): Promise<AgencyOptionChoice[]> {
  const [assets, picks] = await Promise.all([
    admin.from('content_review_assets').select('asset_key, label, option_group, option_label')
      .eq('client_id', input.clientId).eq('content_item_id', input.contentItemId)
      .eq('content_version', input.contentVersion).not('option_group', 'is', null),
    admin.from('content_review_option_picks').select('auth_user_id, option_group, asset_key, picked_at')
      .eq('client_id', input.clientId).eq('content_item_id', input.contentItemId)
      .eq('content_version', input.contentVersion).order('picked_at', { ascending: false }),
  ])
  if (assets.error) throw new Error(`option assets: ${assets.error.message}`)
  if (picks.error) throw new Error(`option picks: ${picks.error.message}`)
  const rows = (picks.data ?? []) as AgencyOptionPick[]
  // The latest pick per group wins when more than one seat picked.
  const latest = new Map<string, AgencyOptionPick>()
  for (const row of rows) if (!latest.has(row.option_group)) latest.set(row.option_group, row)
  return optionChoices((assets.data ?? []) as Array<{ asset_key: string; label: string; option_group: string; option_label: string }>,
    [...latest.values()]).map((choice) => {
    const pick = latest.get(choice.group)
    return {
      ...choice,
      pickedAt: choice.chosen && pick ? pick.picked_at : null,
      pickedBy: choice.chosen && pick ? input.seatNames?.get(pick.auth_user_id) ?? 'Client' : null,
    }
  })
}

// One line per group for terminal readers: "youtube-test-3: Teal (Test cover 3, option B: teal), chosen by Maria".
export function optionChoiceLine(choice: AgencyOptionChoice): string {
  const options = choice.options.map((o) => o.optionLabel).join(' / ')
  return choice.chosen
    ? `${choice.group}: ${choice.chosen.optionLabel} (${choice.chosen.label}), chosen by ${choice.pickedBy ?? 'Client'}${choice.pickedAt ? ` ${choice.pickedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}`
    : `${choice.group}: not chosen yet (${options})`
}

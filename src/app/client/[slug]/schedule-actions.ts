'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { getScheduleDetails } from '@/lib/portal/schedule'
import { createSupabaseServer } from '@/lib/supabase/server'
import { resolveTorontoOffset } from '@/lib/portal/toronto-local-time'

function textField(data: FormData, key: string): string | null {
  const value = data.get(key)
  return typeof value === 'string' ? value : null
}

export async function requestScheduleChange(formData: FormData): Promise<{ error?: string }> {
  const slug = textField(formData, 'slug')
  const contentId = textField(formData, 'contentId')
  const idempotencyKey = textField(formData, 'idempotencyKey')
  if (!slug || !contentId || !idempotencyKey
      || !/^[A-Za-z0-9:_-]{8,128}$/.test(idempotencyKey)) {
    return { error: 'This form expired. Please reload and try again.' }
  }

  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canManageSchedule) {
    return { error: 'You do not have permission to change the schedule.' }
  }
  const item = await getContentItem(session.clientId, contentId)
  if (!item) return { error: 'That piece is no longer available.' }
  if (!['approved', 'partially_scheduled', 'schedule_failed', 'scheduled'].includes(item.state)) {
    return { error: 'This piece is not currently eligible for a schedule change.' }
  }

  const { targets } = await getScheduleDetails(session.clientId, item.id, item.version)
  const supabase = await createSupabaseServer()
  if (targets.some((target) => target.required)) {
    const localTime = textField(formData, 'requestedLocal')
    if (!localTime) return { error: 'Please choose a Toronto date and time.' }
    const offset = resolveTorontoOffset(localTime)
    if (!offset.ok) {
      if (offset.reason === 'ambiguous') {
        return { error: 'That time occurs twice when the clocks change. Please choose another time.' }
      }
      if (offset.reason === 'nonexistent') {
        return { error: 'That time does not exist because the clocks change then. Please choose another time.' }
      }
      return { error: 'Please choose a valid Toronto date and time.' }
    }
    const { error } = await supabase.rpc('request_content_reschedule', {
      p_content_id: item.id,
      p_content_version: item.version,
      p_requested_local: localTime.replace('T', ' '),
      p_timezone: 'America/Toronto',
      p_utc_offset_minutes: offset.offsetMinutes,
      p_idempotency_key: idempotencyKey,
    })
    if (error) {
      if (error.message.includes('schedule_request_already_pending')) {
        return { error: 'A schedule change is already waiting for The Dot.' }
      }
      if (error.message.includes('Toronto UTC offset') || error.message.includes('local time')) {
        return { error: 'That EDT/EST option does not match the selected Toronto date and time.' }
      }
      if (error.message.includes('out of range')) {
        return { error: 'Please choose a time at least five minutes from now and within two years.' }
      }
      return { error: 'Could not save the schedule request. Please try again.' }
    }
  } else {
    const plannedDate = textField(formData, 'plannedDate')
    if (!plannedDate || !/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) {
      return { error: 'Please choose a valid editorial plan date.' }
    }
    const { error } = await supabase.rpc('set_content_plan', {
      p_content_id: item.id,
      p_content_version: item.version,
      p_planned_date: plannedDate,
      p_idempotency_key: idempotencyKey,
    })
    if (error) {
      if (error.message.includes('out of range')) {
        return { error: 'Please choose a date from today through the next two years.' }
      }
      return { error: 'Could not update the editorial plan. Please try again.' }
    }
  }

  revalidatePath(`/client/${slug}`)
  revalidatePath(`/client/${slug}/calendar`)
  revalidatePath(`/client/${slug}/piece/${contentId}`)
  redirect(`/client/${slug}/piece/${contentId}`)
}

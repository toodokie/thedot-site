import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { loadAgencyPieceCalendar } from '@/lib/portal/gates-loader'
import AdminPageHeader from '../AdminPageHeader'
import AgencyMonthCalendar, { torontoTodayIso } from '../AgencyMonthCalendar'
import CalendarAdmin from '../CalendarAdmin'
import PieceCalendarTable from '../PieceCalendarTable'
import { loadCalendarData } from '../data'

export const dynamic = 'force-dynamic'

export default async function PortalAdminCalendarPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const admin = createSupabaseAdmin()
  const client = await admin.from('clients').select('id').eq('slug', 'kanset').single()
  const [rows, cal] = await Promise.all([
    loadAgencyPieceCalendar(admin, client.data?.id),
    loadCalendarData(),
  ])
  const active = rows.filter((r) => !r.archived)
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Calendar"
        intro="Every piece and when it runs. Open a piece from the month or use the complete list below. A calendar change can nudge a date, but never approves copy or confirms a post."
        count={active.length} countLabel="pieces" />
      <AgencyMonthCalendar rows={active} todayIso={torontoTodayIso()} />
      <PieceCalendarTable rows={rows} />
      <CalendarAdmin clients={cal.clients} integrations={cal.integrations} conflicts={cal.conflicts}
        unmapped={cal.unmapped} contentOptions={cal.contentOptions} />
    </>
  )
}

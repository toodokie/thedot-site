import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import CommentInbox from '../CommentInbox'
import { loadAdminComments } from '../data'

export const dynamic = 'force-dynamic'

export default async function AdminCommentsPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const comments = await loadAdminComments()
  return <>
    <AdminPageHeader kicker="Agency ops" title="Comments" display intro="Client feedback on copy and linked designs, in one durable queue." count={comments.filter((comment) => !comment.resolved).length} countLabel="open" />
    <CommentInbox comments={comments} />
  </>
}

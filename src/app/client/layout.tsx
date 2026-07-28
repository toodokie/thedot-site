// Pass-through layout for the whole /client route tree. Its ONLY job is to pull in the
// @thedot/design-system token + component CSS so the portal screens can use the components.
// It has ZERO auth logic and performs NO redirect on purpose: the real access guard lives in
// [slug]/layout.tsx. A guard here would fight the login/callback routes and cause a redirect loop.
// Because the marketing site does not render through this layout, the design-system CSS scopes
// itself to /client pages and never touches the main site.
import '@thedot/design-system/styles.css'
import PortalPwaRegistration from '@/components/PortalPwaRegistration'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <><PortalPwaRegistration />{children}</>
}

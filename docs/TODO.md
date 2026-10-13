# TODO

## Staging Subdomain Setup

**Status:** Pending

### Steps:
1. **Vercel:** Add `staging.thedotcreative.co` in project Settings → Domains
2. **GoDaddy:** Add CNAME record: `staging` → `cname.vercel-dns.com`
3. **Git:** Create and push `staging` branch

```bash
git checkout -b staging
git push -u origin staging
```

---

## Next.js 16 Upgrade

**Status:** Pending
**Current Version:** 15.3.8
**Target Version:** 16.0.10+

### Why Upgrade:
- Latest features and performance improvements
- Long-term support

### Recommended Process:
1. Set up staging subdomain first
2. Create feature branch: `git checkout -b upgrade/nextjs-16`
3. Run: `npm install next@16`
4. Test locally: `npm run dev`
5. Build: `npm run build`
6. Test all functionality:
   - [ ] Homepage
   - [ ] Portfolio pages
   - [ ] Blog
   - [ ] Contact form
   - [ ] Brief submission
   - [ ] Calculator/estimate
   - [ ] Admin dashboard
   - [ ] Email notifications
7. Merge to staging branch and test on staging.thedotcreative.co
8. If all good, merge to main

### Potential Breaking Changes to Watch:
- React Server Components behavior
- Middleware changes
- App Router updates
- Check Next.js 16 release notes before upgrading

---

## Notes

**2025-12-12:** Updated Next.js from 15.3.4 → 15.3.8 to patch CVE-2025-55184 (DoS) and CVE-2025-55183 (source code exposure).

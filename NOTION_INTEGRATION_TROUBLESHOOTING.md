# Notion Integration Troubleshooting Memo

## Issue: "Could not find database with ID" Error

If you see errors like:
```
Could not find database with ID: xxx-xxx-xxx. Make sure the relevant pages and databases are shared with your integration.
```

## Root Cause
The application uses **TWO different Notion integrations** with separate API tokens:

### Integration 1: Website Portfolio
- **Token**: `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`
- **Access**: Portfolio database only
- **Used by**: Portfolio sync scripts

### Integration 2: Website Calculator Integration  
- **Token**: `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`
- **Access**: Calculator Leads, Project Briefs, and one other database
- **Used by**: Calculator forms, project briefs

## Environment Variables Setup
```env
# Calculator/Brief integration (main token for forms/briefs)
NOTION_TOKEN=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

# Portfolio integration (for portfolio sync)
NOTION_TOKEN_PORTFOLIO=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

# Legacy calculator token (same as NOTION_TOKEN, kept for compatibility)
NOTION_CALCULATOR_TOKEN=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

# Database IDs
NOTION_PORTFOLIO_DB_ID=224d0f0c2544806aba32c82f0d08f463
NOTION_CALCULATOR_LEADS_DB_ID=221d0f0c-2544-8005-bd9a-ef957fc49934
NOTION_PROJECT_BRIEFS_DB_ID=222d0f0c-2544-80ba-a242-e90a77077057
NOTION_CONTACT_FORM_DB_ID=221d0f0c254480dcbbc1eb8d67bc53e8
```

## Code Usage
- **Calculator leads**: Uses `NOTION_CALCULATOR_TOKEN` in `src/app/api/save-calculator-lead/route.ts`
- **Project briefs**: Uses `NOTION_CALCULATOR_TOKEN` in `src/lib/notion.ts` 
- **Portfolio sync**: Uses `NOTION_TOKEN` in portfolio sync scripts

## Database Access Requirements
Each integration must be explicitly shared with the relevant databases:

### Portfolio Integration Access:
- ✅ Website Portfolio database

### Calculator Integration Access:
- ✅ Calculator Leads database
- ✅ Project Briefs database  
- ✅ Contact Forms database (if used)

## How to Fix Database Access Issues

1. **Go to the specific database in Notion**
2. **Click "⋯" (three dots) → "Add connections"**
3. **Select the correct integration**
4. **Grant "Can edit" permissions**

## Testing Database Access
Use the test endpoint to verify integration access:
```
GET /api/test-notion-access
```

This will show which databases each integration can see.

## Common Mistakes
- ❌ Using wrong token for the operation
- ❌ Database not shared with integration
- ❌ Database ID format issues (with/without hyphens)
- ❌ Mixing up which integration has access to which database

## Quick Diagnosis Steps
1. Check which token the failing API route is using
2. Verify the database ID format in environment variables
3. Confirm the integration has access to the specific database
4. Test with the database access endpoint

## Issue: Portfolio Images Return 403 Forbidden

If you see errors like:
```
Failed to load resource: the server responded with a status of 403 ()
```

### Root Cause
Notion S3 image URLs expire after 1 hour. The portfolio JSON files store these URLs at build time, so they become invalid after expiration.

### Immediate Fix
Run the portfolio refresh script to get fresh URLs:
```bash
node scripts/refresh-portfolio.mjs
```

### How the Image Proxy Works
1. The site uses `/api/image-proxy` to serve Notion images
2. When an image URL expires, the proxy automatically:
   - Detects the expiration
   - Fetches fresh URLs from Notion API
   - Caches them for 30 minutes
   - Retries failed requests

### ✅ IMPLEMENTED SOLUTION: Self-Hosted Images

Portfolio images are now self-hosted in `public/portfolio-images/`. This means:
- Images load instantly
- Never expire
- Work offline
- Better SEO
- No dependency on Notion uptime

### Workflow for Adding New Portfolio Projects

1. **Add project in Notion** with images
2. **Run the download script**:
   ```bash
   node scripts/download-portfolio-images.mjs
   ```
3. **Commit the new images**:
   ```bash
   git add public/portfolio-images/
   git add src/data/portfolio/
   git commit -m "Add new portfolio project"
   ```
4. **Deploy changes**

### Workflow for Updating Project Text Only

If you only change text/metadata (no new images):
```bash
node scripts/refresh-portfolio.mjs
```

### Scripts Available

- `scripts/download-portfolio-images.mjs` - Downloads all images and updates JSON files
- `scripts/refresh-portfolio.mjs` - Updates text/metadata only (keeps existing image paths)

### Emergency Manual Refresh
If the automatic refresh fails, you can manually update portfolio data:
1. Run `node scripts/refresh-portfolio.mjs`
2. Commit the updated JSON files
3. Deploy changes

---
**Last Updated**: January 6, 2025  
**Status**: All integrations working correctly with automatic image refresh
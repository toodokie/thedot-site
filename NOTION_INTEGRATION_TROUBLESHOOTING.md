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
# Portfolio integration (for portfolio sync)
NOTION_TOKEN=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

# Calculator integration (for forms/briefs) 
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

---
**Last Updated**: July 4, 2025  
**Status**: All integrations working correctly
# Admin Dashboard Setup Guide

Your secure admin dashboard is now ready! Follow these steps to get it running.

## Features

✅ **Secure Authentication** - JWT-based sessions with bcrypt password hashing
✅ **Lead Management** - Real-time view of all leads from Calculator, Contact Form, and Project Briefs
✅ **Security Monitoring** - Bot blocks and rate limit tracking
✅ **Marketing Analytics** - Conversion rates, lead temperature distribution, revenue potential
✅ **Email Integration** - Direct email links for quick lead response
✅ **Auto-refresh** - Dashboard updates every 30 seconds

## Setup Instructions

### Step 1: Generate Admin Password Hash

Run the password generator script:

```bash
npm run tsx scripts/generate-admin-password.ts
```

When prompted, enter a strong password (minimum 8 characters).

The script will output two environment variables you need to add.

### Step 2: Configure Environment Variables

Add these to your `.env.local` file (create it if it doesn't exist):

```bash
# Admin Dashboard Authentication
ADMIN_PASSWORD_HASH=<hash from generator script>
ADMIN_JWT_SECRET=<secret from generator script>

# Notion Database IDs (you should already have these)
NOTION_TOKEN=<your-notion-token>
NOTION_CALCULATOR_LEADS_DB_ID=<your-calculator-db-id>
NOTION_CONTACT_FORM_DB_ID=<your-contact-form-db-id>
NOTION_PROJECT_BRIEFS_DB_ID=<your-project-briefs-db-id>
```

### Step 3: Deploy to Vercel

1. Push your changes to GitHub:
```bash
git add .
git commit -m "feat: Add admin dashboard with security monitoring"
git push
```

2. In your Vercel dashboard:
   - Go to Settings → Environment Variables
   - Add `ADMIN_PASSWORD_HASH` and `ADMIN_JWT_SECRET`
   - Redeploy the project

### Step 4: Access Your Dashboard

**Login Page:** `https://yourdomain.com/admin/login`
**Dashboard:** `https://yourdomain.com/admin/dashboard`

Enter your admin password to access the dashboard.

## Dashboard Sections

### 1. Lead Notifications (Priority #1)
- **Recent Leads Table** - View all leads with contact info, service type, and lead score
- **Filter Options**:
  - All Leads
  - Hot Leads Only
  - New Leads Only
- **Quick Actions** - Click email to compose message instantly
- **Real-time Updates** - Auto-refreshes every 30 seconds

### 2. Security Monitoring (Priority #2)
- **Bot Blocks** - Count of blocked malicious bots today
- **Rate Limits** - Number of rate limit events
- **System Status** - Real-time operational status indicator

### 3. Marketing Analytics (Priority #3)
- **Conversion Funnel** - Track leads → contacts → briefs conversion rate
- **Lead Temperature Distribution** - Priority Hot, Hot, Warm, Cold breakdown
- **Revenue Potential** - Estimated pipeline value from all leads
- **Source Breakdown** - Calculator vs Contact Form vs Brief submissions

## Security Features

- **Password Hashing** - Bcrypt with 10 salt rounds
- **JWT Sessions** - 7-day expiry with HTTP-only cookies
- **Rate Limiting** - Max 5 login attempts per 15 minutes per IP
- **CSRF Protection** - SameSite cookie policy
- **Secure Cookies** - HTTPS-only in production

## Bot Protection Stats

The dashboard tracks:
- **Chinese bots** - LieBaoFast, UCBrowser, MQQBrowser, Baiduspider, etc.
- **Generic scrapers** - python-requests, scrapy, curl, wget
- **TikTok/Huawei bots** - Bytespider, PetalBot
- **Empty user agents** - Automated requests without identification

Stats reset every 24 hours automatically.

## Troubleshooting

### Cannot login
1. Verify `ADMIN_PASSWORD_HASH` is set in Vercel environment variables
2. Check that `ADMIN_JWT_SECRET` is set
3. Try regenerating the password hash
4. Clear browser cookies and try again

### No leads showing
1. Confirm Notion database IDs are correct in environment variables
2. Check Notion API token has access to all databases
3. Verify database properties match the expected schema (Name, Email, Status, etc.)

### Stats not updating
1. Refresh the page manually
2. Check browser console for API errors
3. Verify authentication session hasn't expired

## Security Best Practices

1. **Strong Password** - Use at least 16 characters with mixed case, numbers, symbols
2. **Unique Password** - Don't reuse passwords from other services
3. **Regular Updates** - Change password every 90 days
4. **Access Control** - Only share credentials with trusted team members
5. **Monitor Activity** - Check dashboard regularly for suspicious activity

## Future Enhancements

Consider adding:
- Two-factor authentication (2FA)
- User activity logs
- Email notifications for hot leads
- Custom reports and exports
- Role-based access control for teams

## Support

For issues or feature requests, consult the Claude Code documentation or create an issue in your repository.

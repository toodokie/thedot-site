# Vercel Environment Variables Configuration

This guide helps you configure the environment variables in Vercel for The Dot Creative website.

## Required Environment Variables

Add these environment variables in your Vercel project settings:

### Notion API Tokens

1. **NOTION_TOKEN_PORTFOLIO**
   - Used for: Portfolio/projects display functionality
   - Required for: Displaying your work on the website
   - How to get: Create an integration at https://www.notion.so/my-integrations
   - Permissions needed: Read access to portfolio database

2. **NOTION_TOKEN**
   - Used for: Calculator leads, project briefs, contact forms
   - Required for: Lead capture and form submissions
   - How to get: Create an integration at https://www.notion.so/my-integrations
   - Permissions needed: Create/write access to lead databases

### Notion Database IDs

3. **NOTION_PORTFOLIO_DB_ID**
   - Used for: Fetching portfolio projects
   - Example format: `224d0f0c2544806aba32c82f0d08f463`

4. **NOTION_CALCULATOR_LEADS_DB_ID**
   - Used for: Storing price calculator submissions
   - Example format: `221d0f0c-2544-8005-bd9a-ef957fc49934`

5. **NOTION_PROJECT_BRIEFS_DB_ID**
   - Used for: Storing detailed project briefs
   - Example format: `222d0f0c-2544-80ba-a242-e90a77077057`

6. **NOTION_CONTACT_FORM_DB_ID** (Optional)
   - Used for: Storing contact form submissions
   - Example format: `221d0f0c254480dcbbc1eb8d67bc53e8`

### Email Configuration

7. **GMAIL_USER**
   - Your Gmail address for sending emails
   - Example: `info@thedotcreative.co`

8. **GMAIL_APP_PASSWORD**
   - Gmail app-specific password (not your regular password)
   - How to get: https://support.google.com/accounts/answer/185833

### Analytics

9. **NEXT_PUBLIC_GA_MEASUREMENT_ID**
   - Google Analytics 4 Measurement ID
   - Format: `G-XXXXXXXXXX`
   - How to get: Create a property in Google Analytics 4
   - Required for: Tracking website traffic and user behavior

## Setup Steps in Vercel

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable with its corresponding value
4. Ensure variables are added for Production environment
5. Redeploy your project after adding all variables

## Testing Your Configuration

After setting up, test each integration:

1. **Portfolio**: Visit your portfolio page to ensure projects load
2. **Calculator**: Submit a test calculation to verify lead capture
3. **Contact Form**: Send a test message if using contact form
4. **Email**: Verify email notifications are received

## Troubleshooting

- If portfolio doesn't load: Check NOTION_TOKEN_PORTFOLIO and NOTION_PORTFOLIO_DB_ID
- If forms don't submit: Check NOTION_TOKEN and respective database IDs
- If emails don't send: Verify Gmail credentials and app password
- Check Vercel function logs for detailed error messages

## Security Notes

- Never commit these values to your repository
- Use different tokens for different purposes (portfolio vs leads)
- Regularly rotate your API tokens
- Limit token permissions to minimum required access
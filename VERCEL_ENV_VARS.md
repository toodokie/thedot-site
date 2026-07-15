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

7. **SMTP_HOST**
   - SMTP server hostname
   - For Gmail: `smtp.gmail.com`
   - For other providers: Check your email provider's SMTP settings

8. **SMTP_PORT**
   - SMTP server port
   - For Gmail: `587` (TLS) or `465` (SSL)
   - Default: `587`

9. **SMTP_USER**
   - Your email address for SMTP authentication
   - Example: `info@thedotcreative.co`

10. **SMTP_PASS**
    - SMTP password or app-specific password
    - For Gmail: App-specific password (not your regular password)
    - How to get Gmail app password: https://support.google.com/accounts/answer/185833
    - Value REMOVED (it was committed and is now burned). Rotate the Gmail app password and set the new one only in Vercel env, never in this file.

11. **FROM_EMAIL**
    - Email address that appears in the "From" field
    - Example: `info@thedotcreative.co`
    - Should match SMTP_USER for most providers

12. **AGENCY_EMAIL**
    - Internal email address to receive notifications
    - Example: `hello@thedotcreative.co`
    - This is where you'll receive contact form submissions, leads, etc.

### Analytics

13. **NEXT_PUBLIC_GA_MEASUREMENT_ID**
   - Google Analytics 4 Measurement ID
   - Format: `G-XXXXXXXXXX`
   - How to get: Create a property in Google Analytics 4
   - Required for: Tracking website traffic and user behavior

### Google Analytics Data API (Admin Dashboard)

14. **GA_PROPERTY_ID**
   - Google Analytics 4 Property ID
   - Format: `123456789` (numeric ID without "properties/" prefix)
   - How to get:
     - Go to Google Analytics → Admin → Property Settings
     - Find the Property ID number
   - Required for: Displaying traffic metrics in admin dashboard

15. **GA_SERVICE_ACCOUNT_CREDENTIALS**
   - Google Cloud Service Account credentials JSON
   - Format: Single-line JSON string (see setup instructions below)
   - How to get:
     1. Go to Google Cloud Console (https://console.cloud.google.com)
     2. Create a new project or select existing project
     3. Enable Google Analytics Data API
     4. Create a Service Account:
        - Navigate to IAM & Admin → Service Accounts
        - Click "Create Service Account"
        - Give it a name (e.g., "analytics-dashboard")
        - Click "Create and Continue"
        - Skip role assignment, click "Continue"
        - Click "Done"
     5. Create JSON key:
        - Click on the service account you created
        - Go to "Keys" tab
        - Click "Add Key" → "Create new key"
        - Select JSON format
        - Download the JSON file
     6. Grant Analytics access:
        - Go to Google Analytics → Admin
        - Click "Property Access Management"
        - Click "Add users"
        - Add the service account email (looks like: name@project-id.iam.gserviceaccount.com)
        - Select "Viewer" role
        - Click "Add"
     7. Format for Vercel:
        - Open the downloaded JSON file
        - Remove all line breaks and spaces to create a single-line JSON string
        - Example: `{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}`
   - Required for: Fetching traffic metrics from Google Analytics for admin dashboard

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
5. **Google Analytics**: Log in to admin dashboard and verify "Website Traffic" section displays metrics

## Troubleshooting

### Portfolio Issues
- If portfolio doesn't load: Check NOTION_TOKEN_PORTFOLIO and NOTION_PORTFOLIO_DB_ID
- Verify the integration has read access to the portfolio database

### Form Submission Issues
- If forms don't submit: Check NOTION_TOKEN and respective database IDs
- Ensure NOTION_TOKEN has write access to lead databases
- Check that all required database IDs are correctly configured

### Email Issues
- **Not receiving emails?** Check these in order:
  1. Verify all 6 SMTP variables are set: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL, AGENCY_EMAIL
  2. For Gmail users: Make sure you're using an App Password, not your regular password
  3. Verify SMTP_HOST is correct (e.g., `smtp.gmail.com` for Gmail)
  4. Check SMTP_PORT is `587` for TLS or `465` for SSL
  5. Ensure FROM_EMAIL matches your SMTP_USER
  6. Check Vercel function logs for SMTP errors
  7. Test your SMTP credentials using a tool like https://www.smtper.net/

### Google Analytics Issues
- **No traffic data in dashboard?** Check these in order:
  1. Verify GA_PROPERTY_ID is correct (should be numeric ID only)
  2. Verify GA_SERVICE_ACCOUNT_CREDENTIALS is properly formatted (single-line JSON)
  3. Ensure the service account email has "Viewer" access in Google Analytics Property Access Management
  4. Check that Google Analytics Data API is enabled in Google Cloud Console
  5. Verify the service account JSON key is from the correct Google Cloud project
  6. Check Vercel function logs for API errors
  7. Test that the property ID has collected data (check Google Analytics directly)

### General Debugging
- Check Vercel function logs for detailed error messages
- Enable console logging to trace execution flow
- Verify all environment variables are set for the correct environment (Production/Preview/Development)

## Security Notes

- Never commit these values to your repository
- Use different tokens for different purposes (portfolio vs leads)
- Regularly rotate your API tokens
- Limit token permissions to minimum required access
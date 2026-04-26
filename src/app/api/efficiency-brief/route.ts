import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { sendEfficiencyBriefEmail, EfficiencyBriefData } from '@/lib/email';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { validateEmail, validateName, validateMessage, isBot } from '@/lib/input-sanitization';

const notionToken = process.env.NOTION_TOKEN || process.env.NOTION_EFFICIENCY_TOKEN;
const databaseId = process.env.NOTION_EFFICIENCY_BRIEF_DB_ID || '239d0f0c254480368e21f4e1379a3496';

export async function POST(request: NextRequest) {
  try {
    if (!notionToken) {
      console.error('Efficiency brief: NOTION_TOKEN env var not configured');
      return NextResponse.json(
        { success: false, error: 'Server is not configured to accept submissions. Please contact us directly.' },
        { status: 500 }
      );
    }

    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 3, window: 10 * 60 * 1000, key: 'efficiency-brief' });
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for efficiency brief, IP:', clientIP);
      return NextResponse.json(
        { success: false, error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();

    if (isBot(body.website)) {
      console.warn('Bot detected via honeypot for efficiency brief, IP:', clientIP);
      return NextResponse.json(
        { success: false, error: 'Invalid submission' },
        { status: 400 }
      );
    }

    const nameValidation = validateName(body.contactName);
    const emailValidation = validateEmail(body.contactEmail);
    const companyValidation = validateName(body.companyName);

    const errors: string[] = [
      ...nameValidation.errors,
      ...emailValidation.errors,
      ...companyValidation.errors,
    ];

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    const sanitizedName = nameValidation.sanitized;
    const sanitizedEmail = emailValidation.sanitized;
    const sanitizedCompany = companyValidation.sanitized;

    const notion = new Client({ auth: notionToken });

    const softwareAuditRaw = typeof body.softwareAudit === 'string' ? body.softwareAudit : '';
    const softwareList = softwareAuditRaw
      .split(',')
      .map((item: string) => item.trim())
      .filter((item: string) => {
        const lowerItem = item.toLowerCase();
        return lowerItem.includes('quickbooks') ||
               lowerItem.includes('hubspot') ||
               lowerItem.includes('mailchimp') ||
               lowerItem.includes('calendly');
      })
      .map((item: string) => {
        const lowerItem = item.toLowerCase();
        if (lowerItem.includes('quickbooks')) return 'QuickBooks';
        if (lowerItem.includes('hubspot')) return 'HubSpot';
        if (lowerItem.includes('mailchimp')) return 'Mailchimp';
        if (lowerItem.includes('calendly')) return 'Calendly';
        return null;
      })
      .filter((item: string | null) => item !== null)
      .map((name: string) => ({ name }));

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        'Company Name': {
          title: [
            {
              text: {
                content: sanitizedCompany || 'Untitled',
              },
            },
          ],
        },
        'Status': {
          select: {
            name: '📥 New Brief Received',
          },
        },
        'Contact Name': {
          rich_text: [
            {
              text: {
                content: sanitizedName,
              },
            },
          ],
        },
        'Contact Email': {
          email: sanitizedEmail,
        },
        'Submission Date': {
          date: {
            start: new Date().toISOString().split('T')[0],
          },
        },
        'Website URL': {
          url: body.websiteUrl || null,
        },
        'Industry': {
          select: {
            name: body.industry || 'Other',
          },
        },
        '#1 Website Goal': {
          select: {
            name: body.websiteGoal || 'Get More Leads/Clients',
          },
        },
        'Biggest Frustration': {
          rich_text: [
            {
              text: {
                content: typeof body.biggestFrustration === 'string' ? body.biggestFrustration.slice(0, 2000) : '',
              },
            },
          ],
        },
        'AODA Aware?': {
          select: {
            name: body.aodaAware || 'Unsure',
          },
        },
        'Software Stack': {
          multi_select: softwareList,
        },
        'System Connection Score': {
          number: parseInt(body.connectionScore) || 5,
        },
        'Lead Flow Process': {
          rich_text: [
            {
              text: {
                content: typeof body.leadFlow === 'string' ? body.leadFlow.slice(0, 2000) : '',
              },
            },
          ],
        },
        'Competitors': {
          rich_text: [
            {
              text: {
                content: typeof body.competitors === 'string' ? body.competitors.slice(0, 2000) : '',
              },
            },
          ],
        },
      },
    });

    await notion.blocks.children.append({
      block_id: response.id,
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: 'Additional Information' } }],
          },
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: 'Services/Products' } }],
          },
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: typeof body.servicesProducts === 'string' ? body.servicesProducts.slice(0, 2000) : '' } }],
          },
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: 'Full Software Audit' } }],
          },
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: softwareAuditRaw.slice(0, 2000) } }],
          },
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: 'Role' } }],
          },
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: typeof body.role === 'string' ? body.role.slice(0, 500) : '' } }],
          },
        },
      ],
    });

    let emailSent = false;
    try {
      const emailData: EfficiencyBriefData = {
        companyName: sanitizedCompany || 'Untitled',
        contactName: sanitizedName,
        contactEmail: sanitizedEmail,
        role: body.role || '',
        websiteUrl: body.websiteUrl || undefined,
        industry: body.industry || 'Other',
        servicesProducts: body.servicesProducts || '',
        websiteGoal: body.websiteGoal || 'Get More Leads/Clients',
        biggestFrustration: body.biggestFrustration || '',
        aodaAware: body.aodaAware || 'Unsure',
        softwareAudit: softwareAuditRaw,
        connectionScore: parseInt(body.connectionScore) || 5,
        leadFlow: body.leadFlow || '',
        competitors: body.competitors || '',
      };

      await sendEfficiencyBriefEmail(emailData);
      emailSent = true;
      console.log('Efficiency brief email notification sent successfully');
    } catch (emailError) {
      console.error('Failed to send efficiency brief email notification:', emailError);
      // Notion save succeeded — submission is preserved. Email is recoverable from dashboard.
    }

    return NextResponse.json({ success: true, pageId: response.id, emailSent });
  } catch (error) {
    console.error('Error creating efficiency brief Notion page:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit brief' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { sendEfficiencyBriefEmail, EfficiencyBriefData } from '@/lib/email';

const notion = new Client({
  auth: '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',
});

const databaseId = '239d0f0c254480368e21f4e1379a3496';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Parse software list into multi-select options
    const softwareList = body.softwareAudit
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
                content: body.companyName || 'Untitled',
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
                content: body.contactName || '',
              },
            },
          ],
        },
        'Contact Email': {
          email: body.contactEmail || '',
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
                content: body.biggestFrustration || '',
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
                content: body.leadFlow || '',
              },
            },
          ],
        },
        'Competitors': {
          rich_text: [
            {
              text: {
                content: body.competitors || '',
              },
            },
          ],
        },
      },
    });

    // Also store the full software audit text and services/products in the page content
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
            rich_text: [{ type: 'text', text: { content: body.servicesProducts || '' } }],
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
            rich_text: [{ type: 'text', text: { content: body.softwareAudit || '' } }],
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
            rich_text: [{ type: 'text', text: { content: body.role || '' } }],
          },
        },
      ],
    });

    // Send email notification to agency
    try {
      const emailData: EfficiencyBriefData = {
        companyName: body.companyName || 'Untitled',
        contactName: body.contactName || '',
        contactEmail: body.contactEmail || '',
        role: body.role || '',
        websiteUrl: body.websiteUrl || undefined,
        industry: body.industry || 'Other',
        servicesProducts: body.servicesProducts || '',
        websiteGoal: body.websiteGoal || 'Get More Leads/Clients',
        biggestFrustration: body.biggestFrustration || '',
        aodaAware: body.aodaAware || 'Unsure',
        softwareAudit: body.softwareAudit || '',
        connectionScore: parseInt(body.connectionScore) || 5,
        leadFlow: body.leadFlow || '',
        competitors: body.competitors || '',
      };

      await sendEfficiencyBriefEmail(emailData);
      console.log('Email notification sent successfully');
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({ success: true, pageId: response.id });
  } catch (error) {
    console.error('Error creating Notion page:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit brief' },
      { status: 500 }
    );
  }
}
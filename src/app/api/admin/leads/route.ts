import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export async function GET() {
  // Verify authentication
  const session = await verifySession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const leads = [];

    // Fetch from Calculator Leads database
    if (process.env.NOTION_CALCULATOR_LEADS_DB_ID) {
      try {
        const calcResponse = await notion.databases.query({
          database_id: process.env.NOTION_CALCULATOR_LEADS_DB_ID,
          sorts: [
            {
              property: 'Date Created',
              direction: 'descending',
            },
          ],
          page_size: 20,
        });

        for (const page of calcResponse.results) {
          const props = page.properties;
          leads.push({
            id: page.id,
            source: 'Calculator',
            name: props['Name']?.title?.[0]?.plain_text || '',
            email: props['Email']?.email || '',
            company: props['Company']?.rich_text?.[0]?.plain_text || '',
            serviceType: props['Service Type']?.select?.name || '',
            temperature: props['Temperature']?.select?.name || '',
            estimateAmount: props['Estimate Amount']?.number || 0,
            date: props['Date Created']?.date?.start || '',
            status: props['Status']?.select?.name || '',
          });
        }
      } catch (error) {
        console.error('Error fetching calculator leads:', error);
      }
    }

    // Fetch from Contact Form database
    if (process.env.NOTION_CONTACT_FORM_DB_ID) {
      try {
        const contactResponse = await notion.databases.query({
          database_id: process.env.NOTION_CONTACT_FORM_DB_ID,
          sorts: [
            {
              property: 'Date Submitted',
              direction: 'descending',
            },
          ],
          page_size: 20,
        });

        for (const page of contactResponse.results) {
          const props = page.properties;
          leads.push({
            id: page.id,
            source: 'Contact Form',
            name: props['Name']?.title?.[0]?.plain_text || '',
            email: props['Email']?.email || '',
            message: props['Message']?.rich_text?.[0]?.plain_text?.substring(0, 100) || '',
            date: props['Date Submitted']?.date?.start || '',
            status: props['Status']?.select?.name || '',
          });
        }
      } catch (error) {
        console.error('Error fetching contact form leads:', error);
      }
    }

    // Fetch from Project Briefs database
    if (process.env.NOTION_PROJECT_BRIEFS_DB_ID) {
      try {
        const briefResponse = await notion.databases.query({
          database_id: process.env.NOTION_PROJECT_BRIEFS_DB_ID,
          sorts: [
            {
              property: 'Date Submitted',
              direction: 'descending',
            },
          ],
          page_size: 20,
        });

        for (const page of briefResponse.results) {
          const props = page.properties;
          leads.push({
            id: page.id,
            source: props['Source']?.select?.name || 'Brief',
            name: props['Client Name']?.title?.[0]?.plain_text || '',
            email: props['Email']?.email || '',
            company: props['Company']?.rich_text?.[0]?.plain_text || '',
            briefType: props['Brief Type']?.select?.name || '',
            leadScore: props['Lead Score']?.select?.name || '',
            budgetRange: props['Budget Range']?.select?.name || '',
            timeline: props['Timeline']?.select?.name || '',
            date: props['Date Submitted']?.date?.start || '',
          });
        }
      } catch (error) {
        console.error('Error fetching project briefs:', error);
      }
    }

    // Sort all leads by date
    leads.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      success: true,
      leads: leads.slice(0, 50), // Return max 50 most recent
      total: leads.length,
    });

  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    );
  }
}

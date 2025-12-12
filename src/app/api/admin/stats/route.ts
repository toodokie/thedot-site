import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { Client } from '@notionhq/client';
import { getSecurityStats } from '@/lib/security-stats';

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
    const stats = {
      leads: {
        total: 0,
        new: 0,
        hot: 0,
        warm: 0,
        cold: 0,
      },
      contacts: {
        total: 0,
        new: 0,
      },
      briefs: {
        total: 0,
        priorityHot: 0,
        hot: 0,
        warm: 0,
      },
      security: {
        ...getSecurityStats(),
        lastReset: getSecurityStats().lastReset.toISOString(),
      },
      revenue: {
        potential: 0,
        estimatedTotal: 0,
      },
    };

    // Fetch Calculator Leads stats
    if (process.env.NOTION_CALCULATOR_LEADS_DB_ID) {
      try {
        const calcResponse = await notion.databases.query({
          database_id: process.env.NOTION_CALCULATOR_LEADS_DB_ID,
        });

        stats.leads.total = calcResponse.results.length;

        for (const page of calcResponse.results) {
          const props = page.properties;
          const status = props['Status']?.select?.name || '';
          const temperature = props['Temperature']?.select?.name || '';
          const estimate = props['Estimate Amount']?.number || 0;

          if (status === 'New') stats.leads.new++;

          if (temperature === 'Hot') stats.leads.hot++;
          else if (temperature === 'Warm') stats.leads.warm++;
          else if (temperature === 'Cold') stats.leads.cold++;

          stats.revenue.estimatedTotal += estimate;
        }
      } catch (error) {
        console.error('Error fetching calculator stats:', error);
      }
    }

    // Fetch Contact Form stats
    if (process.env.NOTION_CONTACT_FORM_DB_ID) {
      try {
        const contactResponse = await notion.databases.query({
          database_id: process.env.NOTION_CONTACT_FORM_DB_ID,
        });

        stats.contacts.total = contactResponse.results.length;

        for (const page of contactResponse.results) {
          const props = page.properties;
          const status = props['Status']?.select?.name || '';
          if (status === 'New') stats.contacts.new++;
        }
      } catch (error) {
        console.error('Error fetching contact stats:', error);
      }
    }

    // Fetch Project Briefs stats
    if (process.env.NOTION_PROJECT_BRIEFS_DB_ID) {
      try {
        const briefResponse = await notion.databases.query({
          database_id: process.env.NOTION_PROJECT_BRIEFS_DB_ID,
        });

        stats.briefs.total = briefResponse.results.length;

        for (const page of briefResponse.results) {
          const props = page.properties;
          const leadScore = props['Lead Score']?.select?.name || '';

          if (leadScore === 'Priority Hot') {
            stats.briefs.priorityHot++;
            stats.revenue.potential += 30000; // Estimate
          } else if (leadScore === 'Hot') {
            stats.briefs.hot++;
            stats.revenue.potential += 15000;
          } else if (leadScore === 'Warm') {
            stats.briefs.warm++;
            stats.revenue.potential += 5000;
          }
        }
      } catch (error) {
        console.error('Error fetching brief stats:', error);
      }
    }

    return NextResponse.json({
      success: true,
      stats,
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

// Note: Security stats are now tracked automatically in middleware and rate-limit library

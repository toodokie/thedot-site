import { NextResponse } from 'next/server';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { verifySession } from '@/lib/auth';

// Initialize the Analytics Data API client
let analyticsDataClient: BetaAnalyticsDataClient | null = null;

function getAnalyticsClient() {
  if (analyticsDataClient) {
    return analyticsDataClient;
  }

  const credentials = process.env.GA_SERVICE_ACCOUNT_CREDENTIALS;

  if (!credentials) {
    throw new Error('GA_SERVICE_ACCOUNT_CREDENTIALS not configured');
  }

  try {
    const parsedCredentials = JSON.parse(credentials);
    analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: parsedCredentials,
    });
    return analyticsDataClient;
  } catch (error) {
    throw new Error('Invalid GA_SERVICE_ACCOUNT_CREDENTIALS format');
  }
}

export async function GET() {
  try {
    // Verify admin session
    const session = await verifySession();
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const propertyId = process.env.GA_PROPERTY_ID;

    if (!propertyId) {
      return NextResponse.json(
        { error: 'GA_PROPERTY_ID not configured' },
        { status: 500 }
      );
    }

    const client = getAnalyticsClient();

    // Get date range (last 7 days for detailed analysis, last 30 days for overview)
    const endDate = new Date();
    const startDate7Days = new Date();
    startDate7Days.setDate(startDate7Days.getDate() - 7);
    const startDate30Days = new Date();
    startDate30Days.setDate(startDate30Days.getDate() - 30);

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Fetch all analytics data in parallel
    const [
      overviewResponse,
      pageEngagementResponse,
      demographicsAgeResponse,
      demographicsGenderResponse,
      demographicsLocationResponse,
      eventsResponse,
      conversionResponse,
      trafficSourcesResponse,
    ] = await Promise.all([
      // Overview metrics (30 days)
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: formatDate(startDate30Days),
            endDate: formatDate(endDate),
          },
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      }),

      // Page engagement (7 days) - views, users, and avg time on page
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: formatDate(startDate7Days),
            endDate: formatDate(endDate),
          },
        ],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
          { name: 'userEngagementDuration' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [
          {
            metric: { metricName: 'screenPageViews' },
            desc: true,
          },
        ],
        limit: 20,
      }),

      // Demographics - Age (7 days)
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: formatDate(startDate7Days),
            endDate: formatDate(endDate),
          },
        ],
        dimensions: [{ name: 'userAgeBracket' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [
          {
            metric: { metricName: 'activeUsers' },
            desc: true,
          },
        ],
      }),

      // Demographics - Gender (7 days)
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: formatDate(startDate7Days),
            endDate: formatDate(endDate),
          },
        ],
        dimensions: [{ name: 'userGender' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [
          {
            metric: { metricName: 'activeUsers' },
            desc: true,
          },
        ],
      }),

      // Demographics - Location (7 days)
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: formatDate(startDate7Days),
            endDate: formatDate(endDate),
          },
        ],
        dimensions: [{ name: 'country' }, { name: 'city' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [
          {
            metric: { metricName: 'activeUsers' },
            desc: true,
          },
        ],
        limit: 10,
      }),

      // Event tracking - buttons and form interactions (7 days)
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: formatDate(startDate7Days),
            endDate: formatDate(endDate),
          },
        ],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'eventCountPerUser' }],
        orderBys: [
          {
            metric: { metricName: 'eventCount' },
            desc: true,
          },
        ],
        limit: 20,
      }),

      // Conversion tracking - form events (7 days)
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: formatDate(startDate7Days),
            endDate: formatDate(endDate),
          },
        ],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              {
                filter: {
                  fieldName: 'eventName',
                  inListFilter: {
                    values: [
                      'calculator_start',
                      'calculator_complete',
                      'contact_form_submit',
                      'brief_submission',
                      'cta_click',
                      'generate_lead',
                    ],
                  },
                },
              },
            ],
          },
        },
      }),

      // Traffic sources (7 days)
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: formatDate(startDate7Days),
            endDate: formatDate(endDate),
          },
        ],
        dimensions: [{ name: 'sessionSource' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [
          {
            metric: { metricName: 'sessions' },
            desc: true,
          },
        ],
        limit: 10,
      }),
    ]);

    // Parse overview metrics (30 days)
    const overviewMetrics = overviewResponse.rows?.[0]?.metricValues || [];
    const overview = {
      sessions: parseInt(overviewMetrics[0]?.value || '0'),
      users: parseInt(overviewMetrics[1]?.value || '0'),
      pageViews: parseInt(overviewMetrics[2]?.value || '0'),
      bounceRate: parseFloat(overviewMetrics[3]?.value || '0'),
      avgSessionDuration: parseFloat(overviewMetrics[4]?.value || '0'),
    };

    // Parse page engagement (7 days) with time on page
    const pageEngagement = (pageEngagementResponse.rows || []).map((row) => {
      const views = parseInt(row.metricValues?.[0]?.value || '0');
      const users = parseInt(row.metricValues?.[1]?.value || '0');
      const totalEngagementTime = parseFloat(row.metricValues?.[2]?.value || '0');
      const avgTimeOnPage = views > 0 ? totalEngagementTime / views : 0;

      return {
        path: row.dimensionValues?.[0]?.value || '',
        title: row.dimensionValues?.[1]?.value || '',
        views,
        users,
        avgTimeOnPage: Math.round(avgTimeOnPage), // in seconds
      };
    });

    // Parse demographics - Age
    const demographicsAge = (demographicsAgeResponse.rows || [])
      .filter((row) => row.dimensionValues?.[0]?.value !== 'unknown')
      .map((row) => ({
        ageBracket: row.dimensionValues?.[0]?.value || '',
        users: parseInt(row.metricValues?.[0]?.value || '0'),
      }));

    // Parse demographics - Gender
    const demographicsGender = (demographicsGenderResponse.rows || [])
      .filter((row) => row.dimensionValues?.[0]?.value !== 'unknown')
      .map((row) => ({
        gender: row.dimensionValues?.[0]?.value || '',
        users: parseInt(row.metricValues?.[0]?.value || '0'),
      }));

    // Parse demographics - Location
    const demographicsLocation = (demographicsLocationResponse.rows || []).map((row) => ({
      country: row.dimensionValues?.[0]?.value || '',
      city: row.dimensionValues?.[1]?.value || '',
      users: parseInt(row.metricValues?.[0]?.value || '0'),
    }));

    // Parse all events
    const events = (eventsResponse.rows || []).map((row) => ({
      eventName: row.dimensionValues?.[0]?.value || '',
      count: parseInt(row.metricValues?.[0]?.value || '0'),
      countPerUser: parseFloat(row.metricValues?.[1]?.value || '0'),
    }));

    // Parse conversion events
    const conversions = (conversionResponse.rows || []).map((row) => ({
      eventName: row.dimensionValues?.[0]?.value || '',
      count: parseInt(row.metricValues?.[0]?.value || '0'),
    }));

    // Calculate conversion funnel
    const calculatorStarted = conversions.find((c) => c.eventName === 'calculator_start')?.count || 0;
    const calculatorCompleted = conversions.find((c) => c.eventName === 'calculator_complete')?.count || 0;
    const contactFormSubmitted = conversions.find((c) => c.eventName === 'contact_form_submit')?.count || 0;
    const briefSubmitted = conversions.find((c) => c.eventName === 'brief_submission')?.count || 0;
    const ctaClicks = conversions.find((c) => c.eventName === 'cta_click')?.count || 0;
    const leadsGenerated = conversions.find((c) => c.eventName === 'generate_lead')?.count || 0;

    const conversionFunnel = {
      calculatorStarted,
      calculatorCompleted,
      calculatorConversionRate: calculatorStarted > 0
        ? ((calculatorCompleted / calculatorStarted) * 100).toFixed(1)
        : '0',
      contactFormSubmitted,
      briefSubmitted,
      ctaClicks,
      leadsGenerated,
      totalConversions: calculatorCompleted + contactFormSubmitted + briefSubmitted,
    };

    // Parse traffic sources
    const trafficSources = (trafficSourcesResponse.rows || []).map((row) => ({
      source: row.dimensionValues?.[0]?.value || '',
      sessions: parseInt(row.metricValues?.[0]?.value || '0'),
    }));

    return NextResponse.json({
      overview,
      pageEngagement,
      demographics: {
        age: demographicsAge,
        gender: demographicsGender,
        location: demographicsLocation,
      },
      events,
      conversionFunnel,
      trafficSources,
      period: {
        last7Days: {
          start: formatDate(startDate7Days),
          end: formatDate(endDate),
        },
        last30Days: {
          start: formatDate(startDate30Days),
          end: formatDate(endDate),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

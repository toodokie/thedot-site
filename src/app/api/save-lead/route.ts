import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN || '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',
});

// Database ID for Calculator Leads (you'll need to create this in Notion)
const CALCULATOR_LEADS_DATABASE_ID = process.env.NOTION_CALCULATOR_LEADS_DB_ID || '';

// Lead scoring function
function getLeadScore(action: string): { score: number; temperature: string } {
  switch (action) {
    case 'pdf':
      return { score: 1, temperature: 'Cold' };
    case 'email':
      return { score: 3, temperature: 'Warm' };
    case 'discuss':
      return { score: 5, temperature: 'Hot' };
    default:
      return { score: 0, temperature: 'Unknown' };
  }
}

// Service type mapping
function getServiceTypeDisplay(formType: string): string {
  switch (formType) {
    case 'website':
      return 'Website Development';
    case 'design':
      return 'Graphic Design';
    case 'photo':
      return 'Photo & Video Production';
    default:
      return 'Unknown Service';
  }
}

// Extract selections summary
function getSelectionsSummary(selections: Selections, formType: string): string {
  if (!selections) return 'No selections recorded';

  try {
    if (formType === 'website') {
      const parts = [];
      if (selections.websiteType) parts.push(`Type: ${selections.websiteType}`);
      if (selections.timeline) parts.push(`Timeline: ${selections.timeline}`);
      if (selections.features?.length) parts.push(`Features: ${selections.features.join(', ')}`);
      return parts.join(' | ');
    } else if (formType === 'design') {
      const parts = [];
      if (selections.services?.length) parts.push(`Services: ${selections.services.join(', ')}`);
      if (selections.timeline) parts.push(`Timeline: ${selections.timeline}`);
      return parts.join(' | ');
    } else if (formType === 'photo') {
      const parts = [];
      if (selections.service) parts.push(`Service: ${selections.service}`);
      if (selections.timeline) parts.push(`Timeline: ${selections.timeline}`);
      if (selections.additional?.length) parts.push(`Add-ons: ${selections.additional.join(', ')}`);
      return parts.join(' | ');
    }
    
    return JSON.stringify(selections);
  } catch {
    return 'Error parsing selections';
  }
}

export async function POST(request: NextRequest) {
  try {
    const { estimateData, leadData } = await request.json();
    
    if (!CALCULATOR_LEADS_DATABASE_ID) {
      console.warn('Notion database ID not configured');
      return NextResponse.json({ 
        success: true, 
        warning: 'Lead saved locally but not synced to Notion (database ID missing)' 
      });
    }

    const leadScore = getLeadScore(leadData.action);
    const serviceType = getServiceTypeDisplay(estimateData.formType);
    const selectionsSummary = getSelectionsSummary(estimateData.selections, estimateData.formType);

    // Create Notion page
    const response = await notion.pages.create({
      parent: {
        database_id: CALCULATOR_LEADS_DATABASE_ID,
      },
      properties: {
        // Name (Title)
        'Name': {
          title: [
            {
              text: {
                content: leadData.name,
              },
            },
          ],
        },
        
        // Email
        'Email': {
          email: leadData.email,
        },
        
        // Company
        'Company': {
          rich_text: [
            {
              text: {
                content: leadData.company || '',
              },
            },
          ],
        },
        
        // Phone
        'Phone': {
          phone_number: leadData.phone || null,
        },
        
        // Service Type
        'Service Type': {
          select: {
            name: serviceType,
          },
        },
        
        // Action Taken
        'Action': {
          select: {
            name: leadData.action.charAt(0).toUpperCase() + leadData.action.slice(1),
          },
        },
        
        // Lead Score
        'Lead Score': {
          number: leadScore.score,
        },
        
        // Temperature
        'Temperature': {
          select: {
            name: leadScore.temperature,
          },
        },
        
        // Estimate Amount
        'Estimate Amount': {
          number: estimateData.total || 0,
        },
        
        // Date Created
        'Date Created': {
          date: {
            start: new Date(leadData.timestamp).toISOString(),
          },
        },
        
        // Status
        'Status': {
          select: {
            name: 'New',
          },
        },
        
        // Project Selections
        'Project Selections': {
          rich_text: [
            {
              text: {
                content: selectionsSummary,
              },
            },
          ],
        },
        
        // Message
        'Message': {
          rich_text: [
            {
              text: {
                content: leadData.message || '',
              },
            },
          ],
        },
        
        // Source
        'Source': {
          select: {
            name: 'Calculator',
          },
        },
      },
    });

    // Log successful save
    console.log('Lead saved to Notion:', {
      pageId: response.id,
      name: leadData.name,
      action: leadData.action,
      score: leadScore.score,
      temperature: leadScore.temperature,
      estimateAmount: estimateData.total,
    });

    return NextResponse.json({ 
      success: true, 
      notionPageId: response.id,
      leadScore: leadScore.score,
      temperature: leadScore.temperature 
    });

  } catch (error) {
    console.error('Notion save error:', error);
    
    // Still return success for now so the user experience isn't affected
    // Log the error for monitoring
    return NextResponse.json({ 
      success: true, 
      warning: 'Lead processed but Notion sync failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Helper function to create the Notion database structure
// This would be run once to set up the database
export async function GET() {
  try {
    const databaseProperties = {
      'Name': { title: {} },
      'Email': { email: {} },
      'Company': { rich_text: {} },
      'Phone': { phone_number: {} },
      'Service Type': {
        select: {
          options: [
            { name: 'Website Development', color: 'blue' },
            { name: 'Graphic Design', color: 'green' },
            { name: 'Photo & Video Production', color: 'red' },
          ],
        },
      },
      'Action': {
        select: {
          options: [
            { name: 'Pdf', color: 'gray' },
            { name: 'Email', color: 'orange' },
            { name: 'Discuss', color: 'red' },
          ],
        },
      },
      'Lead Score': { number: {} },
      'Temperature': {
        select: {
          options: [
            { name: 'Cold', color: 'blue' },
            { name: 'Warm', color: 'orange' },
            { name: 'Hot', color: 'red' },
          ],
        },
      },
      'Estimate Amount': { number: { format: 'canadian_dollar' } },
      'Date Created': { date: {} },
      'Status': {
        select: {
          options: [
            { name: 'New', color: 'yellow' },
            { name: 'Contacted', color: 'orange' },
            { name: 'Qualified', color: 'blue' },
            { name: 'Proposal Sent', color: 'purple' },
            { name: 'Won', color: 'green' },
            { name: 'Lost', color: 'red' },
          ],
        },
      },
      'Project Selections': { rich_text: {} },
      'Message': { rich_text: {} },
      'Source': {
        select: {
          options: [
            { name: 'Calculator', color: 'green' },
            { name: 'Contact Form', color: 'blue' },
            { name: 'Direct Inquiry', color: 'orange' },
          ],
        },
      },
    };

    return NextResponse.json({
      message: 'Database structure for Calculator Leads',
      properties: databaseProperties,
      instructions: 'Use this structure to create your Notion database, then add the database ID to your environment variables.',
    });

  } catch {
    return NextResponse.json(
      { error: 'Failed to get database structure' },
      { status: 500 }
    );
  }
}
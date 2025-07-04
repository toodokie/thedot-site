import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { rateLimit, getClientIP } from '../../../lib/rate-limit';
import { validateEmail, validateName, isBot } from '../../../lib/input-sanitization';

// Initialize Notion client (optional)
const notion = process.env.NOTION_CALCULATOR_TOKEN ? new Client({
  auth: process.env.NOTION_CALCULATOR_TOKEN,
}) : null;

// Calculator Leads Database ID
const CALCULATOR_LEADS_DATABASE_ID = process.env.NOTION_CALCULATOR_LEADS_DB_ID || '';

// Lead scoring function for calculator actions
function getLeadScore(action: string): { score: number; temperature: string } {
  switch (action) {
    case 'pdf_download':
      return { score: 1, temperature: 'Cold' };
    case 'email_sent':
      return { score: 3, temperature: 'Warm' };
    case 'contact_request':
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

interface Selections {
  pageCount?: string;
  websiteType?: string;
  timeline?: string;
  features?: string[];
  services?: string[];
  service?: string;
  additional?: string[];
}

// Extract page count for websites or item count for other services
function getPageCount(selections: Selections, formType: string): number {
  if (!selections) return 0;
  
  if (formType === 'website' && selections.pageCount) {
    // Extract number from page count string like "1-3 pages" or "4-6 pages"
    const match = selections.pageCount.match(/(\d+)(-\d+)?/);
    if (match) {
      // Return the first number (minimum pages)
      return parseInt(match[1], 10);
    }
  }
  
  return 0;
}

// Extract selections summary
function getSelectionsSummary(selections: Selections, formType: string): string {
  if (!selections) return 'No selections recorded';

  try {
    if (formType === 'website') {
      const parts = [];
      if (selections.websiteType) parts.push(`Type: ${selections.websiteType}`);
      if (selections.pageCount) parts.push(`Pages: ${selections.pageCount}`);
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
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = rateLimit(clientIP, { limit: 5, window: 10 * 60 * 1000 }); // 5 requests per 10 minutes
    
    if (!rateLimitResult.success) {
      console.warn('Rate limit exceeded for calculator lead save, IP:', clientIP);
      return NextResponse.json(
        { 
          success: false,
          error: 'Too many submissions. Please try again later.',
          resetTime: rateLimitResult.resetTime 
        },
        { status: 429 }
      );
    }

    console.log('Calculator lead save API called');
    const { estimateData, leadData, website } = await request.json();
    console.log('Lead data:', { name: leadData.name, action: leadData.action, total: estimateData.total });

    // Check honeypot field (bot detection)
    if (isBot(website)) {
      console.warn('Bot detected via honeypot field for calculator lead, IP:', clientIP);
      return NextResponse.json(
        { success: false, error: 'Invalid submission' },
        { status: 400 }
      );
    }

    // Validate and sanitize lead data
    const nameValidation = validateName(leadData.name);
    const emailValidation = validateEmail(leadData.email);

    const errors: string[] = [
      ...nameValidation.errors,
      ...emailValidation.errors
    ];

    if (errors.length > 0) {
      console.error('Calculator lead validation errors:', errors);
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    // Use sanitized values
    const sanitizedName = nameValidation.sanitized;
    const sanitizedEmail = emailValidation.sanitized;
    
    if (!CALCULATOR_LEADS_DATABASE_ID) {
      console.warn('Calculator Leads database ID not configured');
      return NextResponse.json({ 
        success: false, 
        error: 'Database configuration missing' 
      }, { status: 500 });
    }
    

    const leadScore = getLeadScore(leadData.action);
    const serviceType = getServiceTypeDisplay(estimateData.formType);
    const selectionsSummary = getSelectionsSummary(estimateData.selections, estimateData.formType);

    // Create Notion page in Calculator Leads database (if configured)
    if (notion && CALCULATOR_LEADS_DATABASE_ID) {
      const response = await notion.pages.create({
      parent: {
        database_id: CALCULATOR_LEADS_DATABASE_ID,
      },
      properties: {
        // Client Name (Title)
        'Client Name': {
          title: [
            {
              text: {
                content: sanitizedName,
              },
            },
          ],
        },
        
        // Email
        'Email': {
          email: sanitizedEmail,
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
        
        // Project Type
        'Project Type': {
          select: {
            name: serviceType,
          },
        },
        
        // Action Taken
        'Action Taken': {
          select: {
            name: leadData.action === 'pdf_download' ? 'PDF Download' :
                  leadData.action === 'email_sent' ? 'Email Request' : 'Contact Request',
          },
        },
        
        // Lead Score
        'Lead Score': {
          select: {
            name: leadScore.temperature, // This should be "Hot", "Warm", or "Cold"
          },
        },
        
        // Estimate Amount
        'Estimate Amount': {
          number: estimateData.total || 0,
        },
        
        // Date Submitted
        'Date Submitted': {
          date: {
            start: new Date(leadData.timestamp || Date.now()).toISOString(),
          },
        },
        
        // Status
        'Status': {
          select: {
            name: 'New',
          },
        },
        
        // Selected Features
        'Selected Features': {
          rich_text: [
            {
              text: {
                content: selectionsSummary,
              },
            },
          ],
        },
        
        // Timeline
        'Timeline': {
          rich_text: [
            {
              text: {
                content: estimateData.selections?.timeline || '',
              },
            },
          ],
        },
        
        // Full Calculator Data
        'Full Calculator Data': {
          rich_text: [
            {
              text: {
                content: JSON.stringify({
                  leadData,
                  estimateData,
                  timestamp: new Date().toISOString()
                }, null, 2),
              },
            },
          ],
        },
      },
    });
    }

    // Send internal notification email for all calculator leads
    try {
      await fetch(new URL('/api/send-internal-notification', request.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'calculator_lead',
          leadData,
          estimateData,
          leadScore,
          notionPageId: response.id
        }),
      });
    } catch (emailError) {
      console.error('Failed to send internal notification:', emailError);
      // Don't fail the whole request if email fails
    }

    // Log successful save
    console.log('Calculator lead saved to Notion:', {
      pageId: response.id,
      name: sanitizedName,
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
    console.error('Calculator lead save error:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
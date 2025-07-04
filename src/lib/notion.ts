import { Client } from '@notionhq/client';
import { Project } from '@/types/project';

// Use Calculator token for brief-related operations
const notion = new Client({
  auth: process.env.NOTION_CALCULATOR_TOKEN,
});

// TypeScript interfaces for Notion API responses
export interface NotionRichText {
  plain_text: string;
  text?: {
    content: string;
  };
}

export interface NotionSelectOption {
  name: string;
}

export interface NotionFile {
  file?: {
    url: string;
  };
  external?: {
    url: string;
  };
}

export interface NotionPageProperties {
  [key: string]: {
    title?: NotionRichText[];
    rich_text?: NotionRichText[];
    multi_select?: NotionSelectOption[];
    files?: NotionFile[];
    url?: string;
  };
}

export interface NotionPage {
  id: string;
  properties: NotionPageProperties;
}

export interface NotionDatabaseResponse {
  results: NotionPage[];
}

export interface BriefFormData {
  [key: string]: string | boolean | undefined;
  'sphere-2'?: string;
  'sphere-3'?: string;
  'site-type'?: string;
  'pages-per-site-2'?: string;
  'current-website'?: string;
  'website-challenge'?: string;
  'success-metrics'?: string;
  'deadline-date-2'?: string;
  'deadline-date-photo'?: string;
  'project-budjet-2'?: string;
  'project-budjet-photo'?: string;
  'company-size'?: string;
  'decision-level'?: string;
  'project-urgency'?: string;
  'how-did-you-hear'?: string;
  'audience-2'?: string;
  'audience-3'?: string;
  'stand-out-2'?: string;
  'stand-out-3'?: string;
  'Services-Required'?: string;
  'Desired-Style'?: string;
  'Preferred-Colors'?: string;
  'brand-maturity'?: string;
  'usage-timeline'?: string;
  'internal-resources'?: string;
  'Audience-Message'?: string;
  'File-Formats'?: string;
  'Special-elements'?: string;
  'Call-to-Action'?: string;
  'photo-service-type'?: string;
  'project-purpose'?: string;
  'content-library'?: string;
  'distribution-channels'?: string;
  'production-scale'?: string;
  'shooting-location'?: string;
  'duration'?: string;
  'style-preferences'?: string;
  'video-resolution'?: string;
  'audio-requirements'?: string;
  'site-structure-2'?: string;
  'main-page-architecture-2'?: string;
  'other-pages-architecture-2'?: string;
  'overall-site-style-2'?: string;
  'built-in-elements-catalog'?: boolean;
  'built-in-elements-cart'?: boolean;
  'built-in-elements-cart-payments'?: boolean;
  'built-in-elements-crm'?: boolean;
  'built-in-elements-form'?: boolean;
  'competitors-2'?: string;
  'competitors-3'?: string;
}

export interface BriefData {
  formType: 'website' | 'graphic' | 'photo';
  name: string;
  email: string;
  company?: string;
  briefData: BriefFormData;
}

export interface LeadScore {
  budget: number;
  timeline: number;
  action: number;
  companySize: number;
  decisionLevel: number;
  urgency: number;
  total: number;
  level: 'Warm' | 'Hot' | 'Priority Hot';
}

export function calculateLeadScore(briefData: BriefFormData, formType: string, actionType?: string): LeadScore {
  let budgetScore = 0;
  let timelineScore = 0;
  let actionScore = 0;
  let companySizeScore = 0;
  let decisionLevelScore = 0;
  let urgencyScore = 0;

  // Budget scoring (1-4 points)
  const budgetField = formType === 'photo' ? 'project-budjet-photo' : 'project-budjet-2';
  const budget = briefData[budgetField]?.toLowerCase() || '';
  
  if (budget.includes('30') || budget.includes('50') || budget.includes('100')) {
    budgetScore = 4; // $30K+
  } else if (budget.includes('15') || budget.includes('20') || budget.includes('25')) {
    budgetScore = 3; // $15K-30K
  } else if (budget.includes('5') || budget.includes('10')) {
    budgetScore = 2; // $5K-15K
  } else {
    budgetScore = 1; // Under $5K or unspecified
  }

  // Timeline scoring (0-3 points) - Legacy field for backward compatibility
  const timelineField = formType === 'photo' ? 'deadline-date-photo' : 'deadline-date-2';
  const timeline = briefData[timelineField]?.toLowerCase() || '';
  
  if (timeline.includes('asap') || timeline.includes('urgent') || timeline.includes('immediately')) {
    timelineScore = 3;
  } else if (timeline.includes('month') && (timeline.includes('1') || timeline.includes('2') || timeline.includes('3'))) {
    timelineScore = 2;
  } else if (timeline.includes('month') && (timeline.includes('3') || timeline.includes('4') || timeline.includes('5') || timeline.includes('6'))) {
    timelineScore = 1;
  } else {
    timelineScore = 0; // Planning or unspecified
  }

  // Company Size scoring (0-3 points)
  const companySize = briefData['company-size']?.toLowerCase() || '';
  if (companySize.includes('50+') || companySize.includes('50 or more')) {
    companySizeScore = 3;
  } else if (companySize.includes('11-50')) {
    companySizeScore = 2;
  } else if (companySize.includes('2-10')) {
    companySizeScore = 1;
  } else {
    companySizeScore = 0; // Solo or unspecified
  }

  // Decision Level scoring (0-2 points)
  const decisionLevel = briefData['decision-level']?.toLowerCase() || '';
  if (decisionLevel.includes('make decisions') || decisionLevel.includes('decision maker')) {
    decisionLevelScore = 2;
  } else if (decisionLevel.includes('recommend')) {
    decisionLevelScore = 1;
  } else {
    decisionLevelScore = 0; // Team decision or unspecified
  }

  // Project Urgency scoring (0-3 points) - New field takes priority over timeline
  const urgency = briefData['project-urgency']?.toLowerCase() || '';
  if (urgency.includes('asap')) {
    urgencyScore = 3;
  } else if (urgency.includes('1-3 months')) {
    urgencyScore = 2;
  } else if (urgency.includes('3-6 months')) {
    urgencyScore = 1;
  } else {
    urgencyScore = 0; // Planning ahead or unspecified
  }

  // Use urgency score if available, otherwise fall back to timeline
  const finalUrgencyScore = urgency ? urgencyScore : timelineScore;

  // Action scoring (1-3 points)
  if (actionType === 'discussion_request') {
    actionScore = 3;
  } else if (actionType === 'email_sent') {
    actionScore = 2;
  } else {
    actionScore = 1; // PDF download
  }

  const total = budgetScore + finalUrgencyScore + actionScore + companySizeScore + decisionLevelScore;
  
  let level: 'Warm' | 'Hot' | 'Priority Hot';
  if (total >= 12) {
    level = 'Priority Hot';
  } else if (total >= 7) {
    level = 'Hot';
  } else {
    level = 'Warm';
  }

  return {
    budget: budgetScore,
    timeline: timelineScore,
    action: actionScore,
    companySize: companySizeScore,
    decisionLevel: decisionLevelScore,
    urgency: finalUrgencyScore,
    total,
    level
  };
}

export function getBudgetRange(briefData: BriefFormData, formType: string): string {
  const budgetField = formType === 'photo' ? 'project-budjet-photo' : 'project-budjet-2';
  const budget = briefData[budgetField]?.toLowerCase() || '';
  
  if (budget.includes('30') || budget.includes('50') || budget.includes('100')) {
    return '$30K+';
  } else if (budget.includes('15') || budget.includes('20') || budget.includes('25')) {
    return '$15K-30K';
  } else if (budget.includes('5') || budget.includes('10')) {
    return '$5K-15K';
  } else {
    return 'Under $5K';
  }
}

export function getTimeline(briefData: BriefFormData, formType: string): string {
  const timelineField = formType === 'photo' ? 'deadline-date-photo' : 'deadline-date-2';
  const timeline = briefData[timelineField]?.toLowerCase() || '';
  
  if (timeline.includes('asap') || timeline.includes('urgent') || timeline.includes('immediately')) {
    return 'ASAP';
  } else if (timeline.includes('month') && (timeline.includes('1') || timeline.includes('2') || timeline.includes('3'))) {
    return '1-3 months';
  } else if (timeline.includes('month') && (timeline.includes('3') || timeline.includes('4') || timeline.includes('5') || timeline.includes('6'))) {
    return '3-6 months';
  } else {
    return 'Planning';
  }
}

export async function saveBriefToNotion(data: BriefData, actionType: string = 'pdf_download'): Promise<string> {
  const { formType, name, email, company, briefData } = data;
  
  const leadScore = calculateLeadScore(briefData, formType, actionType);
  const budgetRange = getBudgetRange(briefData, formType);
  const timeline = getTimeline(briefData, formType);

  // Extract key fields based on form type
  let businessSector = '';
  let projectDescription = '';
  let targetAudience = '';
  let specificRequirements = '';

  if (formType === 'website') {
    businessSector = briefData['sphere-2'] || '';
    projectDescription = `Website Type: ${briefData['site-type'] || 'Not specified'}\nPages: ${briefData['pages-per-site-2'] || 'Not specified'}\nStructure: ${briefData['site-structure-2'] || 'Not specified'}\nCurrent Website: ${briefData['current-website'] || 'Not specified'}\nBiggest Challenge: ${briefData['website-challenge'] || 'Not specified'}\nSuccess Metrics: ${briefData['success-metrics'] || 'Not specified'}`;
    targetAudience = briefData['audience-2'] || '';
    specificRequirements = `Features: ${[
      briefData['built-in-elements-catalog'] && 'Product Catalog',
      briefData['built-in-elements-cart'] && 'Online Cart',
      briefData['built-in-elements-cart-payments'] && 'Online Payments',
      briefData['built-in-elements-crm'] && 'CRM',
      briefData['built-in-elements-form'] && 'Contact Forms'
    ].filter(Boolean).join(', ')}\nStyle: ${briefData['overall-site-style-2'] || 'Not specified'}`;
  } else if (formType === 'graphic') {
    businessSector = briefData['sphere-2'] || '';
    projectDescription = `Service: ${briefData['Services-Required'] || 'Not specified'}\nStyle: ${briefData['Desired-Style'] || 'Not specified'}\nColors: ${briefData['Preferred-Colors'] || 'Not specified'}\nBrand Maturity: ${briefData['brand-maturity'] || 'Not specified'}\nUsage Timeline: ${briefData['usage-timeline'] || 'Not specified'}\nInternal Resources: ${briefData['internal-resources'] || 'Not specified'}`;
    targetAudience = briefData['audience-2'] || '';
    specificRequirements = `File Formats: ${briefData['File-Formats'] || 'Not specified'}\nSpecial Elements: ${briefData['Special-elements'] || 'Not specified'}\nCall to Action: ${briefData['Call-to-Action'] || 'Not specified'}`;
  } else if (formType === 'photo') {
    businessSector = briefData['sphere-3'] || '';
    projectDescription = `Service: ${briefData['photo-service-type'] || 'Not specified'}\nPurpose: ${briefData['project-purpose'] || 'Not specified'}\nLocation: ${briefData['shooting-location'] || 'Not specified'}\nContent Library Needs: ${briefData['content-library'] || 'Not specified'}\nDistribution Channels: ${briefData['distribution-channels'] || 'Not specified'}\nProduction Scale: ${briefData['production-scale'] || 'Not specified'}`;
    targetAudience = briefData['audience-3'] || '';
    specificRequirements = `Style: ${briefData['style-preferences'] || 'Not specified'}\nDuration: ${briefData['duration'] || 'Not specified'}\nResolution: ${briefData['video-resolution'] || 'Not specified'}`;
  }

  console.log('Attempting to save to Notion with database ID:', process.env.NOTION_PROJECT_BRIEFS_DB_ID);
  console.log('Lead score data:', leadScore);
  console.log('Form type:', formType);
  console.log('Action type:', actionType);
  
  // Build the properties object
  const properties: Record<string, unknown> = {
    'Client Name': {
      title: [
        {
          text: {
            content: name,
          },
        },
      ],
    },
    'Email': {
      email: email,
    },
    'Company': {
      rich_text: [
        {
          text: {
            content: company || '',
          },
        },
      ],
    },
    'Brief Type': {
      select: {
        name: formType === 'website' ? 'Website Brief' : formType === 'graphic' ? 'Design Brief' : 'Photo/Video Brief',
      },
    },
    'Business Sector': {
      rich_text: [
        {
          text: {
            content: businessSector,
          },
        },
      ],
    },
    'Budget Range': {
      select: {
        name: budgetRange,
      },
    },
    'Timeline': {
      select: {
        name: timeline,
      },
    },
    'Project Description': {
      rich_text: [
        {
          text: {
            content: projectDescription.substring(0, 2000), // Notion has a limit
          },
        },
      ],
    },
    'Target Audience': {
      rich_text: [
        {
          text: {
            content: targetAudience,
          },
        },
      ],
    },
    'Competitive Edge': {
      rich_text: [
        {
          text: {
            content: formType === 'photo' ? briefData['stand-out-3'] || '' : briefData['stand-out-2'] || '',
          },
        },
      ],
    },
    'Primary Goals': {
      rich_text: [
        {
          text: {
            content: formType === 'website' ? briefData['website-challenge'] || '' : 
                     formType === 'graphic' ? briefData['Audience-Message'] || '' :
                     briefData['project-purpose'] || '',
          },
        },
      ],
    },
    'Unique Selling Points': {
      rich_text: [
        {
          text: {
            content: formType === 'website' ? briefData['success-metrics'] || '' : 
                     formType === 'graphic' ? briefData['brand-maturity'] || '' :
                     briefData['distribution-channels'] || '',
          },
        },
      ],
    },
    'Specific Requirements': {
      rich_text: [
        {
          text: {
            content: specificRequirements,
          },
        },
      ],
    },
    'File Formats Needed': {
      rich_text: [
        {
          text: {
            content: formType === 'graphic' ? briefData['File-Formats'] || '' : '',
          },
        },
      ],
    },
    'Special Considerations': {
      rich_text: [
        {
          text: {
            content: formType === 'graphic' ? briefData['Special-elements'] || '' : 
                     formType === 'photo' ? briefData['audio-requirements'] || '' : '',
          },
        },
      ],
    },
    'Action Taken': {
      select: {
        name: actionType,
      },
    },
    'Lead Score': {
      select: {
        name: leadScore.level,
      },
    },
    // 'Status': {
    //   select: {
    //     name: 'New Brief',
    //   },
    // },
    'Date Submitted': {
      date: {
        start: new Date().toISOString().split('T')[0],
      },
    },
    'Company Size': {
      select: {
        name: briefData['company-size'] || 'Solo',
      },
    },
    'Decision Maker Level': {
      select: {
        name: briefData['decision-level'] || 'Team Decision',
      },
    },
    'Source': {
      select: {
        name: formType === 'website' ? 'Website Brief' : formType === 'graphic' ? 'Design Brief' : 'Photo/Video Brief',
      },
    },
    'Urgency Level': {
      select: {
        name: briefData['project-urgency'] === 'Immediate (within 1 month)' ? 'High' : 
              briefData['project-urgency'] === 'Soon (1-3 months)' ? 'Medium' : 'Low',
      },
    },
    'Full Brief Data': {
      rich_text: [
        {
          text: {
            content: JSON.stringify(briefData, null, 2).substring(0, 2000), // Notion has a limit
          },
        },
      ],
    },
  };
  
  console.log('Properties being sent to Notion:', JSON.stringify(properties, null, 2));
  console.log('Database ID being used:', process.env.NOTION_PROJECT_BRIEFS_DB_ID);
  console.log('Database ID length:', process.env.NOTION_PROJECT_BRIEFS_DB_ID?.length);
  
  try {
    const response = await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_PROJECT_BRIEFS_DB_ID!,
      },
      properties: properties,
    });

    console.log('Successfully saved to Notion with ID:', response.id);
    return response.id;
  } catch (error: unknown) {
    console.error('=== DETAILED NOTION API ERROR ===');
    console.error('Error saving to Notion:', error);
    
    // Check if it's a Notion API error with specific details
    if (error?.code === 'validation_error') {
      console.error('Validation error from Notion API:');
      console.error('Status:', error.status);
      console.error('Body:', JSON.stringify(error.body, null, 2));
      
      // Log specific property errors if available
      if (error.body?.properties) {
        console.error('Property errors:');
        Object.entries(error.body.properties).forEach(([prop, err]) => {
          console.error(`  ${prop}:`, err);
        });
      }
    }
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error name:', error.name);
      console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    }
    
    console.error('=== END DETAILED ERROR ===');
    
    throw new Error('Failed to save brief to Notion: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

export async function updateBriefAction(briefId: string, actionType: string): Promise<void> {
  try {
    await notion.pages.update({
      page_id: briefId,
      properties: {
        'Action Taken': {
          select: {
            name: actionType,
          },
        },
      },
    });
  } catch (error) {
    console.error('Error updating Notion:', error);
    throw new Error('Failed to update brief action in Notion');
  }
}

// PORTFOLIO FUNCTIONS

const PORTFOLIO_DATABASE_ID = process.env.NOTION_PORTFOLIO_DB_ID!;

// Helper function to extract text from Notion rich text
function extractText(richText: NotionRichText[]): string {
  if (!richText || !Array.isArray(richText)) return '';
  return richText.map((text) => text.plain_text).join('');
}

// Helper function to extract array of strings from multi-select
function extractMultiSelect(multiSelect: NotionSelectOption[]): string[] {
  if (!multiSelect || !Array.isArray(multiSelect)) return [];
  return multiSelect.map((item) => item.name);
}


// Helper function to generate slug from title
function generateSlug(title: string): string {
  if (!title || title.trim() === '') {
    return `project-${Date.now()}`; // Fallback for empty titles
  }
  
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim()
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  
  return slug || `project-${Date.now()}`; // Fallback if slug becomes empty
}

// Convert Notion page to Project
function notionPageToProject(page: NotionPage): Project {
  const properties = page.properties;
  
  // Extract title from the 'Project Title' property (title type)
  const title = extractText(properties['Project Title']?.title || []) || '';
  
  // Extract images from 'Images' files property
  const imageFiles = properties['Images']?.files || [];
  const images = imageFiles.map((file) => file.file?.url || file.external?.url || '').filter(Boolean);
  
  // Extract hero image from 'Hero Image' files property
  const heroImageFiles = properties['Hero Image']?.files || [];
  const heroImage = heroImageFiles.length > 0 ? heroImageFiles[0].file?.url || heroImageFiles[0].external?.url || '' : '';
  
  // Extract tools from 'Tools' multi_select property
  const tools = extractMultiSelect(properties['Tools']?.multi_select || []);
  
  // Extract video URL
  const videoUrl = properties['Video URL']?.url || '';
  
  // Extract background color if available
  const bgColor = extractText(properties['Background Color']?.rich_text || []);
  console.log('DEBUG: Background color for', title, ':', bgColor, '-> final:', bgColor ? `#${bgColor}` : 'default gradient');
  
  return {
    slug: generateSlug(title),
    title: title,
    description: extractText(properties['Description']?.rich_text || []) || '',
    images: images,
    year: extractText(properties['Year']?.rich_text || []),
    tools: tools,
    shortDescription: extractText(properties['Short Description']?.rich_text || []),
    aboutDescription: extractText(properties['Description']?.rich_text || []), // Use main description for about
    heroImage: heroImage,
    videoUrl: videoUrl,
    // Enhanced brand colors with custom project color
    brandColors: {
      primary: bgColor ? (bgColor.startsWith('#') ? bgColor : `#${bgColor}`) : '#3d3c44',
      secondary: '#f2f2f2',
      accent: bgColor ? (bgColor.startsWith('#') ? bgColor : `#${bgColor}`) : '#daff00',
      background: bgColor ? (bgColor.startsWith('#') ? bgColor : `#${bgColor}`) : 'linear-gradient(135deg, #f2f2f2 0%, #3d3c44 100%)'
    },
    published: true,
    featured: false,
  };
}

// Get all published projects
export async function getProjects(): Promise<Project[]> {
  try {
    console.log('🔄 Attempting to fetch projects from Notion...');
    console.log('📍 Database ID:', PORTFOLIO_DATABASE_ID);
    
    const response = await notion.databases.query({
      database_id: PORTFOLIO_DATABASE_ID,
    });

    console.log('✅ Notion response received, results count:', response.results.length);

    const projects = response.results.map(notionPageToProject);
    console.log('🎯 Processed projects:', projects.map(p => ({ title: p.title, slug: p.slug })));
    
    return projects;
  } catch (error) {
    console.error('❌ Error fetching projects from Notion:', error);
    return [];
  }
}

// Get a single project by slug
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  try {
    // Get all projects and find the one with matching slug
    const allProjects = await getProjects();
    const matchingProject = allProjects.find(project => project.slug === slug);
    
    return matchingProject || null;
  } catch (error) {
    console.error('Error fetching project from Notion:', error);
    return null;
  }
}

// Get featured projects
export async function getFeaturedProjects(limit: number = 6): Promise<Project[]> {
  const allProjects = await getProjects();
  return allProjects.slice(0, limit);
}
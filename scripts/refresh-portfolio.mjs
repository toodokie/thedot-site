#!/usr/bin/env node

/**
 * Refresh Portfolio Script
 * 
 * This script fetches fresh portfolio data from Notion and saves it to JSON files.
 * Now that images are self-hosted, this only updates text/metadata.
 * To download new images, use download-portfolio-images.mjs
 * 
 * Usage: node scripts/refresh-portfolio.mjs
 */

import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

// Initialize Notion client
const notion = new Client({
  auth: envVars.NOTION_TOKEN_PORTFOLIO,
});

const PORTFOLIO_DATABASE_ID = envVars.NOTION_PORTFOLIO_DB_ID;

// Helper functions
function extractText(richText) {
  if (!richText || !Array.isArray(richText)) return '';
  return richText.map((text) => text.plain_text).join('');
}

function extractMultiSelect(multiSelect) {
  if (!multiSelect || !Array.isArray(multiSelect)) return [];
  return multiSelect.map((item) => item.name);
}

function generateSlug(title) {
  if (!title || title.trim() === '') {
    return `project-${Date.now()}`;
  }
  
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-+|-+$/g, '');
  
  return slug || `project-${Date.now()}`;
}

// Convert Notion page to Project
function notionPageToProject(page) {
  const properties = page.properties;
  
  const title = extractText(properties['Project Title']?.title || []) || '';
  
  const imageFiles = properties['Images']?.files || [];
  const images = imageFiles.map((file) => file.file?.url || file.external?.url || '').filter(Boolean);
  
  const heroImageFiles = properties['Hero Image']?.files || [];
  const heroImage = heroImageFiles.length > 0 ? heroImageFiles[0].file?.url || heroImageFiles[0].external?.url || '' : '';
  
  const tools = extractMultiSelect(properties['Tools']?.multi_select || []);
  
  const videoUrl = properties['Video URL']?.url || '';
  
  const bgColor = extractText(properties['Background Color']?.rich_text || []);
  
  return {
    slug: generateSlug(title),
    title: title,
    description: extractText(properties['Description']?.rich_text || []) || '',
    images: images,
    year: extractText(properties['Year']?.rich_text || []),
    tools: tools,
    shortDescription: extractText(properties['Short Description']?.rich_text || []),
    aboutDescription: extractText(properties['Description']?.rich_text || []),
    heroImage: heroImage,
    videoUrl: videoUrl,
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

// Main function
async function refreshPortfolio() {
  try {
    console.log('🔄 Fetching portfolio data from Notion...');
    console.log('📍 Database ID:', PORTFOLIO_DATABASE_ID);
    
    const response = await notion.databases.query({
      database_id: PORTFOLIO_DATABASE_ID,
    });

    console.log('✅ Notion response received, results count:', response.results.length);

    const projects = response.results.map(notionPageToProject);
    
    // Create portfolio directory if it doesn't exist
    const portfolioDir = path.join(__dirname, '..', 'src', 'data', 'portfolio');
    if (!fs.existsSync(portfolioDir)) {
      fs.mkdirSync(portfolioDir, { recursive: true });
    }

    // Save each project to JSON file
    const savedProjects = [];
    for (const project of projects) {
      const filePath = path.join(portfolioDir, `${project.slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(project, null, 2));
      savedProjects.push(project.slug);
      console.log(`📄 Saved ${project.slug}.json`);
      
      // Log the first few image URLs to verify they're fresh
      if (project.images.length > 0) {
        const firstImageDate = project.images[0].match(/X-Amz-Date=(\d+T\d+Z)/)?.[1];
        if (firstImageDate) {
          const date = new Date(
            firstImageDate.slice(0, 4) + '-' + 
            firstImageDate.slice(4, 6) + '-' + 
            firstImageDate.slice(6, 8) + 'T' + 
            firstImageDate.slice(9, 11) + ':' + 
            firstImageDate.slice(11, 13) + ':' + 
            firstImageDate.slice(13, 15) + 'Z'
          );
          console.log(`   🖼️  Images expire at: ${date.toISOString()}`);
        }
      }
    }

    console.log(`\n✅ Successfully refreshed ${savedProjects.length} projects`);
    console.log('🎯 Projects:', savedProjects.join(', '));
    console.log(`📁 Files saved to: ${portfolioDir}`);
    console.log('\n💡 Tip: Notion S3 URLs expire after 1 hour. Run this script when you see 403 errors.');
    
  } catch (error) {
    console.error('❌ Error refreshing portfolio:', error);
    console.error('Make sure your NOTION_TOKEN and NOTION_PORTFOLIO_DB_ID are set correctly in .env.local');
  }
}

refreshPortfolio();
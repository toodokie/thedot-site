#!/usr/bin/env node

/**
 * Download Portfolio Images Script
 * 
 * This script downloads all portfolio images from Notion and saves them locally.
 * Images are stored in public/portfolio-images/ for self-hosting.
 * 
 * Usage: node scripts/download-portfolio-images.mjs
 */

import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createWriteStream } from 'fs';

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

// Download image from URL
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Process and download images for a project
async function processProjectImages(project, imageDir) {
  const updatedProject = { ...project };
  const downloadedImages = [];
  
  // Process regular images
  if (project.images && project.images.length > 0) {
    updatedProject.images = [];
    
    for (let i = 0; i < project.images.length; i++) {
      const imageUrl = project.images[i];
      if (!imageUrl) continue;
      
      // Extract original filename from URL
      const urlParts = imageUrl.split('/');
      const filenameWithQuery = urlParts[urlParts.length - 1];
      const originalFilename = filenameWithQuery.split('?')[0];
      
      // Create local filename
      const localFilename = `${project.slug}-${i + 1}${path.extname(originalFilename)}`;
      const localPath = path.join(imageDir, localFilename);
      const publicPath = `/portfolio-images/${localFilename}`;
      
      try {
        console.log(`  📥 Downloading ${originalFilename} → ${localFilename}`);
        await downloadImage(imageUrl, localPath);
        updatedProject.images.push(publicPath);
        downloadedImages.push(localFilename);
      } catch (error) {
        console.error(`  ❌ Failed to download image ${i + 1}: ${error.message}`);
        // Keep original URL as fallback
        updatedProject.images.push(imageUrl);
      }
    }
  }
  
  // Process hero image
  if (project.heroImage) {
    const imageUrl = project.heroImage;
    
    // Extract original filename from URL
    const urlParts = imageUrl.split('/');
    const filenameWithQuery = urlParts[urlParts.length - 1];
    const originalFilename = filenameWithQuery.split('?')[0];
    
    // Create local filename
    const localFilename = `${project.slug}-hero${path.extname(originalFilename)}`;
    const localPath = path.join(imageDir, localFilename);
    const publicPath = `/portfolio-images/${localFilename}`;
    
    try {
      console.log(`  📥 Downloading hero image → ${localFilename}`);
      await downloadImage(imageUrl, localPath);
      updatedProject.heroImage = publicPath;
      downloadedImages.push(localFilename);
    } catch (error) {
      console.error(`  ❌ Failed to download hero image: ${error.message}`);
      // Keep original URL as fallback
    }
  }
  
  return { updatedProject, downloadedImages };
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
async function downloadPortfolioImages() {
  try {
    console.log('🔄 Fetching portfolio data from Notion...');
    console.log('📍 Database ID:', PORTFOLIO_DATABASE_ID);
    
    const response = await notion.databases.query({
      database_id: PORTFOLIO_DATABASE_ID,
    });

    console.log('✅ Notion response received, results count:', response.results.length);

    const projects = response.results.map(notionPageToProject);
    
    // Create directories
    const portfolioDir = path.join(__dirname, '..', 'src', 'data', 'portfolio');
    const imageDir = path.join(__dirname, '..', 'public', 'portfolio-images');
    
    if (!fs.existsSync(portfolioDir)) {
      fs.mkdirSync(portfolioDir, { recursive: true });
    }
    
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
      console.log('📁 Created portfolio-images directory');
    }

    // Process each project
    const allDownloadedImages = [];
    
    for (const project of projects) {
      console.log(`\n🎨 Processing ${project.title} (${project.slug})`);
      
      // Download images and update paths
      const { updatedProject, downloadedImages } = await processProjectImages(project, imageDir);
      allDownloadedImages.push(...downloadedImages);
      
      // Save updated project JSON
      const filePath = path.join(portfolioDir, `${project.slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(updatedProject, null, 2));
      console.log(`  ✅ Saved ${project.slug}.json with local image paths`);
      console.log(`  📷 Downloaded ${downloadedImages.length} images`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`✅ Successfully processed ${projects.length} projects`);
    console.log(`📥 Downloaded ${allDownloadedImages.length} total images`);
    console.log(`📁 Images saved to: ${imageDir}`);
    console.log(`📄 JSON files updated with local paths`);
    console.log('\n🎉 Portfolio images are now self-hosted!');
    console.log('💡 Images will load instantly and never expire.');
    console.log('\n⚠️  Remember to:');
    console.log('1. Commit the new images in public/portfolio-images/');
    console.log('2. Deploy the changes');
    console.log('3. Remove or disable the image-proxy endpoint (optional)');
    
  } catch (error) {
    console.error('❌ Error downloading portfolio images:', error);
    console.error('Make sure your NOTION_TOKEN_PORTFOLIO and NOTION_PORTFOLIO_DB_ID are set correctly in .env.local');
  }
}

downloadPortfolioImages();
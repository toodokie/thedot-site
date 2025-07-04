// src/lib/projects.ts
import fs from 'fs';
import path from 'path';
import { Project } from '@/types/project';
import { getProjects as getNotionProjects, getProjectBySlug as getNotionProjectBySlug, getFeaturedProjects as getNotionFeaturedProjects } from './notion';

// Get projects from JSON files (now primary - build-time sync)
async function getProjectsFromJSON(): Promise<Project[]> {
  // Updated path to match our sync script output
  const dir = path.join(process.cwd(), "src", "data", "portfolio");
  
  try {
    const files = await fs.promises.readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      console.log('📁 No JSON files found in portfolio directory');
      return [];
    }
    
    const projects = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = path.join(dir, file);
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(raw);
        
        // Our sync script creates the correct format already
        return data as Project;
      })
    );
    
    console.log(`📦 Loaded ${projects.length} projects from build-time JSON files`);
    return projects.filter(project => project.published !== false);
  } catch {
    console.log('⚠️ Error reading projects from JSON, will try Notion');
    return [];
  }
}

// Get projects - JSON first (build-time), Notion fallback (real-time)
export async function getAllProjects(): Promise<Project[]> {
  // Try JSON files first (build-time sync - fast!)
  const jsonProjects = await getProjectsFromJSON();
  if (jsonProjects.length > 0) {
    return jsonProjects;
  }
  
  try {
    // Fallback to Notion (useful for development)
    console.log('🔄 JSON files not found, trying Notion API...');
    const notionProjects = await getNotionProjects();
    if (notionProjects.length > 0) {
      console.log(`✅ Loaded ${notionProjects.length} projects from Notion (real-time)`);
      return notionProjects;
    }
  } catch {
    console.error('❌ Error fetching from Notion');
  }
  
  console.log('⚠️ No projects found from either source');
  return [];
}

export async function getFeaturedProjects(): Promise<Project[]> {
  // Try JSON first
  const jsonProjects = await getProjectsFromJSON();
  if (jsonProjects.length > 0) {
    return jsonProjects.filter(project => project.featured === true);
  }
  
  try {
    // Fallback to Notion
    const notionProjects = await getNotionFeaturedProjects();
    if (notionProjects.length > 0) {
      return notionProjects;
    }
  } catch {
    console.error('Error fetching featured projects from Notion');
  }
  
  return [];
}

// Get project by slug from JSON files (now primary)
async function getProjectFromJSON(slug: string): Promise<Project | null> {
  try {
    // Updated path to match our sync script output
    const filePath = path.join(process.cwd(), "src", "data", "portfolio", `${slug}.json`);
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    
    return data as Project;
  } catch {
    console.log(`⚠️ Project ${slug} not found in JSON, will try Notion`);
    return null;
  }
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  // Try JSON first (build-time sync)
  const jsonProject = await getProjectFromJSON(slug);
  if (jsonProject) {
    console.log(`📄 Loaded project '${slug}' from build-time JSON`);
    return jsonProject;
  }
  
  try {
    // Fallback to Notion
    console.log(`🔄 Trying to load project '${slug}' from Notion...`);
    const notionProject = await getNotionProjectBySlug(slug);
    if (notionProject) {
      console.log(`✅ Loaded project '${slug}' from Notion (real-time)`);
      return notionProject;
    }
  } catch {
    console.error(`❌ Error fetching project ${slug} from Notion`);
  }
  
  return null;
}

export async function getProjectSlugs(): Promise<string[]> {
  try {
    // Try JSON first
    const dir = path.join(process.cwd(), "src", "data", "portfolio");
    const files = await fs.promises.readdir(dir);
    const slugs = files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
    
    if (slugs.length > 0) {
      console.log(`📋 Found ${slugs.length} project slugs from JSON files`);
      return slugs;
    }
  } catch {
    console.log('⚠️ Error reading project slugs from JSON, trying Notion');
  }
  
  try {
    // Fallback to Notion
    const notionProjects = await getNotionProjects();
    if (notionProjects.length > 0) {
      return notionProjects.map(project => project.slug);
    }
  } catch {
    console.error('Error fetching project slugs from Notion');
  }
  
  return [];
}

export async function getRelatedProjects(currentSlug: string, limit: number = 3): Promise<Project[]> {
  const projects = await getAllProjects();
  return projects
    .filter(project => project.slug !== currentSlug)
    .slice(0, limit);
}

// Get the next project in sequence (cycles back to first when at last)
export async function getNextProject(currentSlug: string): Promise<Project | null> {
  const projects = await getAllProjects();
  
  if (projects.length === 0) return null;
  if (projects.length === 1) return projects[0]; // If only one project, return it
  
  const currentIndex = projects.findIndex(project => project.slug === currentSlug);
  
  if (currentIndex === -1) {
    // Current project not found, return first project
    return projects[0];
  }
  
  // Get next project, cycle back to first if at the end
  const nextIndex = (currentIndex + 1) % projects.length;
  return projects[nextIndex];
}

// Generate project metadata for SEO
export function generateProjectMetadata(project: Project) {
  // Enhanced SEO titles for GTA market
  const seoTitle = project.seoTitle || `${project.title} | Portfolio | The Dot Creative Agency GTA`;
  const seoDescription = project.seoDescription || 
    `${project.shortDescription || project.description} Professional web design project by The Dot Creative Agency, Ontario Canada.`;
  
  return {
    title: seoTitle,
    description: seoDescription,
    keywords: `web design portfolio, ${project.category || 'website design'}, professional web development Ontario, custom design solutions GTA`,
    
    openGraph: {
      title: `${project.title} | The Dot Creative Portfolio`,
      description: project.shortDescription || project.description,
      url: `https://thedotcreative.co/${project.slug}`,
      siteName: 'The Dot Creative Agency',
      images: [
        {
          url: project.heroImage || project.images?.[0] || '/images/og-image.jpg',
          width: 1200,
          height: 630,
          alt: `${project.title} - The Dot Creative Portfolio`,
        },
      ],
      locale: 'en_CA',
      type: 'article',
    },
    
    twitter: {
      card: 'summary_large_image',
      title: `${project.title} | The Dot Creative Portfolio`,
      description: project.shortDescription || project.description,
      images: [project.heroImage || project.images?.[0] || '/images/og-image.jpg'],
    },
    
    robots: {
      index: true,
      follow: true,
    },
    
    // Structured data for portfolio work
    other: {
      'article:author': 'The Dot Creative Agency',
      'article:publisher': 'The Dot Creative Agency',
    }
  };
}
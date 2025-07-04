// scripts/sync-portfolio-from-notion.ts
import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';

interface PortfolioProject {
  slug: string;
  title: string;
  description: string;
  images: string[];
  year?: string;
  tools?: string[];
  shortDescription?: string;
  aboutDescription?: string;
  aboutTech?: string;
  heroImage?: string;
  videoUrl?: string;
  brandColors?: {
    primary: string;
    secondary: string;
    accent?: string;
    background: string;
  };
  gallery?: Array<{
    type: 'image' | 'video';
    src: string;
    alt?: string;
  }>;
  featured?: boolean;
  published?: boolean;
}

class PortfolioNotionSync {
  private portfolioNotion: Client;
  private portfolioDatabaseId: string;
  private outputDir: string;

  constructor() {
    this.portfolioNotion = new Client({ 
      auth: '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'
    });
    this.portfolioDatabaseId = '224d0f0c2544806aba32c82f0d08f463';
    this.outputDir = path.join(process.cwd(), 'src/data/portfolio');
  }

  async syncPortfolioProjects(): Promise<void> {
    try {
      console.log('🎨 Syncing portfolio projects from Notion...');
      console.log('📍 Database ID:', this.portfolioDatabaseId);
      
      // Get all projects (no filter for now)
      const response = await this.portfolioNotion.databases.query({
        database_id: this.portfolioDatabaseId,
        sorts: [
          {
            property: 'Year',
            direction: 'descending'
          }
        ]
      });

      console.log(`📦 Found ${response.results.length} portfolio projects`);

      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
        console.log(`📁 Created portfolio directory: ${this.outputDir}`);
      }

      const processedSlugs = new Set<string>();

      for (const page of response.results) {
        if ('properties' in page) {
          const project = await this.parseProjectFromPage(page);
          if (project) {
            await this.writeProjectFile(project);
            processedSlugs.add(project.slug);
            console.log(`✅ Portfolio project synced: ${project.title}`);
          }
        }
      }

      await this.cleanupOldPortfolioFiles(processedSlugs);

      console.log('🎉 Portfolio sync completed successfully!');
      console.log(`📊 Total projects: ${processedSlugs.size}`);
    } catch (error) {
      console.error('❌ Error syncing portfolio from Notion:', error);
      throw error;
    }
  }

  private async parseProjectFromPage(page: any): Promise<PortfolioProject | null> {
    try {
      const properties = page.properties;

      const title = this.getTextProperty(properties['Project Title']);
      const slug = this.generateSlug(title || '');
      
      if (!title || !slug) {
        console.warn(`⚠️  Skipping project: missing title`);
        return null;
      }

      const aboutDescription = await this.getPageContent(page.id);
      const heroImageFiles = this.getFilesProperty(properties['Hero Image']);
      const heroImage = heroImageFiles.length > 0 ? heroImageFiles[0] : undefined;
      const imageFiles = this.getFilesProperty(properties['Images']);

      // Get background color from Notion and format it
      const notionBackgroundColor = this.getTextProperty(properties['Background Color']);
      const backgroundColor = notionBackgroundColor ? this.formatBackgroundColor(notionBackgroundColor) : '#f2f2f2';

      const project: PortfolioProject = {
        slug,
        title,
        description: this.getTextProperty(properties.Description) || '',
        images: imageFiles,
        year: this.getTextProperty(properties.Year),
        tools: this.getMultiSelectProperty(properties.Tools),
        shortDescription: this.getTextProperty(properties['Short Description']),
        aboutDescription,
        aboutTech: this.getTextProperty(properties['About Tech']),
        heroImage,
        videoUrl: this.getUrlProperty(properties['Video URL']),
        brandColors: {
          primary: '#3d3c44',
          secondary: '#f2f2f2', 
          background: backgroundColor
        },
        gallery: imageFiles.map(src => ({
          type: 'image' as const,
          src,
          alt: title
        })),
        featured: false,
        published: true
      };

      return project;
    } catch (error) {
      console.error(`Error parsing project from page ${page.id}:`, error);
      return null;
    }
  }

  private getTextProperty(property: any): string | undefined {
    if (!property) return undefined;
    
    switch (property.type) {
      case 'title':
        return property.title?.[0]?.plain_text;
      case 'rich_text':
        return property.rich_text?.[0]?.plain_text;
      default:
        return undefined;
    }
  }

  private getMultiSelectProperty(property: any): string[] | undefined {
    return property?.multi_select?.map((item: any) => item.name);
  }

  private getUrlProperty(property: any): string | undefined {
    return property?.url;
  }

  private getFilesProperty(property: any): string[] {
    if (!property || property.type !== 'files') return [];
    
    return property.files?.map((file: any) => {
      if (file.type === 'file') {
        return file.file?.url || '';
      } else if (file.type === 'external') {
        return file.external?.url || '';
      }
      return '';
    }).filter((url: string) => url.length > 0) || [];
  }

  private async getPageContent(pageId: string): Promise<string | undefined> {
    try {
      const blocks = await this.portfolioNotion.blocks.children.list({
        block_id: pageId
      });

      const textBlocks = blocks.results
        .filter((block: any) => 
          block.type === 'paragraph' && 
          block.paragraph?.rich_text?.length > 0
        )
        .map((block: any) =>
          block.paragraph.rich_text
            .map((text: any) => text.plain_text)
            .join('')
        );

      return textBlocks.length > 0 ? textBlocks.join('\n\n') : undefined;
    } catch (error) {
      console.warn(`Could not fetch page content for ${pageId}:`, error);
      return undefined;
    }
  }

  private formatBackgroundColor(colorValue: string): string {
    if (!colorValue) return '#f2f2f2';
    
    // Remove any existing # prefix and whitespace
    const cleanColor = colorValue.replace('#', '').trim();
    
    // Add # prefix if it's a valid hex color
    if (/^[0-9A-Fa-f]{6}$/.test(cleanColor)) {
      const formattedColor = `#${cleanColor}`;
      console.log(`DEBUG: Background color converted: ${colorValue} -> ${formattedColor}`);
      return formattedColor;
    }
    
    // Fallback if invalid format
    console.warn(`Invalid background color format: ${colorValue}, using default`);
    return '#f2f2f2';
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private async writeProjectFile(project: PortfolioProject): Promise<void> {
    const filePath = path.join(this.outputDir, `${project.slug}.json`);
    const jsonContent = JSON.stringify(project, null, 2);
    
    fs.writeFileSync(filePath, jsonContent);
  }

  private async cleanupOldPortfolioFiles(currentSlugs: Set<string>): Promise<void> {
    if (!fs.existsSync(this.outputDir)) return;

    const existingFiles = fs.readdirSync(this.outputDir)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));

    for (const existingSlug of existingFiles) {
      if (!currentSlugs.has(existingSlug)) {
        const filePath = path.join(this.outputDir, `${existingSlug}.json`);
        fs.unlinkSync(filePath);
        console.log(`🗑️  Removed outdated file: ${existingSlug}.json`);
      }
    }
  }
}

async function main() {
  console.log('🚀 Starting portfolio sync from Notion...');
  const portfolioSync = new PortfolioNotionSync();
  await portfolioSync.syncPortfolioProjects();
}

main().catch(console.error);
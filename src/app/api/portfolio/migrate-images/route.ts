import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    console.log('🖼️ Starting image migration from existing JSON files to local storage...');
    
    // Get projects from existing JSON files
    const portfolioDir = path.join(process.cwd(), 'src', 'data', 'portfolio');
    if (!fs.existsSync(portfolioDir)) {
      return NextResponse.json({ error: 'Portfolio directory not found' }, { status: 404 });
    }

    const files = fs.readdirSync(portfolioDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      return NextResponse.json({ error: 'No JSON files found in portfolio directory' }, { status: 404 });
    }

    const projects = jsonFiles.map(file => {
      const filePath = path.join(portfolioDir, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    });
    
    if (projects.length === 0) {
      return NextResponse.json({ error: 'No projects found in JSON files' }, { status: 404 });
    }

    // Create images directory if it doesn't exist
    const imagesDir = path.join(process.cwd(), 'public', 'images', 'portfolio');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const results = [];

    for (const project of projects) {
      console.log(`📸 Processing project: ${project.title}`);
      
      const projectResult = {
        slug: project.slug,
        title: project.title,
        images: [],
        errors: []
      };

      // Download hero image
      if (project.heroImage) {
        try {
          const heroImageName = `${project.slug}-hero.webp`;
          const heroImagePath = path.join(imagesDir, heroImageName);
          
          const response = await fetch(project.heroImage);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            fs.writeFileSync(heroImagePath, Buffer.from(buffer));
            project.heroImage = `/images/portfolio/${heroImageName}`;
            projectResult.images.push(`hero: ${heroImageName}`);
            console.log(`✅ Downloaded hero image: ${heroImageName}`);
          }
        } catch (error) {
          projectResult.errors.push(`Hero image error: ${error}`);
          console.error(`❌ Error downloading hero image for ${project.slug}:`, error);
        }
      }

      // Download gallery images (handle both old 'images' array and new 'gallery' array)
      console.log(`🔍 Checking gallery for ${project.slug}:`, project.gallery?.length || 0, 'items');
      if (project.gallery && Array.isArray(project.gallery)) {
        const newGallery = [];
        
        for (let i = 0; i < project.gallery.length; i++) {
          const galleryItem = project.gallery[i];
          const imageUrl = galleryItem.src || galleryItem;
          console.log(`📸 Processing gallery item ${i + 1}:`, typeof galleryItem, imageUrl ? imageUrl.substring(0, 100) + '...' : 'no URL');
          
          if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
            try {
              const imageName = `${project.slug}-${i + 1}.webp`;
              const imagePath = path.join(imagesDir, imageName);
              
              console.log(`⬇️ Downloading ${imageUrl.substring(0, 100)}... to ${imageName}`);
              const response = await fetch(imageUrl);
              console.log(`📥 Response status: ${response.status}`);
              
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(imagePath, Buffer.from(buffer));
                
                // Update gallery item with local path
                if (typeof galleryItem === 'object') {
                  newGallery.push({
                    ...galleryItem,
                    src: `/images/portfolio/${imageName}`
                  });
                } else {
                  newGallery.push(`/images/portfolio/${imageName}`);
                }
                
                projectResult.images.push(`gallery-${i + 1}: ${imageName}`);
                console.log(`✅ Downloaded gallery image: ${imageName}`);
              } else {
                console.log(`❌ Failed to download: ${response.status} ${response.statusText}`);
                newGallery.push(galleryItem); // Keep original as fallback
              }
            } catch (error) {
              projectResult.errors.push(`Gallery image ${i + 1} error: ${error}`);
              console.error(`❌ Error downloading gallery image ${i + 1} for ${project.slug}:`, error);
              newGallery.push(galleryItem); // Keep original as fallback
            }
          } else {
            newGallery.push(galleryItem); // Keep non-HTTP URLs as-is
          }
        }
        
        project.gallery = newGallery;
      }

      // Handle old 'images' array format (for backward compatibility)
      if (project.images && Array.isArray(project.images)) {
        const newImages = [];
        
        for (let i = 0; i < project.images.length; i++) {
          const imageUrl = project.images[i];
          if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
            try {
              const imageName = `${project.slug}-img-${i + 1}.webp`;
              const imagePath = path.join(imagesDir, imageName);
              
              const response = await fetch(imageUrl);
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(imagePath, Buffer.from(buffer));
                newImages.push(`/images/portfolio/${imageName}`);
                projectResult.images.push(`images-${i + 1}: ${imageName}`);
                console.log(`✅ Downloaded legacy image: ${imageName}`);
              }
            } catch (error) {
              projectResult.errors.push(`Legacy image ${i + 1} error: ${error}`);
              console.error(`❌ Error downloading legacy image ${i + 1} for ${project.slug}:`, error);
              newImages.push(imageUrl); // Keep original URL as fallback
            }
          } else {
            newImages.push(imageUrl); // Keep non-HTTP URLs as-is
          }
        }
        
        project.images = newImages;
      }

      // Save updated project JSON with local image paths
      const portfolioDir = path.join(process.cwd(), 'src', 'data', 'portfolio');
      if (!fs.existsSync(portfolioDir)) {
        fs.mkdirSync(portfolioDir, { recursive: true });
      }
      
      const projectPath = path.join(portfolioDir, `${project.slug}.json`);
      fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
      
      results.push(projectResult);
    }

    console.log(`✅ Image migration completed for ${projects.length} projects`);

    return NextResponse.json({ 
      success: true, 
      message: `Migrated images for ${projects.length} projects`,
      results: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error migrating images:', error);
    return NextResponse.json(
      { error: 'Failed to migrate images' },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { getProjects } from '@/lib/notion';

// Cache for fresh Notion URLs
let urlCache: Map<string, string> = new Map();
let lastRefresh = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

async function refreshUrlIfNeeded(originalUrl: string): Promise<string> {
  const now = Date.now();
  
  // Check if we have a cached fresh URL
  if (urlCache.has(originalUrl) && now - lastRefresh < CACHE_DURATION) {
    return urlCache.get(originalUrl)!;
  }
  
  // Check if URL is expired by looking at the X-Amz-Date parameter
  const urlObj = new URL(originalUrl);
  const amzDate = urlObj.searchParams.get('X-Amz-Date');
  if (amzDate) {
    // Parse the date (format: 20250706T123936Z)
    const expiryTime = new Date(
      amzDate.slice(0, 4) + '-' + 
      amzDate.slice(4, 6) + '-' + 
      amzDate.slice(6, 8) + 'T' + 
      amzDate.slice(9, 11) + ':' + 
      amzDate.slice(11, 13) + ':' + 
      amzDate.slice(13, 15) + 'Z'
    ).getTime();
    
    // Add the expires duration (3600 seconds = 1 hour)
    const expiresIn = parseInt(urlObj.searchParams.get('X-Amz-Expires') || '3600') * 1000;
    const actualExpiry = expiryTime + expiresIn;
    
    // If URL hasn't expired yet, use it
    if (now < actualExpiry - 60000) { // 1 minute buffer
      return originalUrl;
    }
  }
  
  // URL is expired or about to expire, refresh from Notion
  try {
    console.log('🔄 Refreshing portfolio URLs from Notion...');
    const projects = await getProjects();
    
    // Clear old cache
    urlCache.clear();
    lastRefresh = now;
    
    // Build new cache with all image URLs
    for (const project of projects) {
      // Map old URLs to new URLs based on filename
      const allImages = [...(project.images || []), project.heroImage].filter(Boolean);
      
      for (const newUrl of allImages) {
        // Extract filename from URL
        const filename = newUrl.split('/').pop()?.split('?')[0];
        if (filename && originalUrl.includes(filename)) {
          urlCache.set(originalUrl, newUrl);
          console.log(`✅ Found fresh URL for ${filename}`);
          return newUrl;
        }
      }
    }
    
    console.log('⚠️  Could not find matching fresh URL');
    return originalUrl; // Fallback to original
  } catch (error) {
    console.error('Error refreshing URLs:', error);
    return originalUrl; // Fallback to original
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');
    
    if (!imageUrl) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Get a fresh URL if needed
    const freshUrl = await refreshUrlIfNeeded(imageUrl);

    // Fetch the image from Notion's S3
    const response = await fetch(freshUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)',
      },
    });

    if (!response.ok) {
      // If still failing, try one more refresh
      if (response.status === 403 && freshUrl === imageUrl) {
        console.log('🔄 Forcing refresh due to 403 error...');
        urlCache.delete(imageUrl);
        lastRefresh = 0;
        const newUrl = await refreshUrlIfNeeded(imageUrl);
        
        const retryResponse = await fetch(newUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)',
          },
        });
        
        if (retryResponse.ok) {
          const imageBuffer = await retryResponse.arrayBuffer();
          const contentType = retryResponse.headers.get('content-type') || 'image/jpeg';
          
          return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=1800', // Cache for 30 minutes
            },
          });
        }
      }
      
      console.error(`Image fetch failed: ${response.status} for ${freshUrl}`);
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=1800', // Cache for 30 minutes (less than token expiry)
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Image proxy failed' }, { status: 500 });
  }
}
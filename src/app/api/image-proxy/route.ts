import { NextRequest, NextResponse } from 'next/server';
import { getProjects } from '@/lib/notion';

// Cache for fresh Notion URLs
let urlCache: Map<string, string> = new Map();
// Cache for actual image data
let imageCache: Map<string, { data: ArrayBuffer; contentType: string; timestamp: number }> = new Map();
let lastRefresh = 0;
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours (longer cache)
const IMAGE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for image data

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
    console.log('🔄 Refreshing URLs from Notion (portfolio and blog)...');
    
    // Clear old cache
    urlCache.clear();
    lastRefresh = now;
    
    // Refresh portfolio images
    try {
      const projects = await getProjects();
      for (const project of projects) {
        const allImages = [...(project.images || []), project.heroImage].filter(Boolean);
        
        for (const newUrl of allImages) {
          // Extract filename from URL
          const filename = newUrl.split('/').pop()?.split('?')[0];
          if (filename && originalUrl.includes(filename)) {
            urlCache.set(originalUrl, newUrl);
            console.log(`✅ Found fresh portfolio URL for ${filename}`);
            return newUrl;
          }
        }
      }
    } catch (error) {
      console.warn('Could not refresh portfolio URLs:', error);
    }

    // Refresh blog post images
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const blogResponse = await fetch(`${baseUrl}/api/blog?includeContent=true`);
      const blogData = await blogResponse.json();
      
      for (const post of blogData.posts) {
        const images = [post.featuredImage, post.socialImage].filter(Boolean);
        
        for (const newUrl of images) {
          // Extract filename from URL
          const filename = newUrl.split('/').pop()?.split('?')[0];
          if (filename && originalUrl.includes(filename)) {
            urlCache.set(originalUrl, newUrl);
            console.log(`✅ Found fresh blog URL for ${filename}`);
            return newUrl;
          }
        }
      }
    } catch (error) {
      console.warn('Could not refresh blog URLs:', error);
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
    const width = searchParams.get('w');
    const quality = searchParams.get('q') || '75';
    
    if (!imageUrl) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    const now = Date.now();
    const cacheKey = `${imageUrl}-${width}-${quality}`;
    
    // Check image cache first
    const cachedImage = imageCache.get(cacheKey);
    if (cachedImage && now - cachedImage.timestamp < IMAGE_CACHE_DURATION) {
      console.log('📦 Serving from image cache');
      return new NextResponse(cachedImage.data, {
        status: 200,
        headers: {
          'Content-Type': cachedImage.contentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // Cache for 24 hours, stale for 7 days
          'ETag': `"${cacheKey}-${cachedImage.timestamp}"`,
          'X-Cache': 'HIT',
        },
      });
    }

    // Get a fresh URL if needed
    const freshUrl = await refreshUrlIfNeeded(imageUrl);

    // Fetch the image from Notion's S3 with optimizations
    const response = await fetch(freshUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)',
        'Accept': 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=3600',
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
            'Accept': 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'max-age=3600',
          },
        });
        
        if (retryResponse.ok) {
          const imageBuffer = await retryResponse.arrayBuffer();
          const contentType = retryResponse.headers.get('content-type') || 'image/jpeg';
          
          // Cache the successful response
          imageCache.set(cacheKey, {
            data: imageBuffer,
            contentType,
            timestamp: now
          });
          
          return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // Cache for 24 hours, stale for 7 days
              'ETag': `"${cacheKey}-${now}"`,
              'X-Cache': 'MISS',
            },
          });
        }
      }
      
      console.error(`Image fetch failed: ${response.status} for ${freshUrl}`);
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Cache the successful response
    imageCache.set(cacheKey, {
      data: imageBuffer,
      contentType,
      timestamp: now
    });

    // Clean up old cache entries periodically
    if (imageCache.size > 100) {
      const cutoff = now - IMAGE_CACHE_DURATION;
      for (const [key, value] of imageCache.entries()) {
        if (value.timestamp < cutoff) {
          imageCache.delete(key);
        }
      }
    }

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // Cache for 24 hours, stale for 7 days
        'ETag': `"${cacheKey}-${now}"`,
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Image proxy failed' }, { status: 500 });
  }
}
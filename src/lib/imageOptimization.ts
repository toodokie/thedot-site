// Image optimization utilities

// Generate a proper blur placeholder based on brand colors
export function generateBlurDataURL(color: string = '#faf9f6'): string {
  // This creates a 1x1 pixel image with the specified color
  // Much better than generic blur that shows blue placeholder
  const svg = `
    <svg width="1" height="1" xmlns="http://www.w3.org/2000/svg">
      <rect width="1" height="1" fill="${color}"/>
    </svg>
  `;
  
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

// Preload critical images
export function preloadImage(src: string): void {
  if (typeof window !== 'undefined') {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);
  }
}

// Image loading states
export const imageStates = {
  loading: 'blur',
  loaded: 'none',
  error: 'none'
} as const;

// Optimized sizes for different viewports
export const imageSizes = {
  mobile: 640,
  tablet: 1024,
  desktop: 1920
} as const;
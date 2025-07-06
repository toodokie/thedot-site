// Custom image loader that bypasses expired Notion URLs
export function notionImageLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  // If it's a Notion S3 URL with expired tokens, use our proxy
  if (src.includes('prod-files-secure.s3.us-west-2.amazonaws.com')) {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://www.thedotcreative.co'
      : 'http://localhost:3000';
    
    return `${baseUrl}/api/image-proxy?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
  }
  
  // For other images, use default Next.js optimization
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
}
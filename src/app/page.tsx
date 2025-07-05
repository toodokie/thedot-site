// src/app/page.tsx (Server Component - no 'use client')
import HomePage from '@/components/HomePage';

// Performance optimization metadata for homepage
export async function generateMetadata() {
  return {
    title: "The Dot Creative Agency | Web Design & Development | GTA Ontario",
    description: "Professional web design agency in Ontario, Canada. International design expertise for GTA businesses. Custom websites that convert visitors into customers.",
    other: {
      // Preload critical resources for LCP improvement
      'preload-video': '/video/hero-video.mp4',
      'preload-image': '/images/logo.png'
    }
  }
}

export default function Page() {
  return (
    <>
      {/* Critical resource hints for better LCP */}
      <link rel="preload" href="/video/hero-video.mp4" as="video" type="video/mp4" />
      <link rel="preload" href="/images/logo.png" as="image" />
      <link rel="preload" href="/images/line.png" as="image" />
      
      <HomePage />
    </>
  );
}
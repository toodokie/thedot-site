// src/app/page.tsx (Server Component - no 'use client')
import type { Metadata } from 'next';
import HomePage from '@/components/HomePage';

export const metadata: Metadata = {
  title: "Business Systems Integration + Web Design, Ontario | The Dot",
  description: "Ontario web design agency that connects your business systems. Save 10-20 hours monthly through strategic website design and automation. Serving GTA businesses.",
  keywords: "business systems integration Ontario, web design agency GTA, website automation Toronto, connected business solutions, AODA compliant websites Ontario",
  
  openGraph: {
    title: "Strategic Web Design That Actually Works for Your Business | The Dot Creative",
    description: "Stop paying for disconnected tools. We create websites that integrate with your existing business systems. Ontario's business efficiency specialists.",
    url: "https://thedotcreative.co",
    siteName: "The Dot Creative Agency",
    locale: "en_CA",
    type: "website",
    images: [
      {
        url: "/images/The Dot Poster.webp",
        width: 1200,
        height: 630,
        alt: "The Dot Creative Agency - Business Systems Integration"
      }
    ]
  },
  
  twitter: {
    card: "summary_large_image",
    title: "Strategic Web Design That Actually Works for Your Business",
    description: "Stop paying for disconnected tools. We create websites that integrate with your existing business systems. Ontario's business efficiency specialists.",
    images: ["/images/The Dot Poster.webp"]
  }
};

export default function Page() {
  return <HomePage />;
}
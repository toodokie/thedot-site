// app/layout.tsx
import type { Metadata } from "next";
import ConditionalHeader from '@/components/ConditionalHeader';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL('https://www.thedotcreative.co'),
  title: "The Dot Creative Agency | Web Design & Development | GTA Ontario",
  description: "Professional web design agency in Ontario, Canada. International design expertise for GTA businesses. Custom websites that convert visitors into customers.",
  keywords: "web design agency GTA, website design Ontario, professional web development Toronto, custom website design Canada, international design standards",
  alternates: {
    canonical: '/',
  },
  // Emit the manifest via metadata (not a hardcoded <link>) so the /client and /admin portal
  // layouts can override it with their own installable-app manifests (child metadata wins).
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico?v=5', type: 'image/x-icon' },
      { url: '/favicon.png?v=5', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.png?v=5', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.png?v=5', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.png?v=5', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.png?v=5', sizes: '256x256', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png?v=5', sizes: '180x180', type: 'image/png' },
      { url: '/apple-touch-icon.png?v=5', sizes: '152x152', type: 'image/png' },
      { url: '/apple-touch-icon.png?v=5', sizes: '120x120', type: 'image/png' },
      { url: '/apple-touch-icon.png?v=5', sizes: '76x76', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=5',
    other: [
      {
        rel: 'mask-icon',
        url: '/favicon.png?v=5',
        color: '#daff00',
      },
    ],
  },
  
  // OpenGraph for social sharing
  openGraph: {
    title: "The Dot Creative Agency | Professional Web Design GTA",
    description: "International design expertise for GTA businesses. Custom websites that convert visitors into customers.",
    url: "https://www.thedotcreative.co",
    siteName: "The Dot Creative Agency",
    images: [
      {
        url: "/images/The Dot Poster.webp",
        width: 1200,
        height: 630,
        alt: "The Dot Creative Agency - Professional Web Design"
      }
    ],
    locale: "en_CA",
    type: "website"
  },
  
  // Twitter cards
  twitter: {
    card: "summary_large_image",
    title: "The Dot Creative Agency | Professional Web Design GTA",
    description: "International design expertise for GTA businesses. Custom websites that convert visitors into customers.",
    images: ["/images/The Dot Poster.webp"]
  },
  
  // Robots and indexing
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  
  // Geo-targeting for GTA market
  other: {
    "geo.region": "CA-ON",
    "geo.placename": "Ontario",
    "geo.position": "43.7;-79.4", // GTA coordinates
  }
};

// Viewport should be exported separately in Next.js 13+
export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://www.thedotcreative.co/#organization",
    "name": "The Dot Creative Agency",
    "alternateName": "The Dot Creative",
    "description": "Web design and development, business systems integration, workflow automation, AODA accessibility, and AI-visibility services for growing Ontario businesses.",
    "url": "https://www.thedotcreative.co",
    "telephone": "+1-647-402-4420",
    "email": "info@thedotcreative.co",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Ontario", 
      "addressRegion": "ON",
      "addressCountry": "CA"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": "43.7",
      "longitude": "-79.4"
    },
    "areaServed": {
      "@type": "State",
      "name": "Ontario"
    },
    "image": "https://www.thedotcreative.co/images/logo.png",
    "logo": "https://www.thedotcreative.co/images/logo.png",
    "sameAs": [
      "https://www.instagram.com/thedotcreativeagency/",
      "https://www.linkedin.com/in/anna-volk-75b354373/"
    ],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Web, Systems & AI-Visibility Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Web Design & Development",
            "description": "Custom, accessible websites built to convert for Ontario service businesses."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Business Systems Integration",
            "description": "Connecting websites with CRM, accounting, scheduling and intake tools."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Workflow Automation",
            "description": "Automating manual client and admin workflows to save time."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "AODA Accessibility Compliance",
            "description": "Accessible web design and audits aligned with Ontario AODA requirements."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "AI Visibility (Generative Engine Optimization)",
            "description": "Helping businesses get found and recommended by AI search engines."
          }
        }
      ]
    }
  };

  return (
    <html lang="en-CA">
      <head>
        {/* FAVICON FIRST - Safari prefers early favicon declarations */}
        <link rel="icon" href="/favicon.ico?v=5" />
        <link rel="shortcut icon" href="/favicon.ico?v=5" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=5" />
        <link rel="icon" type="image/vnd.microsoft.icon" href="/favicon.ico?v=5" />
        <meta name="msapplication-config" content="none" />
        
        {/* Performance optimizations - preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.adobe.com" />
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://prod-files-secure.s3.us-west-2.amazonaws.com" />
        
        {/* LCP Optimization - preload critical resources removed due to console warnings on pages that don't immediately use line.png */}
        
        {/* Adobe Fonts - Simple loading strategy */}
        <link
          rel="stylesheet"
          href="https://use.typekit.net/gac6jnd.css"
        />
        
        {/* Font loading optimization to reduce CLS */}
        <style dangerouslySetInnerHTML={{
          __html: `
            @font-face {
              font-family: 'futura-pt';
              font-display: swap;
            }
            @font-face {
              font-family: 'ff-real-text-pro';
              font-display: swap;
            }
          `
        }} />
        
        
        {/* Additional favicon sizes */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png?v=5" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png?v=5" />
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon.png?v=5" />
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon.png?v=5" />
        <link rel="icon" type="image/png" sizes="256x256" href="/favicon.png?v=5" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=5" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon.png?v=5" />
        <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon.png?v=5" />
        <link rel="apple-touch-icon" sizes="76x76" href="/apple-touch-icon.png?v=5" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=5" />
        
        {/* Mobile optimization */}
        <meta name="theme-color" content="#daff00" />
        <meta name="msapplication-TileColor" content="#daff00" />
        <meta name="msapplication-TileImage" content="/favicon.png?v=5" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="The Dot Creative" />
        
        {/* Structured Data for Local Business */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData)
          }}
        />
      </head>
      <body>
        <GoogleAnalytics />
        <SpeedInsights />
        <Analytics />
        <ConditionalHeader />
        {children}
      </body>
    </html>
  );
}
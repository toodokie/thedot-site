// app/layout.tsx
import type { Metadata } from "next";
import ConditionalHeader from '@/components/ConditionalHeader';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  title: "The Dot Creative Agency | Web Design & Development | GTA Ontario",
  description: "Professional web design agency in Ontario, Canada. International design expertise for GTA businesses. Custom websites that convert visitors into customers.",
  keywords: "web design agency GTA, website design Ontario, professional web development Toronto, custom website design Canada, international design standards",
  alternates: {
    canonical: 'https://www.thedotcreative.co',
  },
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
    url: "https://thedotcreative.co",
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
    "@id": "https://thedotcreative.co",
    "name": "The Dot Creative Agency",
    "alternateName": "The Dot Creative",
    "description": "Professional web design and development agency serving the Greater Toronto Area with international design expertise.",
    "url": "https://thedotcreative.co",
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
    "serviceArea": {
      "@type": "GeoCircle",
      "geoMidpoint": {
        "@type": "GeoCoordinates",
        "latitude": "43.7",
        "longitude": "-79.4"
      },
      "geoRadius": "100000"
    },
    "priceRange": "$",
    "image": "https://thedotcreative.co/images/logo.png",
    "logo": "https://thedotcreative.co/images/logo.png",
    "sameAs": [
      "https://www.instagram.com/thedotcreativeagency/",
      "https://www.linkedin.com/in/anna-volk-75b354373/"
    ],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Web Design Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Custom Website Design",
            "description": "Bespoke website design with international design standards"
          }
        },
        {
          "@type": "Offer", 
          "itemOffered": {
            "@type": "Service",
            "name": "Web Development",
            "description": "Professional web development with modern technologies"
          }
        },
        {
          "@type": "Offer", 
          "itemOffered": {
            "@type": "Service",
            "name": "Graphic Design",
            "description": "Professional graphic design and branding services"
          }
        },
        {
          "@type": "Offer", 
          "itemOffered": {
            "@type": "Service",
            "name": "Photo & Video Production",
            "description": "Professional photography and video production services"
          }
        }
      ]
    }
  };

  return (
    <html lang="en">
      <head>
        {/* FAVICON FIRST - Safari prefers early favicon declarations */}
        <link rel="icon" href="/favicon.ico?v=5&t={Date.now()}" />
        <link rel="shortcut icon" href="/favicon.ico?v=5&t={Date.now()}" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=5&t={Date.now()}" />
        <link rel="icon" type="image/vnd.microsoft.icon" href="/favicon.ico?v=5&t={Date.now()}" />
        <meta name="msapplication-config" content="none" />
        
        {/* Performance optimizations - preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.adobe.com" />
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://prod-files-secure.s3.us-west-2.amazonaws.com" />
        
        {/* LCP Optimization - preload critical resources */}
        <link rel="preload" href="/video/hero-video.mp4" as="video" type="video/mp4" />
        <link rel="preload" href="/images/line.png" as="image" />
        
        {/* Adobe Fonts - Optimized for CLS prevention */}
        <link
          rel="preload"
          href="https://use.typekit.net/gac6jnd.css"
          as="style"
          onLoad="this.onload=null;this.rel='stylesheet'"
        />
        <link
          rel="stylesheet"
          href="https://use.typekit.net/gac6jnd.css"
          media="print"
          onLoad="this.media='all'"
        />
        <noscript>
          <link rel="stylesheet" href="https://use.typekit.net/gac6jnd.css" />
        </noscript>
        
        {/* Font loading optimization script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Add font-loaded class when Adobe Fonts are ready
              (function() {
                if (typeof document !== 'undefined') {
                  document.documentElement.className += ' fonts-loading';
                  
                  // Check if fonts are loaded
                  if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(function() {
                      document.documentElement.className = 
                        document.documentElement.className.replace('fonts-loading', 'fonts-loaded');
                    });
                  } else {
                    // Fallback for older browsers
                    setTimeout(function() {
                      document.documentElement.className = 
                        document.documentElement.className.replace('fonts-loading', 'fonts-loaded');
                    }, 3000);
                  }
                }
              })();
            `
          }}
        />
        
        {/* Additional favicon sizes */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png?v=5&t={Date.now()}" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png?v=5&t={Date.now()}" />
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon.png?v=5&t={Date.now()}" />
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon.png?v=5&t={Date.now()}" />
        <link rel="icon" type="image/png" sizes="256x256" href="/favicon.png?v=5&t={Date.now()}" />
        
        {/* Apple Touch Icons with cache busting */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=5&t={Date.now()}" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon.png?v=5&t={Date.now()}" />
        <link rel="apple-touch-icon" sizes="120x120" href="/apple-touch-icon.png?v=5&t={Date.now()}" />
        <link rel="apple-touch-icon" sizes="76x76" href="/apple-touch-icon.png?v=5&t={Date.now()}" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=5&t={Date.now()}" />
        
        {/* Mobile optimization */}
        <meta name="theme-color" content="#daff00" />
        <meta name="msapplication-TileColor" content="#daff00" />
        <meta name="msapplication-TileImage" content="/favicon.png?v=5&t={Date.now()}" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="The Dot Creative" />
        <link rel="manifest" href="/site.webmanifest" />
        
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
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
        <link rel="icon" href="/favicon.ico?v=5" />
        <link rel="shortcut icon" href="/favicon.ico?v=5" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=5" />
        <link rel="icon" type="image/vnd.microsoft.icon" href="/favicon.ico?v=5" />
        <meta name="msapplication-config" content="none" />
        
        {/* Performance optimizations - preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.adobe.com" />
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.adobe.com" />
        <link rel="dns-prefetch" href="https://p.typekit.net" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://prod-files-secure.s3.us-west-2.amazonaws.com" />
        
        {/* LCP Optimization - preload critical resources */}
        <link rel="preload" href="/video/hero-video-min.mp4" as="video" type="video/mp4" />
        <link rel="preload" href="/images/line.png" as="image" />
        
        {/* Adobe Fonts - Optimized loading strategy */}
        <link
          rel="preload"
          href="https://use.typekit.net/gac6jnd.css"
          as="style"
          onLoad="this.onload=null;this.rel='stylesheet'"
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://use.typekit.net/gac6jnd.css"
          />
        </noscript>
        
        {/* Advanced font loading optimization */}
        <script dangerouslySetInnerHTML={{
          __html: `
            // Optimize Adobe Fonts loading
            (function() {
              // Check if fonts are already loaded
              if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(function() {
                  document.documentElement.classList.add('fonts-loaded');
                });
              }
              
              // Preload critical font files
              const fontUrls = [
                'https://use.typekit.net/af/2c3b41/00000000000000007735c8ff/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3',
                'https://use.typekit.net/af/5c2b3a/00000000000000007735c900/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n3&v=3'
              ];
              
              fontUrls.forEach(function(url) {
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = 'font';
                link.href = url;
                link.type = 'font/woff2';
                link.crossOrigin = 'anonymous';
                document.head.appendChild(link);
              });
            })();
          `
        }} />
        
        {/* Font loading optimization to reduce CLS */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Fallback fonts to reduce CLS */
            @font-face {
              font-family: 'futura-pt-fallback';
              font-display: swap;
              src: local('Arial'), local('Helvetica'), local('sans-serif');
              size-adjust: 100%;
            }
            @font-face {
              font-family: 'ff-real-text-pro-2-fallback';
              font-display: swap;
              src: local('Georgia'), local('Times New Roman'), local('serif');
              size-adjust: 95%;
            }
            
            /* Adobe Fonts with fallback and swap */
            @font-face {
              font-family: 'futura-pt';
              font-display: swap;
              font-style: normal;
              font-weight: 400;
            }
            @font-face {
              font-family: 'ff-real-text-pro-2';
              font-display: swap;
              font-style: normal;
              font-weight: 300 400;
            }
            
            /* CSS fallback stack for better font loading */
            body {
              font-family: 'ff-real-text-pro-2', 'ff-real-text-pro-2-fallback', Georgia, 'Times New Roman', serif;
            }
            
            h1, h2, h3, h4, h5, h6 {
              font-family: 'futura-pt', 'futura-pt-fallback', Arial, Helvetica, sans-serif;
            }
            
            /* Prevent invisible text during font swap */
            .font-loading {
              font-display: swap;
            }
            
            /* Font loading states for better UX */
            html:not(.fonts-loaded) {
              font-family: 'futura-pt-fallback', Arial, Helvetica, sans-serif;
            }
            
            html:not(.fonts-loaded) body {
              font-family: 'ff-real-text-pro-2-fallback', Georgia, 'Times New Roman', serif;
            }
            
            /* Smooth transition when fonts load */
            html.fonts-loaded body {
              font-family: 'ff-real-text-pro-2', 'ff-real-text-pro-2-fallback', Georgia, 'Times New Roman', serif;
              transition: font-family 0.1s ease-in-out;
            }
            
            html.fonts-loaded h1, 
            html.fonts-loaded h2, 
            html.fonts-loaded h3, 
            html.fonts-loaded h4, 
            html.fonts-loaded h5, 
            html.fonts-loaded h6 {
              font-family: 'futura-pt', 'futura-pt-fallback', Arial, Helvetica, sans-serif;
              transition: font-family 0.1s ease-in-out;
            }
            
            /* Optimize font rendering */
            * {
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              text-rendering: optimizeLegibility;
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
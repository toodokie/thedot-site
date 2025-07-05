// app/layout.tsx
import type { Metadata } from "next";
import ConditionalHeader from '@/components/ConditionalHeader';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import "./styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  title: "The Dot Creative Agency | Web Design & Development | GTA Ontario",
  description: "Professional web design agency in Ontario, Canada. International design expertise for GTA businesses. Custom websites that convert visitors into customers.",
  keywords: "web design agency GTA, website design Ontario, professional web development Toronto, custom website design Canada, international design standards",
  icons: {
    icon: '/images/Dot Favicon.png',
  },
  
  // OpenGraph for social sharing
  openGraph: {
    title: "The Dot Creative Agency | Professional Web Design GTA",
    description: "International design expertise for GTA businesses. Custom websites that convert visitors into customers.",
    url: "https://thedotcreative.co",
    siteName: "The Dot Creative Agency",
    images: [
      {
        url: "/images/og-image.jpg",
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
    images: ["/images/og-image.jpg"]
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
      // Add social media URLs when available
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
        {/* Simple preload for Adobe Fonts - avoids hydration issues */}
        <link
          rel="preload"
          href="https://use.typekit.net/gac6jnd.css"
          as="style"
        />
        <link
          rel="stylesheet"
          href="https://use.typekit.net/gac6jnd.css"
        />
        
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
        <ConditionalHeader />
        {children}
      </body>
    </html>
  );
}
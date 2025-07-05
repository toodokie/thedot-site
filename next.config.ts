import type { NextConfig } from "next";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Allow production builds to complete even if there are TypeScript errors
  typescript: {
    ignoreBuildErrors: true,
  },
  // Skip ESLint during builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Security headers implementation
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: [
          // Prevent clickjacking attacks
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // XSS protection (legacy but still recommended)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          // Control referrer information
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // Restrict permissions for security
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()'
          },
          // Content Security Policy - optimized for Adobe Fonts, GA4, and Cloudflare Turnstile
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' *.typekit.net use.typekit.net https://www.googletagmanager.com https://www.google-analytics.com https://challenges.cloudflare.com https://apis.google.com",
              "style-src 'self' 'unsafe-inline' *.typekit.net use.typekit.net fonts.googleapis.com",
              "font-src 'self' *.typekit.net use.typekit.net fonts.gstatic.com data:",
              "img-src 'self' data: blob: *.typekit.net prod-files-secure.s3.us-west-2.amazonaws.com https://www.google-analytics.com https://www.googletagmanager.com",
              "connect-src 'self' *.typekit.net *.adobe.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://challenges.cloudflare.com",
              "frame-src 'self' https://calendar.google.com https://player.vimeo.com https://vimeo.com https://www.youtube.com https://youtube.com https://challenges.cloudflare.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join('; ')
          }
        ]
      }
    ];
  },
  
  // Configure images for external domains
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'prod-files-secure.s3.us-west-2.amazonaws.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  
  // Performance optimizations (removed optimizeCss due to compatibility issues)
  
  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  
  // Redirects for SEO migration from Webflow
  async redirects() {
    return [
      // Specific project slug mappings (old Webflow → new Next.js)
      {
        source: '/project/lending-dlya-konferencii',
        destination: '/projects/conference-landing-page',
        permanent: true,
      },
      {
        source: '/project/promo-video-dlya-konferencii',
        destination: '/projects/conference-promo-video',
        permanent: true,
      },
      {
        source: '/project/true-me',
        destination: '/projects/trueme-beauty',
        permanent: true,
      },
      {
        source: '/project/care-clinic',
        destination: '/projects/wellness-studio-care-clinic',
        permanent: true,
      },
      // Direct matches (same slug, just /project → /projects)
      {
        source: '/project/capital-3',
        destination: '/projects/capital-3',
        permanent: true,
      },
      {
        source: '/project/giardino-flower-shop',
        destination: '/projects/giardino-flower-shop',
        permanent: true,
      },
      {
        source: '/project/lido',
        destination: '/projects/lido',
        permanent: true,
      },
      // Catch-all for any other /project/* URLs → /projects/*
      {
        source: '/project/:slug*',
        destination: '/projects/:slug*',
        permanent: true,
      },
      // Old contact page redirect
      {
        source: '/contact',
        destination: '/contacts',
        permanent: true,
      },
    ];
  }
};

export default withBundleAnalyzer(nextConfig);

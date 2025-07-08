'use client';

import { useState } from 'react';
import Image from 'next/image';
import { notionImageLoader } from '@/lib/imageLoader';
import { generateBlurDataURL } from '@/lib/imageOptimization';

interface ImageWithSkeletonProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  loading?: 'lazy' | 'eager';
  sizes?: string;
  style?: React.CSSProperties;
  className?: string;
  brandColor?: string;
}

export default function ImageWithSkeleton({
  src,
  alt,
  width,
  height,
  fill = false,
  priority = false,
  loading = 'lazy',
  sizes,
  style,
  className,
  brandColor = '#faf9f6'
}: ImageWithSkeletonProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Loading skeleton */}
      {isLoading && (
        <div
          style={{
            position: fill ? 'absolute' : 'static',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(90deg, ${brandColor} 0%, #f0f0f0 50%, ${brandColor} 100%)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            fontSize: '0.875rem',
            zIndex: 1
          }}
        >
          Loading...
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div
          style={{
            position: fill ? 'absolute' : 'static',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: brandColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '0.875rem',
            zIndex: 1
          }}
        >
          Image unavailable
        </div>
      )}

      {/* Actual image */}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        fill={fill}
        priority={priority}
        loading={loading}
        sizes={sizes}
        style={{
          ...style,
          opacity: isLoading || hasError ? 0 : 1,
          transition: 'opacity 0.3s ease'
        }}
        className={className}
        placeholder="blur"
        blurDataURL={generateBlurDataURL(brandColor)}
        loader={notionImageLoader}
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* Shimmer animation CSS */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
}
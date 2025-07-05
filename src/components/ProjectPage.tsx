'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Project, ProjectMedia } from '@/types/project';
import { trackPortfolio, trackNavigation } from '@/lib/analytics';

// Video Player Component for Vimeo
function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.5 }
    );

    if (videoRef.current) {
      observer.observe(videoRef.current);
    }

    return () => {
      const currentVideo = videoRef.current;
      if (currentVideo) {
        observer.unobserve(currentVideo);
      }
    };
  }, []);

  const getVideoId = (url: string) => {
    // Check for Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(?:.*\/)?(\d+)/);
    if (vimeoMatch) {
      return { platform: 'vimeo', id: vimeoMatch[1] };
    }
    
    // Check for YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (youtubeMatch) {
      return { platform: 'youtube', id: youtubeMatch[1] };
    }
    
    return null;
  };

  const videoInfo = getVideoId(videoUrl);

  if (!videoInfo) {
    return (
      <div style={{
        width: '100%',
        aspectRatio: '16/9',
        background: 'var(--project-accent, #daff00)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#35332f'
      }}>
        Invalid video URL (supports Vimeo and YouTube)
      </div>
    );
  }

  if (hasError) {
    // Don't render anything if video fails to load
    return null;
  }

  const embedUrl = videoInfo.platform === 'vimeo' 
    ? `https://player.vimeo.com/video/${videoInfo.id}?autoplay=1&loop=1&muted=1&title=0&byline=0&portrait=0&autopause=0&background=1`
    : `https://www.youtube.com/embed/${videoInfo.id}?autoplay=1&loop=1&muted=1&controls=0&showinfo=0&rel=0&modestbranding=1&playlist=${videoInfo.id}`;

  return (
    <div ref={videoRef} style={{ 
      position: 'relative',
      width: '100%',
      aspectRatio: '16/9',
      backgroundColor: 'var(--project-background, #faf9f6)'
    }}>
      {isVisible && !hasError && (
        <iframe
          src={embedUrl}
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            border: 'none',
            zIndex: '10'
          }}
          allow="autoplay; picture-in-picture"
          allowFullScreen={true}
          onLoad={(e) => {
            // Check if iframe loaded successfully
            const iframe = e.currentTarget;
            try {
              // If we can't access the content, it might be restricted
              if (iframe.contentDocument === null) {
                console.warn('Video may be restricted or private');
              }
            } catch (error) {
              console.warn('Video access restricted:', error);
              setHasError(true);
            }
          }}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}

interface ProjectPageProps {
  project: Project;
  relatedProjects?: Project[];
  nextProject?: Project;
}

export default function ProjectPage({ project, nextProject }: ProjectPageProps) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [seeMoreHover, setSeeMoreHover] = useState(false);
  const [talkToUsHover, setTalkToUsHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Track project view
    trackPortfolio.projectView(project.slug, project.title);
    
    const root = document.documentElement;
    if (project.brandColors) {
      root.style.setProperty('--project-primary', project.brandColors.primary);
      root.style.setProperty('--project-secondary', project.brandColors.secondary);
      root.style.setProperty('--project-accent', project.brandColors.accent || project.brandColors.primary);
      root.style.setProperty('--project-background', project.brandColors.background);
    }
    
    return () => {
      // Clean up CSS custom properties when component unmounts
      root.style.removeProperty('--project-primary');
      root.style.removeProperty('--project-secondary');
      root.style.removeProperty('--project-accent');
      root.style.removeProperty('--project-background');
    };
  }, [project.brandColors]);

  const handleVideoPlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsVideoPlaying(true);
    }
  };

  return (
    <div className="project-page" style={{
      background: 'var(--project-background, #faf9f6)',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Hero Section - Capital 3 Style */}
      <section style={{
        position: 'relative',
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '4rem 2.5rem 6rem',
        maxWidth: '120rem',
        margin: '0 auto',
        boxSizing: 'border-box'
      }}>
        {/* Top Row - 3 column structure */}
        <div style={{
          display: 'flex',
          width: '100%',
          alignItems: 'flex-start' // Align all items to the top
        }} className="responsive-flex">
          {/* Column 1: Project Title - 30% */}
          <div style={{
            width: '30%',
            display: 'flex',
            alignItems: 'flex-start' // Align title to top
          }} className="responsive-column tablet-col-40">
            <h1 style={{
              fontFamily: 'futura-pt, sans-serif',
              fontWeight: 400,
              fontSize: 'clamp(3rem, 8vw, 4.75rem)',
              textTransform: 'uppercase',
              color: '#35332f',
              margin: 0,
              lineHeight: 1,
              letterSpacing: '-0.02em'
            }} className="responsive-title tablet-title">
              {project.title}
            </h1>
          </div>

          {/* Column 2: Tech Stack - 50% */}
          <div style={{
            width: '50%',
            display: 'flex',
            alignItems: 'flex-start' // Align tech stack to top
          }} className="responsive-column tablet-col-45">
            {project.tools && (
              <p style={{
                fontFamily: 'ff-real-text-pro-2, sans-serif',
                fontWeight: 100,
                fontSize: 'clamp(0.875rem, 2vw, 1.0625rem)',
                color: '#35332f',
                margin: 0,
                lineHeight: 1.2,
                textAlign: 'left'
              }} className="responsive-body">
                {project.tools.join(', ')}
              </p>
            )}
          </div>

          {/* Column 3: Close Button - 20% */}
          <div style={{
            width: '20%',
            alignItems: 'flex-start' // Align close icon to top
          }} className="responsive-column tablet-col-15">
            <Link href="/" className="mobile-close-absolute" style={{
              background: 'none',
              border: 'none',
              color: '#35332f',
              textDecoration: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              transition: 'transform 0.3s ease',
              display: 'block'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M6 6L26 26M26 6L6 26" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </Link>
          </div>
        </div>

        {/* Bottom Row - Same 3 column structure */}
        <div style={{
          display: 'flex',
          width: '100%'
        }} className="responsive-flex bottom-row-mobile">
          {/* Column 1: Year - 30% */}
          <div style={{
            width: '30%',
            display: 'flex',
            alignItems: 'flex-end'
          }} className="responsive-column tablet-col-40">
            {project.year && (
              <p style={{
                fontFamily: 'futura-pt, sans-serif',
                fontWeight: 300,
                fontSize: 'clamp(1.25rem, 3vw, 1.6875rem)',
                color: '#35332f',
                margin: 0,
                lineHeight: 1,
                textAlign: 'left'
              }} className="responsive-year">
                {project.year}
              </p>
            )}
          </div>

          {/* Column 2: Brief Description - 50% */}
          <div style={{
            width: '50%',
            display: 'flex',
            alignItems: 'flex-end'
          }} className="responsive-column tablet-col-45">
            <p style={{
              fontFamily: 'ff-real-text-pro-2, sans-serif',
              fontWeight: 100,
              fontSize: 'clamp(0.875rem, 2vw, 1.0625rem)',
              color: '#35332f',
              margin: 0,
              lineHeight: 1.3,
              textAlign: 'left'
            }} className="responsive-body">
              {project.shortDescription || project.description}
            </p>
          </div>

          {/* Column 3: Arrow - 20% */}
          <div style={{
            width: '20%',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'flex-end'
          }} className="responsive-column tablet-col-15 hide-mobile">
            <div style={{
              cursor: 'pointer'
            }}>
              <Image 
                src="/images/arrow.png" 
                alt="Scroll down" 
                width={62} 
                height={62}
                style={{
                  opacity: 1,
                  transform: 'rotate(90deg)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom Border */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '8px'
        }}>
          {/* 1px line above line.png */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: 'var(--project-primary, #35332f)'
          }}></div>
          {/* line.png positioned below the 2px line */}
          <Image 
            src="/images/line.png" 
            alt="Divider line" 
            width={1920}
            height={7}
            style={{ 
              width: '100%', 
              height: 'auto', 
              objectFit: 'cover',
              position: 'absolute',
              top: '1px'
            }}
          />
        </div>
      </section>

      {/* Main Demo Section - Keep if you have heroVideo/heroImage */}
      {(project.heroVideo || project.heroImage) && (
        <section style={{
          padding: 0,
          background: 'var(--project-background, #faf9f6)'
        }}>
          <div style={{
            maxWidth: '120rem',
            margin: '0 auto',
            position: 'relative',
            aspectRatio: '16/9'
          }}>
            {project.heroVideo && !isVideoPlaying ? (
              <div
                onClick={handleVideoPlay}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Image
                  src={project.heroImage || project.images[0]}
                  alt={project.title}
                  fill
                  style={{ objectFit: 'cover' }}
                  priority
                />
                <button style={{
                  position: 'absolute',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.3s ease',
                  zIndex: 2
                }}>
                  <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                    <circle cx="30" cy="30" r="30" fill="white" fillOpacity="0.9"/>
                    <path d="M23 20L37 30L23 40V20Z" fill="#35332f"/>
                  </svg>
                </button>
              </div>
            ) : project.heroVideo && isVideoPlaying ? (
              <video
                ref={videoRef}
                controls
                poster={project.heroImage || project.images[0]}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              >
                <source src={project.heroVideo} type="video/mp4" />
              </video>
            ) : (
              <Image
                src={project.heroImage || project.images[0]}
                alt={project.title}
                fill
                style={{ objectFit: 'cover' }}
                priority
              />
            )}
          </div>
        </section>
      )}

      {/* About Section - 3 Column Structure */}
      <section style={{
        padding: '6rem 2.5rem',
        maxWidth: '120rem',
        margin: '0 auto',
        position: 'relative',
        background: 'var(--project-background, #faf9f6)',
        display: 'flex',
        flexDirection: 'row',
        width: '100%'
      }} className="responsive-container responsive-flex about-section">
        {/* Top 1px Border */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'var(--project-primary, #35332f)'
        }}>
        </div>

        {/* Column 1: ABOUT */}
        <div className="responsive-column" style={{
          flex: '0 0 57%',
          minWidth: 0,
          boxSizing: 'border-box'
        }}>
          <h2 style={{
            
            fontFamily: 'ff-real-text-pro-2, sans-serif',
            fontWeight: 400,
            fontSize: 'clamp(1.5rem, 4vw, 2.375rem)',
            textTransform: 'uppercase',
            color: '#35332f',
            margin: 0,
            lineHeight: 1.2
          }}>
            ABOUT
          </h2>
        </div>

        {/* Column 2: Description from Notion */}
        <div className="responsive-column mobile-about-full" style={{
          flex: '0 0 28%',
          minWidth: 0,
          boxSizing: 'border-box',
          padding: '0 1.5rem'
        }}>
          <div style={{
            
            fontFamily: 'ff-real-text-pro-2, sans-serif',
            fontWeight: 400,
            fontSize: 'clamp(1.125rem, 3vw, 1.6875rem)',
            color: '#35332f',
            lineHeight: 1.4,
            textAlign: 'justify'
          }} className="tablet-about-text">
            {project.description || 'Project description...'}
          </div>
        </div>

        {/* Column 3: About Tech */}
        <div className="responsive-column" style={{
          flex: '0 0 15%',
          minWidth: 0,
          boxSizing: 'border-box',
          textAlign: 'right'
        }}>
          <p style={{
            
            fontFamily: 'futura-pt, sans-serif',
            fontWeight: 300,
            fontSize: 'clamp(0.875rem, 2vw, 1rem)',
            color: '#35332f',
            lineHeight: 1.5,
            textAlign: 'justify',
            margin: 0
          }}>
            {project.aboutTech || 'About Tech information...'}
          </p>
        </div>

        {/* Bottom 2px Border */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'var(--project-primary, #35332f)'
        }}>
        </div>
      </section>

      {/* Video Section - Between About and Images */}
      {(project as { videoUrl?: string }).videoUrl && (
        <section style={{
          padding: '6rem 2.5rem',
          maxWidth: '120rem',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'center',
          background: 'var(--project-background, #faf9f6)',
          position: 'relative',
          zIndex: 1
        }} className="responsive-container">
          <div style={{
            width: '80vw',
            maxWidth: '100rem',
            border: '1px solid #35332f',
            borderRadius: '0',
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: 'rgb(250, 249, 246)',
            isolation: 'isolate'
          }} className="video-responsive">
            <VideoPlayer videoUrl={(project as { videoUrl: string }).videoUrl} />
          </div>
        </section>
      )}

      {/* Gallery Section - Keep your existing functionality */}
      <section style={{ 
        background: 'var(--project-background, #faf9f6)',
        position: 'relative'
      }}>
        {(project.gallery || project.images).map((item, index) => {
          if (typeof item === 'string') {
            return (
              <div key={index} style={{ width: '100%' }}>
                <Image
                  src={item}
                  alt={project.title}
                  width={1200}
                  height={800}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  priority={index < 2}
                />
              </div>
            );
          } else {
            return <MediaItem key={index} media={item} index={index} />;
          }
        })}
        
        {/* 1px Border */}
        <div style={{
          height: '1px',
          background: 'var(--project-primary, #35332f)'
        }}>
        </div>

        {/* Bottom Border before See More */}
        <div style={{
          position: 'relative',
          height: '8px',
          width: '100%'
        }}>
          {/* 1px line above line.png */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: 'var(--project-primary, #35332f)'
          }}></div>
          {/* line.png positioned below the 2px line */}
          <Image 
            src="/images/line.png" 
            alt="Divider line" 
            width={1920}
            height={7}
            style={{ 
              width: '100%', 
              height: 'auto', 
              objectFit: 'cover',
              position: 'absolute',
              top: '1px'
            }}
          />
        </div>
      </section>

      {/* See More Section - Capital 3 Style */}
      <section style={{
        background: '#ffffff',
        padding: '2rem 2.5rem', // Restored padding for desktop/tablet
        display: 'flex',
        alignItems: 'flex-start',
        maxWidth: '100vw', // Full viewport width
        width: '100%', // Allow padding to adjust width
        overflow: 'hidden' // Prevent overflow
      }} className="responsive-container see-talk-columns">
        {/* See More - Left column, left-aligned */}
        <div className="see-more-column">
          <div 
            onMouseEnter={() => setSeeMoreHover(true)}
            onMouseLeave={() => setSeeMoreHover(false)}
            style={{
              cursor: 'pointer'
            }}
            className="hover-italic"
          >
            <Link
              href={nextProject ? `/projects/${nextProject.slug}` : '/'}
              onClick={() => {
                if (nextProject) {
                  trackPortfolio.projectNavigation(project.slug, nextProject.slug);
                }
              }}
              style={{
                fontFamily: 'futura-pt, sans-serif',
                fontWeight: 300,
                fontSize: 'clamp(1.5rem, 6vw, 7rem)', // Adjusted for smaller screens
                color: '#35332f',
                margin: 0,
                lineHeight: 1,
                fontStyle: seeMoreHover ? 'italic' : 'normal',
                textDecoration: 'none',
                display: 'block'
              }}
            >
              SEE<br />MORE
            </Link>
          </div>
        </div>

        {/* Talk to Us - Right column, right-aligned */}
        <div className="talk-to-us-column">
          <div 
            onMouseEnter={() => setTalkToUsHover(true)}
            onMouseLeave={() => setTalkToUsHover(false)}
            style={{
              cursor: 'pointer'
            }}
            className="hover-italic"
          >
            <Link
              href="/contacts"
              onClick={() => {
                trackNavigation.ctaClick('Talk to Us', 'Project Page', '/contacts');
              }}
              style={{
                fontFamily: 'futura-pt, sans-serif',
                fontWeight: 300,
                fontSize: 'clamp(1rem, 4vw, 5.4rem)', // Adjusted for smaller screens
                color: '#35332f',
                margin: 0,
                lineHeight: 1,
                fontStyle: talkToUsHover ? 'italic' : 'normal',
                textDecoration: 'none',
                display: 'block'
              }}
            >
              TALK<br />TO US
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// Keep your existing MediaItem Component
function MediaItem({ media, index = 0 }: { media: ProjectMedia; index?: number }) {
  if (media.type === 'video') {
    return (
      <div style={{ width: '100%' }}>
        <video controls poster={media.poster} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <source src={media.src} type="video/mp4" />
        </video>
        {media.caption && (
          <p style={{
            textAlign: 'center',
            fontSize: '0.875rem',
            margin: '1rem 0 0 0',
            opacity: 0.7,
            fontStyle: 'italic'
          }}>
            {media.caption}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <Image
        src={media.src}
        alt={media.alt || ''}
        width={1200}
        height={800}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        priority={index < 2}
      />
      {media.caption && (
        <p style={{
          textAlign: 'center',
          fontSize: '0.875rem',
          margin: '1rem 0 0 0',
          opacity: 0.7,
          fontStyle: 'italic'
        }}>
          {media.caption}
        </p>
      )}
    </div>
  );
}
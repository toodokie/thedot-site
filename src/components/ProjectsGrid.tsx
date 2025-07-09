'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Project } from '@/types/project';
import { trackPortfolio } from '@/lib/analytics';
import { notionImageLoader } from '@/lib/imageLoader';
import { generateBlurDataURL } from '@/lib/imageOptimization';
import ImageWithSkeleton from './ImageWithSkeleton';

interface ProjectsGridProps {
  projects: Project[];
}

export default function ProjectsGrid({ projects }: ProjectsGridProps) {
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    animatedElements.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      animatedElements.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, []);

  return (
    <section
      className="animate-on-scroll"
      style={{
        background: 'var(--background)',
        paddingTop: '6rem',
        paddingRight: 0,
        paddingBottom: '4rem',
        paddingLeft: 0,
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div
        className="animate-on-scroll"
        style={{
          maxWidth: '120rem',
          marginTop: 0,
          marginRight: 'auto',
          marginLeft: 'auto',
          marginBottom: 'rem',
          paddingTop: 0,
          paddingRight: '2.5rem',
          paddingBottom: '4rem',
          paddingLeft: '2.5rem',
          textAlign: 'left',
          boxSizing: 'border-box'
        }}
      >
        <h2 className="section-title">Selected Projects</h2>
        <h3 className="section-description">
          Explore our diverse range of projects designed to meet all your brand&apos;s creative and marketing needs.
        </h3>
      </div>

      {/* Titles Grid */}
      <div
        className="animate-on-scroll"
        style={{
          maxWidth: '120rem',
          marginTop: 0,
          marginRight: 'auto',
          marginLeft: 'auto',
          marginBottom: '0.1rem',
          paddingTop: 0,
          paddingRight: '2.5rem',
          paddingBottom: 0,
          paddingLeft: '2.5rem'
        }}
      >
        <div className="projects-titles-grid">
          <div className="projects-title-column">Image/Tools</div>
          <div className="projects-title-column">Project Name/Type</div>
          <div className="projects-title-column projects-hover-indicator">
            <span>HOVER ON</span>
            <div className="projects-dot"></div>
          </div>
        </div>
      </div>

      {/* Divider with line.png */}
      <div
        className="animate-on-scroll"
        style={{
          width: '100vw',
          marginTop: 0,
          marginRight: 0,
          marginBottom: '3rem',
          marginLeft: 0,
          position: 'relative'
        }}
      >
        <div style={{ position: 'relative', height: '8px', width: '100%' }}>
          {/* 1px line above line.png */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: '#35332f'
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
      </div>

      {/* Projects List */}
      <div
        className="animate-on-scroll"
        style={{
          maxWidth: '120rem',
          marginTop: 0,
          marginRight: 'auto',
          marginLeft: 'auto',
          paddingTop: 0,
          paddingRight: '2.5rem',
          paddingBottom: 0,
          paddingLeft: '2.5rem'
        }}
      >
        {projects.length > 0 ? (
          projects.map((project, index) => (
            <ProjectListItem
              key={project.slug || `project-${index}`}
              project={project}
              index={index}
            />
          ))
        ) : (
          <div style={{
            textAlign: 'center',
            paddingTop: '4rem',
            paddingBottom: '4rem',
            paddingLeft: 0,
            paddingRight: 0,
            opacity: 0.6,
            color: 'var(--foreground)',
            fontFamily: 'ff-real-text-pro-2, sans-serif',
            fontSize: '1.125rem'
          }}>
            <p>No projects found.</p>
          </div>
        )}
      </div>

      {/* Tools Section */}
      
    </section>
  );
}

interface ProjectListItemProps {
  project: Project;
  index: number;
}

function ProjectListItem({ project }: ProjectListItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Debug logging (removed for production)

  return (
    <>
      <Link
        href={project.slug ? `/projects/${project.slug}` : '#'}
        className="animate-on-scroll project-list-link"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          if (project.slug) {
            trackPortfolio.projectView(project.slug, project.title);
          }
        }}
      >
        {/* Two-Column Layout - Desktop | Stacked - Mobile */}
        <div className="project-card-layout">
          {/* Left Column: Image + Tech Stack */}
          <div className="project-image-section">
            <div className="project-image-container">
              <ImageWithSkeleton
                src={project.heroImage || (project.images && project.images.length > 0 ? project.images[0] : '/images/example1.jpg')}
                alt={project.title}
                fill
                style={{ 
                  objectFit: 'cover',
                  transition: 'opacity 0.3s ease',
                  opacity: isHovered ? 0.8 : 1
                }}
                sizes="(max-width: 768px) 100vw, 50vw"
                loading="lazy"
                brandColor={project.brandColors?.primary || '#faf9f6'}
              />
            </div>
            {project.tools && project.tools.length > 0 && (
              <div className="project-tech-stack">
                {project.tools.slice(0, 3).map((tool, toolIndex) => (
                  <span key={toolIndex} className="project-tech-tag">
                    {tool}{toolIndex < Math.min(project.tools!.length, 3) - 1 ? ' · ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Title + Description */}
          <div className="project-content-section">
            <h4 className="project-title">
              {project.title || 'Untitled Project'}
            </h4>
            <p className="project-description">
              {project.shortDescription || (project.description ? project.description.substring(0, 120) + '...' : 'No description available')}
            </p>
          </div>
        </div>
      </Link>
    </>
  );
}


// src/types/project.ts

// Your existing interface (keep for backward compatibility)
export interface CaseData {
  slug: string;
  title: string;
  description: string;
  images: string[];
}

// Enhanced interface
export interface ProjectMedia {
  type: 'image' | 'video';
  src: string;
  alt?: string;
  caption?: string;
  poster?: string; // for videos
}

export interface ProjectDetails {
  label: string;
  value: string;
}

export interface Project {
  // Keep your existing fields
  slug: string;
  title: string;
  description: string;
  images: string[];
  
  // Enhanced fields (all optional for backward compatibility)
  subtitle?: string;
  year?: string;
  tools?: string[];
  category?: string;
  
  // Visual branding
  brandColors?: {
    primary: string;
    secondary: string;
    accent?: string;
    background: string;
  };
  
  // Enhanced content
  heroImage?: string;
  heroVideo?: string;
  videoUrl?: string;  // ← ADD THIS LINE HERE
  shortDescription?: string;
  
  // About section
  aboutTitle?: string;
  aboutDescription?: string;
  aboutTech?: string;
  projectDetails?: ProjectDetails[];
  
  // Enhanced media gallerylo
  gallery?: ProjectMedia[];
  
  // SEO
  seoTitle?: string;
  seoDescription?: string;
  
  // Status
  featured?: boolean;
  published?: boolean;
}

// Helper function to convert your existing CaseData to Project
export function caseDataToProject(caseData: CaseData): Project {
  return {
    ...caseData,
    heroImage: caseData.images[0] || '/images/placeholder.jpg',
    shortDescription: caseData.description,
    aboutDescription: caseData.description,
    aboutTitle: "About",
    gallery: caseData.images.map(src => ({
      type: 'image' as const,
      src,
      alt: caseData.title
    })),
    brandColors: {
      primary: '#3d3c44',
      secondary: '#f2f2f2',
      background: 'linear-gradient(135deg, #f2f2f2 0%, #3d3c44 100%)'
    },
    published: true,
    featured: false,
    year: '2025',
    category: 'Portfolio',
    subtitle: 'Project'
  };
}
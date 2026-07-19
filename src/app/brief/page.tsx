import type { Metadata } from 'next';
import ProjectBrief from '@/components/ProjectBrief';

export const metadata: Metadata = {
  title: "Start Your Project | Project Brief | The Dot Creative Agency",
  description: "Tell us about your web design or branding project. Get a customized project brief and quote for your Ontario business. Simple process, fast response.",
  keywords: "project brief, web design quote, branding consultation, Ontario web agency, start a project, business website quote",
  
  openGraph: {
    title: "Start Your Project with The Dot Creative",
    description: "Share your project details and get a customized brief. Web design, branding, and business integration services for Ontario SMBs.",
    url: "https://www.thedotcreative.co/brief",
    siteName: "The Dot Creative Agency",
    locale: "en_CA",
    type: "website",
    images: [
      {
        url: "/images/The Dot Poster.webp",
        width: 1200,
        height: 630,
        alt: "Start Your Project - The Dot Creative Agency"
      }
    ]
  },
  
  twitter: {
    card: "summary_large_image",
    title: "Start Your Project with The Dot Creative",
    description: "Share your project details and get a customized brief. Web design, branding, and business integration services for Ontario SMBs.",
    images: ["/images/The Dot Poster.webp"]
  },
  
  alternates: {
    canonical: "/brief"
  }
};

export default function BriefPage() {
  return <ProjectBrief />;
}
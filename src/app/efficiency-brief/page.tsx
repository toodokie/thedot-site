import type { Metadata } from 'next';
import EfficiencyBrief from '@/components/EfficiencyBrief';

export const metadata: Metadata = {
  title: "Business & Website Efficiency Brief | The Dot Creative Agency",
  description: "Stop guessing. This 10-minute brief is the first step to pinpointing the exact issues on your website and in your workflow that are costing you time and money.",
  keywords: "efficiency brief, website audit, business workflow, free consultation, Ontario web agency",
  robots: "noindex, nofollow",
  
  openGraph: {
    title: "Get Your Free Business & Website Efficiency Brief",
    description: "Stop guessing. This 10-minute brief is the first step to pinpointing the exact issues on your website and in your workflow that are costing you time and money.",
    url: "https://www.thedotcreative.co/efficiency-brief",
    siteName: "The Dot Creative Agency",
    locale: "en_CA",
    type: "website",
    images: [
      {
        url: "/images/The Dot Poster.webp",
        width: 1200,
        height: 630,
        alt: "Business & Website Efficiency Brief - The Dot Creative Agency"
      }
    ]
  },
  
  twitter: {
    card: "summary_large_image",
    title: "Get Your Free Business & Website Efficiency Brief",
    description: "Stop guessing. This 10-minute brief is the first step to pinpointing the exact issues on your website and in your workflow that are costing you time and money.",
    images: ["/images/The Dot Poster.webp"]
  },
  
  alternates: {
    canonical: "/efficiency-brief"
  }
};

export default function EfficiencyBriefPage() {
  return <EfficiencyBrief />;
}
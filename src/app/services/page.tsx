import type { Metadata } from 'next';
import ServicesPage from '@/components/ServicesPage';

export const metadata: Metadata = {
  title: "Connected Business Solutions | Web Design + Systems Integration | The Dot Creative",
  description: "From $5,500: Websites that connect to QuickBooks, CRMs, booking systems. Plus strategic design, AODA compliance, and ongoing optimization for Ontario SMBs.",
  keywords: "business systems integration, web design Ontario, QuickBooks integration, CRM integration, AODA compliance, website automation, Ontario SMB solutions",
  
  openGraph: {
    title: "Stop Paying for Tools That Don't Talk to Each Other",
    description: "Custom integration solutions for Ontario businesses. Connect your CRM, accounting, booking systems through one strategic website. AODA compliant.",
    url: "https://thedotcreative.co/services",
    siteName: "The Dot Creative Agency",
    locale: "en_CA",
    type: "website",
    images: [
      {
        url: "/images/The Dot Poster.webp",
        width: 1200,
        height: 630,
        alt: "The Dot Creative Agency - Connected Business Solutions"
      }
    ]
  },
  
  twitter: {
    card: "summary_large_image",
    title: "Stop Paying for Tools That Don't Talk to Each Other",
    description: "Custom integration solutions for Ontario businesses. Connect your CRM, accounting, booking systems through one strategic website.",
    images: ["/images/The Dot Poster.webp"]
  },
  
  alternates: {
    canonical: "https://thedotcreative.co/services"
  }
};

export default function Services() {
  return <ServicesPage />;
}
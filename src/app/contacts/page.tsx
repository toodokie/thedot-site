import type { Metadata } from "next";
import ContactPage from '@/components/ContactPage';

export const metadata: Metadata = {
  title: 'Contact The Dot Creative Agency | Web Design Consultation GTA',
  description: 'Get a free website consultation from our GTA design agency. International design expertise for Ontario businesses. Contact us for custom web solutions.',
  keywords: 'contact web design agency GTA, free website consultation Toronto, web design consultation Ontario, professional web design services',
  
  openGraph: {
    title: 'Contact The Dot Creative Agency | Free Website Consultation',
    description: 'Get a free website consultation from our GTA design agency. International design expertise for Ontario businesses.',
    url: 'https://thedotcreative.co/contacts',
    siteName: 'The Dot Creative Agency',
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Contact The Dot Creative Agency'
      }
    ],
    locale: 'en_CA',
    type: 'website'
  },
  
  twitter: {
    card: 'summary_large_image',
    title: 'Contact The Dot Creative Agency | Free Website Consultation',
    description: 'Get a free website consultation from our GTA design agency. International design expertise for Ontario businesses.',
    images: ['/images/og-image.jpg']
  },
  
  robots: {
    index: true,
    follow: true
  }
};

export default function Contact() {
  return <ContactPage />;
}
  
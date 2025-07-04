// src/components/HomePage.tsx (Server Component)
import { getAllProjects } from '@/lib/projects';
import Hero from '@/components/Hero';
import WelcomeSection from '@/components/WelcomeSection';
import ServicesSection from '@/components/ServicesSection';
import ProjectsGrid from '@/components/ProjectsGrid';
import ClientAnimations from './ClientAnimations';
import BoutiqueSection from '@/components/BoutiqueSection';
import QuoteSection from '@/components/QuoteSection';
import Footer from '@/components/Footer';


export default async function HomePage() {
  const projects = await getAllProjects();
  
  return (
    <>
      <ClientAnimations />
      <Hero />
      <WelcomeSection />
      <BoutiqueSection />
      <ServicesSection />
      <ProjectsGrid projects={projects} />
      <QuoteSection />
      <Footer />
    </>
  );
}
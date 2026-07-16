// src/components/HomePage.tsx (Server Component)
import { getAllProjects } from '@/lib/projects';
import HeroContent from '@/components/HeroContent';
import HeroVideoLoader from '@/components/Hero';
import WelcomeSection from '@/components/WelcomeSection';
import ServicesSection from '@/components/ServicesSection';
import LatestFromJournal from '@/components/LatestFromJournal';
import ConversionDiagnosticTool from '@/components/ConversionDiagnosticTool';
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
      <HeroContent />
      <HeroVideoLoader />
      <WelcomeSection />
      <BoutiqueSection />
      <LatestFromJournal />
      <ServicesSection />
      <ConversionDiagnosticTool />
      <ProjectsGrid projects={projects} />
      <QuoteSection />
      <Footer />
    </>
  );
}
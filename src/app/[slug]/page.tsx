import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProjectBySlug, getRelatedProjects, generateProjectMetadata, getProjectSlugs, getNextProject } from '@/lib/projects';
import ProjectPage from '@/components/ProjectPage';

interface PortfolioPageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Generate static paths for all projects
export async function generateStaticParams() {
  const slugs = await getProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Generate metadata for SEO
export async function generateMetadata({ params }: PortfolioPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  
  if (!project) {
    return {
      title: 'Project Not Found | The Dot Creative',
      description: 'The requested project could not be found.',
    };
  }
  
  return generateProjectMetadata(project);
}

export default async function PortfolioPageRoute({ params }: PortfolioPageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  
  if (!project) {
    notFound();
  }
  
  const relatedProjects = await getRelatedProjects(slug, 3);
  const nextProject = await getNextProject(slug);
  
  return <ProjectPage project={project} relatedProjects={relatedProjects} nextProject={nextProject} />;
}

// Optional: Add revalidation for ISR if using dynamic data
export const revalidate = 3600; // Revalidate every hour

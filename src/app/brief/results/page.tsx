'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import BriefResults from '../../../components/BriefResults';
import Footer from '../../../components/Footer';

// Your existing component logic - exactly the same!
function BriefResultsContent() {
  const searchParams = useSearchParams();
  const [briefData, setBriefData] = useState<{
    formType: 'website' | 'graphic' | 'photo';
    leadData: { name: string; email: string; };
    briefData: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    const dataParam = searchParams.get('data');
    if (dataParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(dataParam));
        setBriefData(decoded);
      } catch (error) {
        console.error('Failed to parse brief data:', error);
      }
    }
  }, [searchParams]);

  if (!briefData) {
    return (
      <div className="dot_body">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          fontFamily: 'futura-pt, sans-serif',
          fontSize: '24px',
          color: '#35332f'
        }}>
          Loading your brief results...
        </div>
      </div>
    );
  }

  return (
    <div className="dot_body">
      <BriefResults 
        formType={briefData.formType}
        leadData={briefData.leadData}
        briefData={briefData.briefData}
      />
      <Footer />
    </div>
  );
}

// Main component with Suspense wrapper (minimal change!)
export default function BriefResultsPage() {
  return (
    <Suspense fallback={
      <div className="dot_body">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          fontFamily: 'futura-pt, sans-serif',
          fontSize: '24px',
          color: '#35332f'
        }}>
          Loading your brief results...
        </div>
      </div>
    }>
      <BriefResultsContent />
    </Suspense>
  );
}
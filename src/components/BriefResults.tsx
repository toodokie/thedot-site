'use client';

import { useState } from 'react';

interface BriefData {
  [key: string]: string | boolean | undefined;
  'sphere-2'?: string;
  'sphere-3'?: string;
  company?: string;
  briefId?: string | null;
  'company-size'?: string;
  'decision-level'?: string;
  'project-urgency'?: string;
  'how-did-you-hear'?: string;
  'audience-2'?: string;
  'audience-3'?: string;
  'stand-out-2'?: string;
  'stand-out-3'?: string;
  'site-type'?: string;
  'current-website'?: string;
  'pages-per-site-2'?: string;
  'website-challenge'?: string;
  'success-metrics'?: string;
  'built-in-elements-catalog'?: boolean;
  'built-in-elements-cart'?: boolean;
  'built-in-elements-cart-payments'?: boolean;
  'built-in-elements-crm'?: boolean;
  'built-in-elements-form'?: boolean;
  'overall-site-style-2'?: string;
  'assets-creation'?: string;
  'deadline-date-2'?: string;
  'project-budjet-2'?: string;
  'Services-Required'?: string;
  'brand-maturity'?: string;
  'usage-timeline'?: string;
  'internal-resources'?: string;
  'Desired-Style'?: string;
  'Preferred-Colors'?: string;
  'Audience-Message'?: string;
  'File-Formats'?: string;
  'Special-elements'?: string;
  'Call-to-Action'?: string;
  'photo-service-type'?: string;
  'content-library'?: string;
  'distribution-channels'?: string;
  'production-scale'?: string;
  'project-purpose'?: string;
  'shooting-location'?: string;
  'style-preferences'?: string;
  'video-resolution'?: string;
  'audio-requirements'?: string;
  'editing-style'?: string;
  'duration'?: string;
  'deadline-date-photo'?: string;
  'project-budjet-photo'?: string;
}

interface BriefResultsProps {
  formType: 'website' | 'graphic' | 'photo';
  briefData: BriefData;
  leadData: {
    name: string;
    email: string;
  };
}

export default function BriefResults({ formType, briefData, leadData }: BriefResultsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ type: string; status: 'success' | 'error' } | null>(null);

  const generateBriefSummary = () => {
    const sections = [];
    
    if (formType === 'website') {
      sections.push(
        <div key="summary" style={styles.summarySection}>
          <h3 style={styles.sectionTitle}>Website Development Brief Summary</h3>
          
          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Business Overview</h4>
            <p style={styles.summaryText}>
              <strong>Company:</strong> {briefData['sphere-2'] || 'Not specified'}<br/>
              <strong>Company Size:</strong> {briefData['company-size'] || 'Not specified'}<br/>
              <strong>Decision Level:</strong> {briefData['decision-level'] || 'Not specified'}<br/>
              <strong>Project Urgency:</strong> {briefData['project-urgency'] || 'Not specified'}<br/>
              <strong>How They Found Us:</strong> {briefData['how-did-you-hear'] || 'Not specified'}<br/>
              <strong>Target Audience:</strong> {briefData['audience-2'] || 'Not specified'}<br/>
              <strong>Competitive Edge:</strong> {briefData['stand-out-2'] || 'Not specified'}
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Website Requirements</h4>
            <p style={styles.summaryText}>
              <strong>Website Type:</strong> {briefData['site-type'] || 'Not specified'}<br/>
              <strong>Current Website:</strong> {briefData['current-website'] || 'Not specified'}<br/>
              <strong>Number of Pages:</strong> {briefData['pages-per-site-2'] || 'Not specified'}<br/>
              <strong>Biggest Challenge:</strong> {briefData['website-challenge'] || 'Not specified'}<br/>
              <strong>Success Metrics:</strong> {briefData['success-metrics'] || 'Not specified'}<br/>
              <strong>Key Features:</strong> {
                [
                  briefData['built-in-elements-catalog'] && 'Product Catalog',
                  briefData['built-in-elements-cart'] && 'Online Cart',
                  briefData['built-in-elements-cart-payments'] && 'Online Payments',
                  briefData['built-in-elements-crm'] && 'CRM',
                  briefData['built-in-elements-form'] && 'Contact Forms'
                ].filter(Boolean).join(', ') || 'Not specified'
              }
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Design Preferences</h4>
            <p style={styles.summaryText}>
              <strong>Style:</strong> {briefData['overall-site-style-2'] || 'Not specified'}<br/>
              <strong>Visual Content Needed:</strong> {briefData['assets-creation'] || 'Not specified'}
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Project Details</h4>
            <p style={styles.summaryText}>
              <strong>Timeline:</strong> {briefData['deadline-date-2'] || 'Not specified'}<br/>
              <strong>Budget:</strong> {briefData['project-budjet-2'] || 'Not specified'}
            </p>
          </div>
        </div>
      );
    } else if (formType === 'graphic') {
      sections.push(
        <div key="summary" style={styles.summarySection}>
          <h3 style={styles.sectionTitle}>Graphic Design Brief Summary</h3>
          
          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Business Overview</h4>
            <p style={styles.summaryText}>
              <strong>Company:</strong> {briefData['sphere-2'] || 'Not specified'}<br/>
              <strong>Company Size:</strong> {briefData['company-size'] || 'Not specified'}<br/>
              <strong>Decision Level:</strong> {briefData['decision-level'] || 'Not specified'}<br/>
              <strong>Project Urgency:</strong> {briefData['project-urgency'] || 'Not specified'}<br/>
              <strong>How They Found Us:</strong> {briefData['how-did-you-hear'] || 'Not specified'}<br/>
              <strong>Target Audience:</strong> {briefData['audience-2'] || 'Not specified'}<br/>
              <strong>Competitive Edge:</strong> {briefData['stand-out-2'] || 'Not specified'}
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Design Requirements</h4>
            <p style={styles.summaryText}>
              <strong>Service Type:</strong> {briefData['Services-Required'] || 'Not specified'}<br/>
              <strong>Brand Maturity:</strong> {briefData['brand-maturity'] || 'Not specified'}<br/>
              <strong>Usage Timeline:</strong> {briefData['usage-timeline'] || 'Not specified'}<br/>
              <strong>Internal Resources:</strong> {briefData['internal-resources'] || 'Not specified'}<br/>
              <strong>Desired Style:</strong> {briefData['Desired-Style'] || 'Not specified'}<br/>
              <strong>Color Preferences:</strong> {briefData['Preferred-Colors'] || 'Not specified'}<br/>
              <strong>Primary Message:</strong> {briefData['Audience-Message'] || 'Not specified'}
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Technical Specifications</h4>
            <p style={styles.summaryText}>
              <strong>File Formats:</strong> {briefData['File-Formats'] || 'Not specified'}<br/>
              <strong>Special Elements:</strong> {briefData['Special-elements'] || 'Not specified'}<br/>
              <strong>Call to Action:</strong> {briefData['Call-to-Action'] || 'Not specified'}
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Project Details</h4>
            <p style={styles.summaryText}>
              <strong>Timeline:</strong> {briefData['deadline-date-2'] || 'Not specified'}<br/>
              <strong>Budget:</strong> {briefData['project-budjet-2'] || 'Not specified'}
            </p>
          </div>
        </div>
      );
    } else if (formType === 'photo') {
      sections.push(
        <div key="summary" style={styles.summarySection}>
          <h3 style={styles.sectionTitle}>Photo & Video Brief Summary</h3>
          
          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Business Overview</h4>
            <p style={styles.summaryText}>
              <strong>Company:</strong> {briefData['sphere-3'] || 'Not specified'}<br/>
              <strong>Company Size:</strong> {briefData['company-size'] || 'Not specified'}<br/>
              <strong>Decision Level:</strong> {briefData['decision-level'] || 'Not specified'}<br/>
              <strong>Project Urgency:</strong> {briefData['project-urgency'] || 'Not specified'}<br/>
              <strong>How They Found Us:</strong> {briefData['how-did-you-hear'] || 'Not specified'}<br/>
              <strong>Target Audience:</strong> {briefData['audience-3'] || 'Not specified'}<br/>
              <strong>Competitive Edge:</strong> {briefData['stand-out-3'] || 'Not specified'}
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Project Requirements</h4>
            <p style={styles.summaryText}>
              <strong>Service Type:</strong> {briefData['photo-service-type'] || 'Not specified'}<br/>
              <strong>Content Library Needs:</strong> {briefData['content-library'] || 'Not specified'}<br/>
              <strong>Distribution Channels:</strong> {briefData['distribution-channels'] || 'Not specified'}<br/>
              <strong>Production Scale:</strong> {briefData['production-scale'] || 'Not specified'}<br/>
              <strong>Project Purpose:</strong> {briefData['project-purpose'] || 'Not specified'}<br/>
              <strong>Location:</strong> {briefData['shooting-location'] || 'Not specified'}<br/>
              <strong>Style Preferences:</strong> {briefData['style-preferences'] || 'Not specified'}
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Technical Details</h4>
            <p style={styles.summaryText}>
              <strong>Video Resolution:</strong> {briefData['video-resolution'] || 'Not specified'}<br/>
              <strong>Audio Requirements:</strong> {briefData['audio-requirements'] || 'Not specified'}<br/>
              <strong>Editing Style:</strong> {briefData['editing-style'] || 'Not specified'}<br/>
              <strong>Duration:</strong> {briefData['duration'] || 'Not specified'}
            </p>
          </div>

          <div style={styles.summaryBlock}>
            <h4 style={styles.summarySubtitle}>Project Details</h4>
            <p style={styles.summaryText}>
              <strong>Timeline:</strong> {briefData['deadline-date-photo'] || 'Not specified'}<br/>
              <strong>Budget:</strong> {briefData['project-budjet-photo'] || 'Not specified'}
            </p>
          </div>
        </div>
      );
    }

    return sections;
  };

  const handleAction = async (action: 'download' | 'email' | 'discuss') => {
    setIsProcessing(true);
    setProcessingAction(action);
    setActionStatus(null);

    // Prepare request data - extract company from the appropriate field
    const companyField = formType === 'photo' ? 'sphere-3' : 'sphere-2';
    const requestData = {
      formType,
      name: leadData.name,
      email: leadData.email,
      company: briefData[companyField] || briefData.company || '',
      briefData,
      briefId: briefData.briefId || null
    };

    try {
      if (action === 'download') {
        const response = await fetch('/api/brief-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
          // Download PDF file
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `brief-${formType}-${leadData.name.replace(/\s+/g, '-')}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setActionStatus({ type: action, status: 'success' });
        } else {
          throw new Error('Failed to generate PDF');
        }
      } else if (action === 'email') {
        console.log('Sending email request with data:', requestData);
        const response = await fetch('/api/brief-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
          setActionStatus({ type: action, status: 'success' });
        } else {
          const errorText = await response.text();
          console.error('Email API error:', response.status, errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText };
          }
          throw new Error(errorData.error || `Failed to send email (${response.status})`);
        }
      } else if (action === 'discuss') {
        console.log('Sending discussion request with data:', requestData);
        const response = await fetch('/api/discussion-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
          setActionStatus({ type: action, status: 'success' });
        } else {
          const errorText = await response.text();
          console.error('Discussion API error:', response.status, errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText };
          }
          throw new Error(errorData.error || `Failed to send discussion request (${response.status})`);
        }
      }
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
      setActionStatus({ type: action, status: 'error' });
    }
    
    setIsProcessing(false);
    setProcessingAction(null);
  };

  return (
    <div style={styles.container}>
      <style jsx>{`
        .action-button {
          transition: all 0.3s ease !important;
        }
        .action-button:hover:not(:disabled) {
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1) !important;
          border-color: #daff00 !important;
        }
        .action-button:active:not(:disabled) {
          transform: translateY(0) !important;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1) !important;
        }
        .action-button:disabled {
          opacity: 0.7 !important;
          cursor: wait !important;
          background: #f0f0f0 !important;
        }
        @keyframes pulse {
          0% { opacity: 0.8; }
          50% { opacity: 1; }
          100% { opacity: 0.8; }
        }
      `}</style>
      <div style={styles.header}>
        <h2 style={styles.title}>Brief Successfully Submitted!</h2>
        <p style={styles.subtitle}>Thank you, {leadData.name}. Here&apos;s a summary of your project brief:</p>
      </div>

      <div style={styles.summaryContainer}>
        {generateBriefSummary()}
      </div>

      <div style={styles.actionsSection}>
        <h3 style={styles.actionsTitle}>Get Your Project Brief</h3>
        <div style={styles.actionsGrid}>
          <button 
            className="action-button"
            style={{ ...styles.actionButton, ...styles.actionButtonHighlight }}
            onClick={() => handleAction('download')}
            disabled={isProcessing}
          >
            <h4 style={styles.actionButtonTitle}>Download Complete Brief</h4>
            <p style={styles.actionButtonText}>Get a PDF copy of your project brief for your records</p>
          </button>
          
          <button 
            className="action-button"
            style={{ ...styles.actionButton, ...styles.actionButtonHighlight }}
            onClick={() => handleAction('email')}
            disabled={isProcessing}
          >
            <h4 style={styles.actionButtonTitle}>Email This Brief to Me</h4>
            <p style={styles.actionButtonText}>Receive your brief directly in your inbox</p>
          </button>
          
          <button 
            className="action-button"
            style={{ ...styles.actionButton, ...styles.actionButtonHighlight }}
            onClick={() => handleAction('discuss')}
            disabled={isProcessing}
          >
            <h4 style={styles.actionButtonTitle}>Let&apos;s Discuss Your Project</h4>
            <p style={styles.actionButtonText}>Schedule a consultation with our team</p>
          </button>
        </div>

        {isProcessing && processingAction && (
          <div style={styles.processingMessage}>
            {processingAction === 'download' && 'Generating your PDF brief...'}
            {processingAction === 'email' && 'Sending brief to your email...'}
            {processingAction === 'discuss' && 'Sending your discussion request...'}
          </div>
        )}

        {actionStatus && (
          <div style={actionStatus.status === 'success' ? styles.successMessage : styles.errorMessage}>
            {actionStatus.type === 'download' && actionStatus.status === 'success' && 'Your brief has been downloaded successfully!'}
            {actionStatus.type === 'email' && actionStatus.status === 'success' && 'Your brief has been sent to your email!'}
            {actionStatus.type === 'discuss' && actionStatus.status === 'success' && 'Thank you! We&apos;ll contact you within 24 hours.'}
            {actionStatus.status === 'error' && 'Something went wrong. Please try again.'}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
    fontFamily: 'ff-real-text-pro-2, sans-serif',
    color: '#35332f',
    backgroundColor: '#faf9f6',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontFamily: 'futura-pt, sans-serif',
    fontSize: '3em',
    fontWeight: 400,
    color: '#35332f',
    marginBottom: '10px',
  },
  subtitle: {
    fontSize: '1.2em',
    color: '#666',
  },
  summaryContainer: {
    backgroundColor: '#fff',
    padding: '40px',
    marginBottom: '40px',
    border: '1px solid #e0e0e0',
  },
  summarySection: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontFamily: 'futura-pt, sans-serif',
    fontSize: '2em',
    fontWeight: 400,
    color: '#35332f',
    marginBottom: '30px',
    borderBottom: '2px solid #daff00',
    paddingBottom: '10px',
  },
  summaryBlock: {
    marginBottom: '25px',
  },
  summarySubtitle: {
    fontFamily: 'futura-pt, sans-serif',
    fontSize: '1.3em',
    fontWeight: 600,
    color: '#35332f',
    marginBottom: '10px',
  },
  summaryText: {
    fontSize: '1.1em',
    lineHeight: '1.6',
    color: '#555',
  },
  actionsSection: {
    backgroundColor: '#fff',
    padding: '40px',
    border: '1px solid #e0e0e0',
  },
  actionsTitle: {
    fontFamily: 'futura-pt, sans-serif',
    fontSize: '2.5em',
    fontWeight: 400,
    color: '#35332f',
    textAlign: 'center',
    marginBottom: '30px',
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginBottom: '20px',
  },
  actionButton: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '30px 20px',
    backgroundColor: '#faf9f6',
    border: '1px solid #35332f',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'center' as const,
    fontFamily: 'inherit',
  },
  actionButtonHighlight: {
    background: 'linear-gradient(135deg, #daff00 0%, #faf9f6 100%)',
  },
  actionIcon: {
    fontSize: '2.5em',
    marginBottom: '15px',
    fontFamily: 'Arial, sans-serif',
    lineHeight: '1',
    display: 'block',
  },
  actionButtonTitle: {
    fontFamily: 'futura-pt, sans-serif',
    fontSize: '1.4em',
    fontWeight: 600,
    color: '#35332f',
    marginBottom: '10px',
  },
  actionButtonText: {
    fontSize: '0.95em',
    color: '#666',
    lineHeight: '1.4',
  },
  successMessage: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#d4edda',
    color: '#155724',
    border: '1px solid #c3e6cb',
    borderRadius: '4px',
    textAlign: 'center' as const,
    fontWeight: 600,
  },
  errorMessage: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
    borderRadius: '4px',
    textAlign: 'center' as const,
    fontWeight: 600,
  },
  processingMessage: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    border: '1px solid #bbdefb',
    borderRadius: '4px',
    textAlign: 'center' as const,
    fontWeight: 600,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
};
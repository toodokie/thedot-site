import jsPDF from 'jspdf';
import { BriefData } from './notion';
import fs from 'fs';
import path from 'path';

export function generateBriefPDF(data: BriefData): Buffer {
  console.log('=== PDF GENERATION STARTED ===');
  console.log('PDF data received:', { formType: data.formType, name: data.name, email: data.email, company: data.company });
  
  const { formType, name, email, company, briefData } = data;
  
  try {
    console.log('Creating jsPDF instance...');
    const doc = new jsPDF();
    console.log('jsPDF instance created successfully');
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;


  // Helper function to add text with word wrap
  const addWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 10) => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * fontSize * 0.4);
  };

  // Header with logo area
  doc.setFillColor(218, 255, 0); // #daff00
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  // Add logo if available (maintaining aspect ratio)
  try {
    const logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png');
    console.log('Attempting to load logo from:', logoPath);
    if (fs.existsSync(logoPath)) {
      console.log('Logo file exists, reading...');
      const logoBase64 = fs.readFileSync(logoPath, 'base64');
      console.log('Logo loaded, size:', logoBase64.length, 'characters');
      // Use proper aspect ratio for logo - adjust height to maintain proportions
      doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', 20, 8, 40, 20);
      console.log('Logo added to PDF successfully');
    } else {
      console.warn('Logo file does not exist at:', logoPath);
    }
  } catch (error) {
    console.error('Error loading logo:', error);
    // Don't throw error, just continue without logo
  }
  
  // Just show Project Brief title
  doc.setTextColor(53, 51, 47); // #35332f
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Project Brief', 70, 22);

  yPosition = 60;

  // Project type header
  doc.setFillColor(53, 51, 47); // #35332f
  doc.rect(0, yPosition - 10, pageWidth, 20, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const projectTitle = `${formType.charAt(0).toUpperCase() + formType.slice(1)} Development Brief`;
  doc.text(projectTitle, 20, yPosition);
  
  yPosition += 30;

  // Client Information Section
  doc.setTextColor(53, 51, 47);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENT INFORMATION', 20, yPosition);
  yPosition += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);
  
  yPosition = addWrappedText(`Name: ${name}`, 25, yPosition, pageWidth - 50);
  yPosition = addWrappedText(`Email: ${email}`, 25, yPosition, pageWidth - 50);
  if (company) {
    yPosition = addWrappedText(`Company: ${company}`, 25, yPosition, pageWidth - 50);
  }
  yPosition = addWrappedText(`Date Submitted: ${new Date().toLocaleDateString()}`, 25, yPosition, pageWidth - 50);
  yPosition = addWrappedText(`Company Size: ${briefData['company-size'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  yPosition = addWrappedText(`Decision Level: ${briefData['decision-level'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  yPosition = addWrappedText(`Project Urgency: ${briefData['project-urgency'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  yPosition = addWrappedText(`How They Found Us: ${briefData['how-did-you-hear'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  
  yPosition += 15;

  // Project Overview Section
  doc.setTextColor(53, 51, 47);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PROJECT OVERVIEW', 20, yPosition);
  yPosition += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);

  if (formType === 'website') {
    yPosition = addWrappedText(`Business Sector: ${briefData['sphere-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Website Type: ${briefData['site-type'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Number of Pages: ${briefData['pages-per-site-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Current Website: ${briefData['current-website'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Biggest Challenge: ${briefData['website-challenge'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Success Metrics: ${briefData['success-metrics'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Timeline: ${briefData['deadline-date-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Budget: ${briefData['project-budjet-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  } else if (formType === 'graphic') {
    yPosition = addWrappedText(`Business Sector: ${briefData['sphere-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Service Required: ${briefData['Services-Required'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Brand Maturity: ${briefData['brand-maturity'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Usage Timeline: ${briefData['usage-timeline'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Internal Resources: ${briefData['internal-resources'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Desired Style: ${briefData['Desired-Style'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Timeline: ${briefData['deadline-date-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Budget: ${briefData['project-budjet-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  } else if (formType === 'photo') {
    yPosition = addWrappedText(`Business Sector: ${briefData['sphere-3'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Service Type: ${briefData['photo-service-type'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Project Purpose: ${briefData['project-purpose'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Content Library Needs: ${briefData['content-library'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Distribution Channels: ${briefData['distribution-channels'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Production Scale: ${briefData['production-scale'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Timeline: ${briefData['deadline-date-photo'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Budget: ${briefData['project-budjet-photo'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  }

  yPosition += 15;

  // Check if we need a new page
  if (yPosition > pageHeight - 60) {
    doc.addPage();
    yPosition = 20;
  }

  // Business Information Section
  doc.setTextColor(53, 51, 47);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BUSINESS INFORMATION', 20, yPosition);
  yPosition += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);

  const audienceField = formType === 'photo' ? 'audience-3' : 'audience-2';
  const standOutField = formType === 'photo' ? 'stand-out-3' : 'stand-out-2';
  
  yPosition = addWrappedText(`Target Audience: ${briefData[audienceField] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  yPosition = addWrappedText(`Competitive Edge: ${briefData[standOutField] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  yPosition = addWrappedText(`Key Competitors: ${briefData['competitors-2'] || briefData['competitors-3'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);

  yPosition += 15;

  // Project Specific Requirements
  doc.setTextColor(53, 51, 47);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PROJECT REQUIREMENTS', 20, yPosition);
  yPosition += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 51, 51);

  if (formType === 'website') {
    yPosition = addWrappedText(`Website Structure: ${briefData['site-structure-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Main Page Content: ${briefData['main-page-architecture-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Other Pages Content: ${briefData['other-pages-architecture-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Overall Style: ${briefData['overall-site-style-2'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    
    const features = [
      briefData['built-in-elements-catalog'] && 'Product Catalog',
      briefData['built-in-elements-cart'] && 'Online Cart',
      briefData['built-in-elements-cart-payments'] && 'Online Payments',
      briefData['built-in-elements-crm'] && 'CRM',
      briefData['built-in-elements-form'] && 'Contact Forms'
    ].filter(Boolean).join(', ');
    
    yPosition = addWrappedText(`Required Features: ${features || 'Basic features'}`, 25, yPosition, pageWidth - 50);
  } else if (formType === 'graphic') {
    yPosition = addWrappedText(`Color Preferences: ${briefData['Preferred-Colors'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Primary Message: ${briefData['Audience-Message'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`File Formats: ${briefData['File-Formats'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Special Elements: ${briefData['Special-elements'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Call to Action: ${briefData['Call-to-Action'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  } else if (formType === 'photo') {
    yPosition = addWrappedText(`Shooting Location: ${briefData['shooting-location'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Duration: ${briefData['duration'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Style Preferences: ${briefData['style-preferences'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Video Resolution: ${briefData['video-resolution'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
    yPosition = addWrappedText(`Audio Requirements: ${briefData['audio-requirements'] || 'Not specified'}`, 25, yPosition, pageWidth - 50);
  }

  // Check if we need a new page for footer (leave 50px space)
  if (yPosition > pageHeight - 50) {
    doc.addPage();
    yPosition = 20;
  }

  // Add some space before footer
  yPosition += 20;

  // Footer - position it properly based on content
  const footerY = Math.max(yPosition, pageHeight - 35);
  doc.setFillColor(53, 51, 47);
  doc.rect(0, footerY - 5, pageWidth, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('The Dot Creative Agency', 20, footerY + 5);
  doc.text('+1 (647) 402-4420', 20, footerY + 12);
  doc.text('info@thedotcreative.co', 120, footerY + 5);
  doc.text('www.thedotcreative.co', 120, footerY + 12);

    console.log('=== PDF GENERATION COMPLETED ===');
    return Buffer.from(doc.output('arraybuffer'));
    
  } catch (error) {
    console.error('=== PDF GENERATION FAILED ===');
    console.error('PDF generation error:', error);
    console.error('Error type:', typeof error);
    console.error('Error message:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function generateSimpleBriefHTML(data: BriefData): string {
  const { formType, name, email, company, briefData } = data;
  
  let projectDetails = '';
  
  if (formType === 'website') {
    projectDetails = `
      <div class="section">
        <h2>Website Requirements</h2>
        <div class="detail-grid">
          <div><strong>Type:</strong> ${briefData['site-type'] || 'Not specified'}</div>
          <div><strong>Pages:</strong> ${briefData['pages-per-site-2'] || 'Not specified'}</div>
          <div><strong>Current Website:</strong> ${briefData['current-website'] || 'Not specified'}</div>
          <div><strong>Structure:</strong> ${briefData['site-structure-2'] || 'Not specified'}</div>
          <div><strong>Biggest Challenge:</strong> ${briefData['website-challenge'] || 'Not specified'}</div>
          <div><strong>Success Metrics:</strong> ${briefData['success-metrics'] || 'Not specified'}</div>
          <div><strong>Style:</strong> ${briefData['overall-site-style-2'] || 'Not specified'}</div>
        </div>
        <div class="features">
          <strong>Required Features:</strong>
          ${[
            briefData['built-in-elements-catalog'] && 'Product Catalog',
            briefData['built-in-elements-cart'] && 'Online Cart',
            briefData['built-in-elements-cart-payments'] && 'Online Payments',
            briefData['built-in-elements-crm'] && 'CRM',
            briefData['built-in-elements-form'] && 'Contact Forms'
          ].filter(Boolean).map(feature => `<span class="feature-tag">${feature}</span>`).join(' ') || 'Basic features'}
        </div>
      </div>
    `;
  } else if (formType === 'graphic') {
    projectDetails = `
      <div class="section">
        <h2>Design Requirements</h2>
        <div class="detail-grid">
          <div><strong>Service:</strong> ${briefData['Services-Required'] || 'Not specified'}</div>
          <div><strong>Brand Maturity:</strong> ${briefData['brand-maturity'] || 'Not specified'}</div>
          <div><strong>Usage Timeline:</strong> ${briefData['usage-timeline'] || 'Not specified'}</div>
          <div><strong>Internal Resources:</strong> ${briefData['internal-resources'] || 'Not specified'}</div>
          <div><strong>Style:</strong> ${briefData['Desired-Style'] || 'Not specified'}</div>
          <div><strong>Colors:</strong> ${briefData['Preferred-Colors'] || 'Not specified'}</div>
          <div><strong>Message:</strong> ${briefData['Audience-Message'] || 'Not specified'}</div>
          <div><strong>File Formats:</strong> ${briefData['File-Formats'] || 'Not specified'}</div>
          <div><strong>Special Elements:</strong> ${briefData['Special-elements'] || 'Not specified'}</div>
        </div>
      </div>
    `;
  } else if (formType === 'photo') {
    projectDetails = `
      <div class="section">
        <h2>Photo/Video Requirements</h2>
        <div class="detail-grid">
          <div><strong>Service:</strong> ${briefData['photo-service-type'] || 'Not specified'}</div>
          <div><strong>Purpose:</strong> ${briefData['project-purpose'] || 'Not specified'}</div>
          <div><strong>Content Library Needs:</strong> ${briefData['content-library'] || 'Not specified'}</div>
          <div><strong>Distribution Channels:</strong> ${briefData['distribution-channels'] || 'Not specified'}</div>
          <div><strong>Production Scale:</strong> ${briefData['production-scale'] || 'Not specified'}</div>
          <div><strong>Location:</strong> ${briefData['shooting-location'] || 'Not specified'}</div>
          <div><strong>Duration:</strong> ${briefData['duration'] || 'Not specified'}</div>
          <div><strong>Style:</strong> ${briefData['style-preferences'] || 'Not specified'}</div>
          <div><strong>Resolution:</strong> ${briefData['video-resolution'] || 'Not specified'}</div>
        </div>
      </div>
    `;
  }

  const sectorField = formType === 'photo' ? 'sphere-3' : 'sphere-2';
  const audienceField = formType === 'photo' ? 'audience-3' : 'audience-2';
  const timelineField = formType === 'photo' ? 'deadline-date-photo' : 'deadline-date-2';
  const budgetField = formType === 'photo' ? 'project-budjet-photo' : 'project-budjet-2';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Project Brief - ${name}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #35332f; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #daff00 0%, #faf9f6 100%); padding: 30px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
        .logo { max-width: 200px; height: auto; margin-bottom: 20px; }
        h1 { color: #35332f; font-size: 28px; margin: 0; }
        h2 { color: #35332f; font-size: 20px; border-bottom: 2px solid #daff00; padding-bottom: 8px; }
        .section { background: white; padding: 25px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
        .detail-grid div { padding: 10px; background: #f8f9fa; border-radius: 4px; }
        .feature-tag { background: #daff00; padding: 3px 8px; border-radius: 12px; font-size: 12px; margin-right: 5px; }
        .contact-info { background: #35332f; color: white; padding: 20px; text-align: center; border-radius: 8px; margin-top: 30px; }
        .contact-info a { color: #daff00; text-decoration: none; }
        @media print { body { margin: 0; } .header { background: #daff00 !important; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Project Brief</h1>
        <p><strong>${formType.charAt(0).toUpperCase() + formType.slice(1)} Development</strong></p>
        <p>Prepared for: ${name}</p>
      </div>

      <div class="section">
        <h2>Client Information</h2>
        <div class="detail-grid">
          <div><strong>Name:</strong> ${name}</div>
          <div><strong>Email:</strong> ${email}</div>
          <div><strong>Company:</strong> ${company || 'Not provided'}</div>
          <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
          <div><strong>Company Size:</strong> ${briefData['company-size'] || 'Not specified'}</div>
          <div><strong>Decision Level:</strong> ${briefData['decision-level'] || 'Not specified'}</div>
          <div><strong>Project Urgency:</strong> ${briefData['project-urgency'] || 'Not specified'}</div>
          <div><strong>How They Found Us:</strong> ${briefData['how-did-you-hear'] || 'Not specified'}</div>
        </div>
      </div>

      <div class="section">
        <h2>Project Overview</h2>
        <div class="detail-grid">
          <div><strong>Business Sector:</strong> ${briefData[sectorField] || 'Not specified'}</div>
          <div><strong>Target Audience:</strong> ${briefData[audienceField] || 'Not specified'}</div>
          <div><strong>Timeline:</strong> ${briefData[timelineField] || 'Not specified'}</div>
          <div><strong>Budget:</strong> ${briefData[budgetField] || 'Not specified'}</div>
        </div>
      </div>

      ${projectDetails}

      <div class="contact-info">
        <h3>The Dot Creative Agency</h3>
        <p>📞 +1 (647) 402-4420 | ✉️ <a href="mailto:info@thedotcreative.co">info@thedotcreative.co</a></p>
        <p><a href="https://www.thedotcreative.co">www.thedotcreative.co</a></p>
        <p><em>Creating impactful design solutions that drive results.</em></p>
      </div>
    </body>
    </html>
  `;
}
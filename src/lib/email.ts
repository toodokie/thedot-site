import nodemailer from 'nodemailer';
import { BriefData } from './notion';

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  disableFileAccess: true,
  disableUrlAccess: true,
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    minVersion: 'TLSv1.2'
  }
});

// Log transporter configuration (without password)
console.log('Email transporter configured with:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  from: process.env.FROM_EMAIL,
  agency: process.env.AGENCY_EMAIL
});

export function generateClientEmailTemplate(data: BriefData): string {
  const { formType, name, briefData } = data;
  
  let projectType = '';
  let projectSummary = '';
  
  if (formType === 'website') {
    projectType = 'Website Development';
    projectSummary = `
      <strong>Website Type:</strong> ${briefData['site-type'] || 'Not specified'}<br>
      <strong>Number of Pages:</strong> ${briefData['pages-per-site-2'] || 'Not specified'}<br>
      <strong>Timeline:</strong> ${briefData['deadline-date-2'] || 'Not specified'}<br>
      <strong>Budget:</strong> ${briefData['project-budjet-2'] || 'Not specified'}
    `;
  } else if (formType === 'graphic') {
    projectType = 'Graphic Design';
    projectSummary = `
      <strong>Service Type:</strong> ${briefData['Services-Required'] || 'Not specified'}<br>
      <strong>Desired Style:</strong> ${briefData['Desired-Style'] || 'Not specified'}<br>
      <strong>Timeline:</strong> ${briefData['deadline-date-2'] || 'Not specified'}<br>
      <strong>Budget:</strong> ${briefData['project-budjet-2'] || 'Not specified'}
    `;
  } else if (formType === 'photo') {
    projectType = 'Photo & Video';
    projectSummary = `
      <strong>Service Type:</strong> ${briefData['photo-service-type'] || 'Not specified'}<br>
      <strong>Project Purpose:</strong> ${briefData['project-purpose'] || 'Not specified'}<br>
      <strong>Timeline:</strong> ${briefData['deadline-date-photo'] || 'Not specified'}<br>
      <strong>Budget:</strong> ${briefData['project-budjet-photo'] || 'Not specified'}
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Project Brief - The Dot Creative Agency</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #35332f; 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px; 
        }
        .header { 
          background: linear-gradient(135deg, #daff00 0%, #faf9f6 100%); 
          padding: 30px; 
          text-align: center; 
          border-radius: 8px; 
          margin-bottom: 30px; 
        }
        .logo { 
          max-width: 200px; 
          height: auto; 
          margin-bottom: 20px; 
        }
        .content { 
          background: #ffffff; 
          padding: 30px; 
          border-radius: 8px; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        .section { 
          margin-bottom: 25px; 
          padding-bottom: 20px; 
          border-bottom: 1px solid #e0e0e0; 
        }
        .section:last-child { 
          border-bottom: none; 
        }
        h1 { 
          color: #35332f; 
          font-size: 28px; 
          margin: 0; 
        }
        h2 { 
          color: #35332f; 
          font-size: 22px; 
          margin-bottom: 15px; 
        }
        h3 { 
          color: #35332f; 
          font-size: 18px; 
          margin-bottom: 10px; 
        }
        .highlight { 
          background: #daff00; 
          padding: 2px 6px; 
          border-radius: 3px; 
        }
        .next-steps { 
          background: #f8f9fa; 
          padding: 20px; 
          border-radius: 6px; 
          border-left: 4px solid #daff00; 
        }
        .contact-info { 
          background: #35332f; 
          color: white; 
          padding: 20px; 
          text-align: center; 
          border-radius: 6px; 
          margin-top: 30px; 
        }
        .contact-info a { 
          color: #daff00; 
          text-decoration: none; 
        }
        .button { 
          display: inline-block; 
          background: #35332f; 
          color: white; 
          padding: 12px 24px; 
          text-decoration: none; 
          border-radius: 6px; 
          margin: 10px 5px; 
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Thank You, ${name}!</h1>
        <p>Your ${projectType} brief has been successfully submitted.</p>
      </div>

      <div class="content">
        <div class="section">
          <h2>📋 Project Summary</h2>
          <p>
            <strong>Company Size:</strong> ${briefData['company-size'] || 'Not specified'}<br>
            <strong>Decision Level:</strong> ${briefData['decision-level'] || 'Not specified'}<br>
            <strong>Project Urgency:</strong> ${briefData['project-urgency'] || 'Not specified'}<br>
            <strong>How You Found Us:</strong> ${briefData['how-did-you-hear'] || 'Not specified'}<br><br>
            ${projectSummary}
          </p>
        </div>

        <div class="section">
          <h2>🎯 What Happens Next?</h2>
          <div class="next-steps">
            <h3>Our Process:</h3>
            <ol>
              <li><strong>Brief Review</strong> - Our team will carefully review your project requirements (24-48 hours)</li>
              <li><strong>Initial Consultation</strong> - We'll schedule a call to discuss your vision and goals</li>
              <li><strong>Proposal & Timeline</strong> - You'll receive a detailed proposal with project timeline</li>
              <li><strong>Project Kickoff</strong> - Once approved, we begin bringing your vision to life!</li>
            </ol>
          </div>
        </div>

        <div class="section">
          <h2>💡 Why Choose The Dot?</h2>
          <ul>
            <li>✨ <strong>Creative Excellence</strong> - Award-winning design that stands out</li>
            <li>🎯 <strong>Strategic Approach</strong> - Every design serves your business goals</li>
            <li>⚡ <strong>Fast Turnaround</strong> - Quality work delivered on time</li>
            <li>🤝 <strong>Collaborative Process</strong> - You're involved every step of the way</li>
          </ul>
        </div>

        <div class="section">
          <h2>📞 Need to Chat Sooner?</h2>
          <p>Have questions or want to discuss your project right away? We're here to help!</p>
          <a href="tel:+16474024420" class="button">📞 Call Us: +1 (647) 402-4420</a>
          <a href="mailto:info@thedotcreative.co" class="button">✉️ Email Us</a>
        </div>
      </div>

      <div class="contact-info">
        <h3>The Dot Creative Agency</h3>
        <p>
          📞 +1 (647) 402-4420<br>
          ✉️ <a href="mailto:info@thedotcreative.co">info@thedotcreative.co</a><br>
          🌐 <a href="https://www.thedotcreative.co">www.thedotcreative.co</a>
        </p>
        <p><em>Creating impactful design solutions that drive results.</em></p>
      </div>
    </body>
    </html>
  `;
}

export function generateAgencyEmailTemplate(data: BriefData): string {
  const { formType, name, email, company, briefData } = data;
  
  let projectDetails = '';
  
  if (formType === 'website') {
    projectDetails = `
      <strong>Website Requirements:</strong><br>
      • Type: ${briefData['site-type'] || 'Not specified'}<br>
      • Pages: ${briefData['pages-per-site-2'] || 'Not specified'}<br>
      • Features: ${[
        briefData['built-in-elements-catalog'] && 'Product Catalog',
        briefData['built-in-elements-cart'] && 'Online Cart',
        briefData['built-in-elements-cart-payments'] && 'Online Payments',
        briefData['built-in-elements-crm'] && 'CRM',
        briefData['built-in-elements-form'] && 'Contact Forms'
      ].filter(Boolean).join(', ') || 'Basic features'}<br>
      • Style: ${briefData['overall-site-style-2'] || 'Not specified'}<br>
      • Target Audience: ${briefData['audience-2'] || 'Not specified'}<br>
      • Timeline: ${briefData['deadline-date-2'] || 'Not specified'}<br>
      • Budget: ${briefData['project-budjet-2'] || 'Not specified'}
    `;
  } else if (formType === 'graphic') {
    projectDetails = `
      <strong>Graphic Design Requirements:</strong><br>
      • Service: ${briefData['Services-Required'] || 'Not specified'}<br>
      • Style: ${briefData['Desired-Style'] || 'Not specified'}<br>
      • Colors: ${briefData['Preferred-Colors'] || 'Not specified'}<br>
      • Message: ${briefData['Audience-Message'] || 'Not specified'}<br>
      • File Formats: ${briefData['File-Formats'] || 'Not specified'}<br>
      • Timeline: ${briefData['deadline-date-2'] || 'Not specified'}<br>
      • Budget: ${briefData['project-budjet-2'] || 'Not specified'}
    `;
  } else if (formType === 'photo') {
    projectDetails = `
      <strong>Photo/Video Requirements:</strong><br>
      • Service: ${briefData['photo-service-type'] || 'Not specified'}<br>
      • Purpose: ${briefData['project-purpose'] || 'Not specified'}<br>
      • Location: ${briefData['shooting-location'] || 'Not specified'}<br>
      • Duration: ${briefData['duration'] || 'Not specified'}<br>
      • Style: ${briefData['style-preferences'] || 'Not specified'}<br>
      • Timeline: ${briefData['deadline-date-photo'] || 'Not specified'}<br>
      • Budget: ${briefData['project-budjet-photo'] || 'Not specified'}
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Project Brief - ${name}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #35332f; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .alert { background: #daff00; color: #35332f; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-weight: 600; }
        .client-info { background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 20px; }
        .project-details { background: white; padding: 20px; border: 1px solid #ddd; border-radius: 6px; }
        .urgent { color: #d63384; font-weight: 600; }
        .high-value { color: #198754; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🚨 New Project Brief Submitted</h1>
        <p>Discussion request from potential client</p>
      </div>

      <div class="alert">
        💬 CLIENT WANTS TO DISCUSS PROJECT - FOLLOW UP WITHIN 2 HOURS
      </div>

      <div class="client-info">
        <h2>👤 Client Information</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>Company:</strong> ${company || 'Not provided'}</p>
        <p><strong>Project Type:</strong> <span class="highlight">${formType.charAt(0).toUpperCase() + formType.slice(1)}</span></p>
        <p><strong>Business Sector:</strong> ${briefData['sphere-2'] || briefData['sphere-3'] || 'Not specified'}</p>
        <p><strong>Company Size:</strong> ${briefData['company-size'] || 'Not specified'}</p>
        <p><strong>Decision Level:</strong> ${briefData['decision-level'] || 'Not specified'}</p>
        <p><strong>Project Urgency:</strong> ${briefData['project-urgency'] || 'Not specified'}</p>
        <p><strong>How They Found Us:</strong> ${briefData['how-did-you-hear'] || 'Not specified'}</p>
      </div>

      <div class="project-details">
        <h2>📋 Project Highlights</h2>
        ${projectDetails}
        
        <hr style="margin: 20px 0;">
        
        <h3>🎯 Key Notes:</h3>
        <ul>
          <li><strong>Competitive Edge:</strong> ${briefData['stand-out-2'] || briefData['stand-out-3'] || 'Not specified'}</li>
          <li><strong>Target Audience:</strong> ${briefData['audience-2'] || briefData['audience-3'] || 'Not specified'}</li>
          <li><strong>Primary Sales Channel:</strong> ${briefData['getting-clients'] || briefData['getting-clients-photo'] || 'Not specified'}</li>
        </ul>
      </div>

      <div style="background: #e7f3ff; padding: 20px; border-radius: 6px; margin-top: 20px;">
        <h3>📎 Complete Brief Attached</h3>
        <p>The full project brief PDF is attached to this email with all detailed requirements and specifications.</p>
        
        <h3>🎯 Next Steps:</h3>
        <ol>
          <li><strong>Review the attached PDF</strong> for complete project details</li>
          <li><strong>Contact client within 2 hours</strong> - they requested a discussion</li>
          <li><strong>Schedule consultation call</strong> to discuss project scope and timeline</li>
          <li><strong>Prepare proposal</strong> based on requirements and budget</li>
        </ol>
      </div>

      <div style="background: #35332f; color: white; padding: 15px; border-radius: 6px; margin-top: 20px; text-align: center;">
        <p><strong>⚡ Quick Contact:</strong> <a href="mailto:${email}" style="color: #daff00;">${email}</a></p>
      </div>
    </body>
    </html>
  `;
}

export async function sendClientEmail(data: BriefData): Promise<void> {
  console.log('sendClientEmail called with:', { email: data.email, formType: data.formType, name: data.name });
  const htmlContent = generateClientEmailTemplate(data);
  
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: data.email,
    subject: `Your ${data.formType.charAt(0).toUpperCase() + data.formType.slice(1)} Project Brief - The Dot Creative Agency`,
    html: htmlContent,
  };
  
  console.log('Sending email with options:', { from: mailOptions.from, to: mailOptions.to, subject: mailOptions.subject });
  await transporter.sendMail(mailOptions);
  console.log('Email sent successfully to:', data.email);
}

export async function sendAgencyEmail(data: BriefData, pdfBuffer: Buffer): Promise<void> {
  console.log('sendAgencyEmail called with:', { 
    agencyEmail: process.env.AGENCY_EMAIL, 
    formType: data.formType, 
    name: data.name,
    pdfSize: pdfBuffer.length 
  });
  
  const htmlContent = generateAgencyEmailTemplate(data);
  
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: process.env.AGENCY_EMAIL,
    subject: `🚨 NEW PROJECT BRIEF: ${data.formType.toUpperCase()} - ${data.name} (Discussion Requested)`,
    html: htmlContent,
    attachments: [
      {
        filename: `brief-${data.formType}-${data.name.replace(/\s+/g, '-')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };
  
  console.log('Sending agency email with options:', { 
    from: mailOptions.from, 
    to: mailOptions.to, 
    subject: mailOptions.subject,
    attachmentCount: mailOptions.attachments.length 
  });
  
  await transporter.sendMail(mailOptions);
  console.log('Agency email sent successfully to:', process.env.AGENCY_EMAIL);
}

export interface EfficiencyBriefData {
  companyName: string;
  contactName: string;
  contactEmail: string;
  role: string;
  websiteUrl?: string;
  industry: string;
  servicesProducts: string;
  websiteGoal: string;
  biggestFrustration: string;
  aodaAware: string;
  softwareAudit: string;
  connectionScore: number;
  leadFlow: string;
  competitors: string;
}

export function generateEfficiencyBriefEmailTemplate(data: EfficiencyBriefData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>New Efficiency Brief - ${data.contactName}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #35332f; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .alert { background: #daff00; color: #35332f; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-weight: 600; }
        .client-info { background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 20px; }
        .project-details { background: white; padding: 20px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 20px; }
        .section { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
        .section:last-child { border-bottom: none; }
        .score { background: #e7f3ff; padding: 10px; border-radius: 4px; font-weight: 600; }
        .urgent { color: #d63384; font-weight: 600; }
        .high-value { color: #198754; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>💼 New Business Efficiency Assessment</h1>
        <p>Efficiency brief submitted from potential client</p>
      </div>

      <div class="alert">
        ⚡ NEW EFFICIENCY BRIEF - FOLLOW UP WITHIN 2 HOURS FOR FREE AUDIT OFFER
      </div>

      <div class="client-info">
        <h2>👤 Client Information</h2>
        <p><strong>Contact Name:</strong> ${data.contactName}</p>
        <p><strong>Email:</strong> <a href="mailto:${data.contactEmail}">${data.contactEmail}</a></p>
        <p><strong>Company:</strong> ${data.companyName}</p>
        <p><strong>Role:</strong> ${data.role}</p>
        <p><strong>Website:</strong> ${data.websiteUrl ? `<a href="${data.websiteUrl}" target="_blank">${data.websiteUrl}</a>` : 'Not provided'}</p>
        <p><strong>Industry:</strong> ${data.industry}</p>
      </div>

      <div class="project-details">
        <h2>🎯 Business Overview</h2>
        
        <div class="section">
          <h3>Services/Products:</h3>
          <p>${data.servicesProducts}</p>
        </div>

        <div class="section">
          <h3>Primary Website Goal:</h3>
          <p><strong>${data.websiteGoal}</strong></p>
        </div>

        <div class="section">
          <h3>Biggest Business Frustration:</h3>
          <p>${data.biggestFrustration}</p>
        </div>

        <div class="section">
          <h3>AODA Awareness:</h3>
          <p><strong>${data.aodaAware}</strong></p>
        </div>
      </div>

      <div class="project-details">
        <h2>⚙️ Systems & Process Analysis</h2>
        
        <div class="section">
          <h3>Software Stack Audit:</h3>
          <p>${data.softwareAudit}</p>
        </div>

        <div class="section">
          <h3>System Connection Score:</h3>
          <div class="score">
            ${data.connectionScore}/10 - ${data.connectionScore <= 3 ? '🔴 Critical disconnection' : 
                                          data.connectionScore <= 6 ? '🟡 Moderate issues' : 
                                          '🟢 Good integration'}
          </div>
        </div>

        <div class="section">
          <h3>Lead Flow Process:</h3>
          <p>${data.leadFlow}</p>
        </div>

        <div class="section">
          <h3>Competitor Analysis:</h3>
          <p>${data.competitors}</p>
        </div>
      </div>

      <div style="background: #e7f3ff; padding: 20px; border-radius: 6px; margin-top: 20px;">
        <h3>🎯 Next Steps:</h3>
        <ol>
          <li><strong>Immediate follow-up</strong> - Contact within 2 hours while interest is hot</li>
          <li><strong>Schedule video audit call</strong> - Offer personalized efficiency assessment</li>
          <li><strong>Analyze their systems</strong> - Review software stack and connection issues</li>
          <li><strong>Prepare recommendations</strong> - Focus on ${data.connectionScore <= 6 ? 'system integration improvements' : 'optimization opportunities'}</li>
        </ol>
        
        <h3>💡 Key Opportunities:</h3>
        <ul>
          ${data.connectionScore <= 6 ? '<li><strong>High Priority:</strong> System integration consulting</li>' : ''}
          ${data.aodaAware === 'No' || data.aodaAware === 'Unsure' ? '<li><strong>Compliance Opportunity:</strong> AODA accessibility audit</li>' : ''}
          <li><strong>Website Goal:</strong> ${data.websiteGoal} optimization</li>
          <li><strong>Process Improvement:</strong> Lead flow automation</li>
        </ul>
      </div>

      <div style="background: #35332f; color: white; padding: 15px; border-radius: 6px; margin-top: 20px; text-align: center;">
        <p><strong>⚡ Quick Contact:</strong> <a href="mailto:${data.contactEmail}" style="color: #daff00;">${data.contactEmail}</a></p>
        <p><strong>🌐 Their Website:</strong> ${data.websiteUrl ? `<a href="${data.websiteUrl}" style="color: #daff00;" target="_blank">${data.websiteUrl}</a>` : 'Not provided'}</p>
      </div>
    </body>
    </html>
  `;
}

export async function sendEfficiencyBriefEmail(data: EfficiencyBriefData): Promise<void> {
  console.log('sendEfficiencyBriefEmail called with:', { 
    email: data.contactEmail, 
    name: data.contactName,
    company: data.companyName 
  });
  
  const htmlContent = generateEfficiencyBriefEmailTemplate(data);
  
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: 'info@thedotcreative.co',
    subject: `💼 NEW EFFICIENCY BRIEF: ${data.companyName} - ${data.contactName} (Score: ${data.connectionScore}/10)`,
    html: htmlContent,
  };
  
  console.log('Sending efficiency brief email with options:', { 
    from: mailOptions.from, 
    to: mailOptions.to, 
    subject: mailOptions.subject
  });
  
  await transporter.sendMail(mailOptions);
  console.log('Efficiency brief email sent successfully to: info@thedotcreative.co');
}

/**
 * Input sanitization utilities to prevent injection attacks
 */

export interface ValidationResult {
  isValid: boolean;
  sanitized: string;
  errors: string[];
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param input - Raw user input
 * @returns Sanitized string safe for HTML context
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/&/g, '&amp;')     // Must be first
    .replace(/</g, '&lt;')      // Prevent tag injection
    .replace(/>/g, '&gt;')      // Prevent tag injection
    .replace(/"/g, '&quot;')    // Prevent attribute injection
    .replace(/'/g, '&#x27;')    // Prevent attribute injection
    .replace(/\//g, '&#x2F;');  // Prevent script injection
}

/**
 * Sanitize text for email content (preserves line breaks but removes HTML)
 * @param input - Raw user input
 * @returns Sanitized string safe for email
 */
export function sanitizeEmailContent(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\r?\n/g, '<br>') // Convert line breaks to HTML breaks
    .trim();
}

/**
 * Validate and sanitize email address
 * @param email - Email address to validate
 * @returns Validation result with sanitized email
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  
  if (!email || typeof email !== 'string') {
    return { isValid: false, sanitized: '', errors: ['Email is required'] };
  }
  
  const sanitized = email.trim().toLowerCase();
  
  // Check length
  if (sanitized.length > 254) {
    errors.push('Email address is too long');
  }
  
  // Basic email format validation (RFC 5322 compliant)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(sanitized)) {
    errors.push('Invalid email format');
  }
  
  // Check for suspicious patterns
  if (sanitized.includes('..') || sanitized.startsWith('.') || sanitized.endsWith('.')) {
    errors.push('Invalid email format');
  }
  
  return {
    isValid: errors.length === 0,
    sanitized,
    errors
  };
}

/**
 * Validate and sanitize name field
 * @param name - Name to validate
 * @returns Validation result with sanitized name
 */
export function validateName(name: string): ValidationResult {
  const errors: string[] = [];
  
  if (!name || typeof name !== 'string') {
    return { isValid: false, sanitized: '', errors: ['Name is required'] };
  }
  
  const sanitized = name.trim();
  
  // Check length
  if (sanitized.length < 1) {
    errors.push('Name is required');
  } else if (sanitized.length > 100) {
    errors.push('Name is too long (max 100 characters)');
  }
  
  // Check for suspicious patterns
  if (/<script|javascript:|data:|vbscript:/i.test(sanitized)) {
    errors.push('Invalid characters in name');
  }
  
  // Check for excessive special characters (potential spam)
  const specialCharCount = (sanitized.match(/[^a-zA-Z0-9\s\-',.]/g) || []).length;
  if (specialCharCount > sanitized.length * 0.3) {
    errors.push('Name contains too many special characters');
  }
  
  return {
    isValid: errors.length === 0,
    sanitized: sanitizeHtml(sanitized),
    errors
  };
}

/**
 * Validate and sanitize message/comment field
 * @param message - Message to validate
 * @returns Validation result with sanitized message
 */
export function validateMessage(message: string): ValidationResult {
  const errors: string[] = [];
  
  if (!message || typeof message !== 'string') {
    return { isValid: false, sanitized: '', errors: ['Message is required'] };
  }
  
  const sanitized = message.trim();
  
  // Check length
  if (sanitized.length < 10) {
    errors.push('Message is too short (minimum 10 characters)');
  } else if (sanitized.length > 5000) {
    errors.push('Message is too long (maximum 5000 characters)');
  }
  
  // Check for suspicious patterns
  if (/<script|javascript:|data:|vbscript:|onload|onerror/i.test(sanitized)) {
    errors.push('Message contains invalid content');
  }
  
  // Check for excessive URLs (potential spam)
  const urlCount = (sanitized.match(/https?:\/\/[^\s]+/g) || []).length;
  if (urlCount > 3) {
    errors.push('Message contains too many URLs');
  }
  
  // Check for repeated characters (potential spam)
  if (/(.)\1{10,}/.test(sanitized)) {
    errors.push('Message contains excessive repeated characters');
  }
  
  return {
    isValid: errors.length === 0,
    sanitized: sanitizeEmailContent(sanitized),
    errors
  };
}

/**
 * Validate phone number
 * @param phone - Phone number to validate
 * @returns Validation result with sanitized phone
 */
export function validatePhone(phone: string): ValidationResult {
  const errors: string[] = [];
  
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, sanitized: '', errors: ['Phone number is required'] };
  }
  
  // Remove all non-digit characters for validation
  const digitsOnly = phone.replace(/\D/g, '');
  const sanitized = phone.trim();
  
  // Check length (international format)
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    errors.push('Phone number must be between 10-15 digits');
  }
  
  // Check for suspicious patterns
  if (/<script|javascript:/i.test(sanitized)) {
    errors.push('Invalid characters in phone number');
  }
  
  return {
    isValid: errors.length === 0,
    sanitized: sanitizeHtml(sanitized),
    errors
  };
}

/**
 * Check for honeypot field (should be empty)
 * @param value - Honeypot field value
 * @returns true if appears to be a bot
 */
export function isBot(value: any): boolean {
  // If honeypot field has any value, it's likely a bot
  if (!value) return false;
  
  // If it's a string and has content, it's a bot
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  
  // If it's an object, check if it has any properties with values
  if (typeof value === 'object') {
    return Object.values(value).some(v => 
      v && typeof v === 'string' && v.trim().length > 0
    );
  }
  
  return false;
}

/**
 * Validate CSRF token
 * @param token - CSRF token from request
 * @param expectedToken - Expected CSRF token
 * @returns true if valid
 */
export function validateCSRFToken(token: string | null, expectedToken: string): boolean {
  if (!token || !expectedToken) return false;
  return token === expectedToken;
}
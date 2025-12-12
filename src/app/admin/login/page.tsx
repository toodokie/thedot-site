'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push('/admin/dashboard');
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 0'
    }}>
      <div className="container">
        <div style={{
          maxWidth: '28rem',
          margin: '0 auto',
          background: 'white',
          borderRadius: '0.75rem',
          padding: '3rem 2.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          {/* Header */}
          <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
            <div style={{
              width: '3rem',
              height: '3rem',
              background: 'var(--highlight-color)',
              borderRadius: '0.5rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--foreground)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              marginBottom: '0.25rem',
              fontFamily: 'futura-pt, Arial, sans-serif'
            }}>
              Admin Access
            </h1>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--dim-grey)',
              fontFamily: 'futura-pt, Arial, sans-serif'
            }}>
              The Dot Creative
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: 'var(--foreground)',
                  marginBottom: '0.5rem',
                  fontFamily: 'futura-pt, Arial, sans-serif'
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9375rem',
                  border: '1px solid #ddd',
                  borderRadius: '0.5rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                  fontFamily: 'futura-pt, Arial, sans-serif',
                  background: '#fafafa'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--highlight-color)';
                  e.target.style.background = 'white';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#ddd';
                  e.target.style.background = '#fafafa';
                }}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && (
              <div style={{
                background: '#fff1f0',
                border: '1px solid #ffccc7',
                color: '#cf1322',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                fontFamily: 'futura-pt, Arial, sans-serif'
              }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  style={{ marginRight: '0.5rem', flexShrink: 0 }}
                >
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#888' : 'var(--foreground)',
                color: 'white',
                fontWeight: '500',
                padding: '0.875rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                fontSize: '0.9375rem',
                fontFamily: 'futura-pt, Arial, sans-serif',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = '#2a2826';
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.background = 'var(--foreground)';
              }}
            >
              {loading ? (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{
                      marginRight: '0.5rem',
                      animation: 'spin 1s linear infinite'
                    }}
                  >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" opacity="0.75"/>
                  </svg>
                  Authenticating...
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <div style={{
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #f0f0f0',
            textAlign: 'center'
          }}>
            <p style={{
              fontSize: '0.75rem',
              color: 'var(--dim-grey)',
              marginBottom: '0.5rem',
              fontFamily: 'futura-pt, Arial, sans-serif'
            }}>
              Authorized access only • Secured connection
            </p>
            <Link
              href="/"
              style={{
                fontSize: '0.75rem',
                color: 'var(--foreground)',
                textDecoration: 'none',
                fontFamily: 'futura-pt, Arial, sans-serif',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--highlight-color)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--foreground)'}
            >
              ← Back to site
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

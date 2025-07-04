'use client';

interface HoneypotFieldProps {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
}

/**
 * Honeypot field component to catch bots
 * This field should be hidden from users but visible to bots
 */
export default function HoneypotField({ 
  name = 'website', 
  value = '', 
  onChange 
}: HoneypotFieldProps) {
  return (
    <div style={{ 
      position: 'absolute', 
      left: '-9999px', 
      top: '-9999px',
      visibility: 'hidden',
      opacity: 0,
      height: 0,
      width: 0,
      zIndex: -1,
      overflow: 'hidden'
    }}>
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ 
          height: 0, 
          width: 0, 
          border: 'none', 
          margin: 0, 
          padding: 0,
          fontSize: 0,
          lineHeight: 0
        }}
      />
      {/* Additional decoy field with common bot target name */}
      <input
        type="email"
        name="email_confirm"
        defaultValue=""
        readOnly
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ 
          height: 0, 
          width: 0, 
          border: 'none', 
          margin: 0, 
          padding: 0,
          fontSize: 0,
          lineHeight: 0
        }}
      />
      {/* Another common bot target */}
      <input
        type="url"
        name="url"
        defaultValue=""
        readOnly
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ 
          height: 0, 
          width: 0, 
          border: 'none', 
          margin: 0, 
          padding: 0,
          fontSize: 0,
          lineHeight: 0
        }}
      />
    </div>
  );
}
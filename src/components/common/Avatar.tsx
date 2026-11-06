import React from 'react';
import type { TeamMember } from '../../types/teamsync';

interface AvatarProps {
  member?: TeamMember | { fullName?: string; initials?: string; avatarUrl?: string | null };
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

const colorPalette = [
  '#0052CC', // Atlassian Blue
  '#00875A', // Green
  '#6554C0', // Purple
  '#FF5630', // Coral Red
  '#FFAB00', // Amber
  '#00B8D9', // Cyan
  '#403294', // Indigo
];

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColorForName(name?: string): string {
  if (!name) return '#5E6C84';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colorPalette.length;
  return colorPalette[index];
}

export const Avatar: React.FC<AvatarProps> = ({
  member,
  size = 'md',
  showName = false,
  className = '',
}) => {
  const name = member?.fullName || 'Unassigned';
  const initials = member?.initials || getInitials(name);
  const bgColor = getColorForName(name);

  const sizeDimensions = {
    sm: { width: 22, height: 22, fontSize: '10px' },
    md: { width: 28, height: 28, fontSize: '12px' },
    lg: { width: 36, height: 36, fontSize: '14px' },
  }[size];

  return (
    <div className={`ts-avatar-wrap ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      {member?.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt={name}
          style={{
            width: sizeDimensions.width,
            height: sizeDimensions.height,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '1.5px solid #ffffff',
            boxShadow: '0 1px 2px rgba(9, 30, 66, 0.12)',
          }}
        />
      ) : (
        <div
          title={name}
          style={{
            width: sizeDimensions.width,
            height: sizeDimensions.height,
            borderRadius: '50%',
            backgroundColor: member ? bgColor : '#DFE1E6',
            color: member ? '#ffffff' : '#5E6C84',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: sizeDimensions.fontSize,
            letterSpacing: '0.5px',
            userSelect: 'none',
            flexShrink: 0,
            border: '1.5px solid #ffffff',
            boxShadow: '0 1px 2px rgba(9, 30, 66, 0.12)',
          }}
        >
          {member ? initials : '?'}
        </div>
      )}
      {showName && (
        <span style={{ fontSize: size === 'sm' ? '12px' : '13px', fontWeight: 500, color: '#172B4D' }}>
          {name}
        </span>
      )}
    </div>
  );
};


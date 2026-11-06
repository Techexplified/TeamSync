import React from 'react';
import type { ComputedTaskStatus } from '../../types/teamsync';
import { UserCheckIcon, AlertCircleIcon, ShieldAlertIcon } from './Icons';

interface BadgeProps {
  status: ComputedTaskStatus;
  label?: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, label, className = '' }) => {
  switch (status) {
    case 'needs_owner':
      return (
        <span
          className={`ts-badge ts-badge-unassigned ${className}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '12px',
            backgroundColor: '#FFEBE6',
            color: '#BF2600',
            fontSize: '11px',
            fontWeight: 700,
            border: '1px solid #FFBDAD',
          }}
        >
          <AlertCircleIcon size={12} />
          {label || 'Needs Owner'}
        </span>
      );

    case 'needs_attention':
      return (
        <span
          className={`ts-badge ts-badge-escalated ${className}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '12px',
            backgroundColor: '#FFEBE6',
            color: '#DE350B',
            fontSize: '11px',
            fontWeight: 700,
            border: '1px solid #FF8F73',
          }}
        >
          <ShieldAlertIcon size={12} />
          {label || 'Needs Attention'}
        </span>
      );

    case 'handoff_pending':
      return (
        <span
          className={`ts-badge ts-badge-pending ${className}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '12px',
            backgroundColor: '#FFFAE6',
            color: '#B76E00',
            fontSize: '11px',
            fontWeight: 700,
            border: '1px solid #FFE380',
          }}
        >
          ⏳ {label || 'Handoff Pending'}
        </span>
      );

    case 'active':
    default:
      return (
        <span
          className={`ts-badge ts-badge-active ${className}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '12px',
            backgroundColor: '#E3FCEF',
            color: '#006644',
            fontSize: '11px',
            fontWeight: 600,
            border: '1px solid #ABF5D1',
          }}
        >
          <UserCheckIcon size={12} />
          {label || 'Active'}
        </span>
      );
  }
};


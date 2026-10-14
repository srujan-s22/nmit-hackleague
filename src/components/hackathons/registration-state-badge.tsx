'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { RegistrationState } from '@/types/hackathon';
import { getRegistrationStateDisplay } from '@/lib/hackathons/registration-state';

interface RegistrationStateBadgeProps {
  state: RegistrationState;
  className?: string;
}

export function RegistrationStateBadge({ state, className = '' }: RegistrationStateBadgeProps) {
  const display = getRegistrationStateDisplay(state);

  return (
    <Badge
      variant={display.badgeVariant}
      size="sm"
      dot
      className={className}
      title={display.description}
    >
      {display.badgeLabel}
    </Badge>
  );
}

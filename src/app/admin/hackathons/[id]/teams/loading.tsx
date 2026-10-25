import React from 'react';
import { Card } from '@/components/ui/card';

export default function HackathonTeamsLoading() {
  return (
    <div className="space-y-6 animate-pulse p-4 md:p-6">
      <div className="h-4 w-48 bg-surface-subtle rounded mb-2" />
      <div className="h-8 w-64 bg-surface-subtle rounded" />
      <div className="h-4 w-96 bg-surface-subtle rounded" />

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4 space-y-2">
            <div className="h-3 w-20 bg-surface-subtle rounded" />
            <div className="h-8 w-12 bg-surface-subtle rounded mt-2" />
          </Card>
        ))}
      </div>

      {/* Filter and Search Skeleton */}
      <Card className="p-4 flex items-center justify-between">
        <div className="h-6 w-80 bg-surface-subtle rounded" />
        <div className="h-8 w-64 bg-surface-subtle rounded" />
      </Card>

      {/* Table Skeleton */}
      <Card className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-border-subtle/50">
            <div className="space-y-1">
              <div className="h-4 w-36 bg-surface-subtle rounded" />
              <div className="h-3 w-24 bg-surface-subtle rounded" />
            </div>
            <div className="h-4 w-28 bg-surface-subtle rounded" />
            <div className="h-4 w-20 bg-surface-subtle rounded" />
            <div className="h-6 w-16 bg-surface-subtle rounded-full" />
            <div className="h-8 w-20 bg-surface-subtle rounded" />
          </div>
        ))}
      </Card>
    </div>
  );
}

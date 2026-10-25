import React from 'react';
import { Card } from '@/components/ui/card';

export default function HackathonDetailsLoading() {
  return (
    <div className="max-w-5xl space-y-6 animate-pulse p-4 md:p-6">
      <div className="h-4 w-32 bg-surface-subtle rounded mb-4" />

      {/* Hero Skeleton */}
      <div className="bg-surface-canvas rounded-lg border border-border-subtle p-6 md:p-8 space-y-4">
        <div className="flex gap-2">
          <div className="h-5 w-20 bg-surface-subtle rounded-full" />
          <div className="h-5 w-28 bg-surface-subtle rounded-full" />
        </div>
        <div className="h-8 w-2/3 bg-surface-subtle rounded" />
        <div className="h-4 w-full bg-surface-subtle rounded" />
        <div className="h-4 w-1/2 bg-surface-subtle rounded" />
        <div className="h-10 w-48 bg-surface-subtle rounded mt-4" />
      </div>

      {/* Content Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 space-y-3">
            <div className="h-5 w-40 bg-surface-subtle rounded" />
            <div className="h-4 w-full bg-surface-subtle rounded" />
            <div className="h-4 w-5/6 bg-surface-subtle rounded" />
            <div className="h-4 w-4/6 bg-surface-subtle rounded" />
          </Card>
          <Card className="p-6 space-y-4">
            <div className="h-5 w-48 bg-surface-subtle rounded" />
            <div className="h-16 w-full bg-surface-subtle rounded-md" />
            <div className="h-16 w-full bg-surface-subtle rounded-md" />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6 space-y-3">
            <div className="h-5 w-32 bg-surface-subtle rounded" />
            <div className="h-10 w-full bg-surface-subtle rounded" />
            <div className="h-10 w-full bg-surface-subtle rounded" />
          </Card>
          <Card className="p-6 space-y-3">
            <div className="h-5 w-32 bg-surface-subtle rounded" />
            <div className="h-8 w-full bg-surface-subtle rounded" />
            <div className="h-8 w-full bg-surface-subtle rounded" />
          </Card>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { LeaderboardEntry, LeaderboardFilters } from '@/types/points';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface LeaderboardClientProps {
  entries: LeaderboardEntry[];
  error?: string;
  filters: LeaderboardFilters;
  currentPage: number;
  availableEventYears: string[];
  currentUserId?: string;
}

export function LeaderboardClient({
  entries,
  error,
  filters,
  currentPage,
  availableEventYears,
  currentUserId,
}: LeaderboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateFilters = (newParams: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([key, val]) => {
      if (val && val.trim() !== '') {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    });
    // Reset to page 1 on filter changes unless changing page
    if (!('page' in newParams)) {
      params.delete('page');
    }
    startTransition(() => {
      router.push(`/leaderboard?${params.toString()}`);
    });
  };

  const handleStudyYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilters({ year: e.target.value });
  };

  const handleEventYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilters({ eventYear: e.target.value });
  };

  const handleEventTermChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilters({ term: e.target.value });
  };

  const handleResetFilters = () => {
    startTransition(() => {
      router.push('/leaderboard');
    });
  };

  const hasActiveFilters = Boolean(
    filters.academicYear || filters.eventAcademicYear || filters.eventTerm
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Platform Leaderboard
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1 max-w-3xl">
            Student rankings by verified points.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-sm bg-status-error-bg border border-status-error-border text-status-error-text text-sm">
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label htmlFor="filter-study-year" className="block text-xs font-medium text-text-secondary mb-1">
                Student Study Year
              </label>
              <Select
                id="filter-study-year"
                value={filters.academicYear ? String(filters.academicYear) : ''}
                onChange={handleStudyYearChange}
                disabled={isPending}
              >
                <option value="">All Study Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </Select>
            </div>

            <div className="flex-1 w-full">
              <label htmlFor="filter-event-year" className="block text-xs font-medium text-text-secondary mb-1">
                Event Academic Year
              </label>
              <Select
                id="filter-event-year"
                value={filters.eventAcademicYear || ''}
                onChange={handleEventYearChange}
                disabled={isPending}
              >
                <option value="">All Event Years</option>
                {availableEventYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex-1 w-full">
              <label htmlFor="filter-event-term" className="block text-xs font-medium text-text-secondary mb-1">
                Event Semester
              </label>
              <Select
                id="filter-event-term"
                value={filters.eventTerm || ''}
                onChange={handleEventTermChange}
                disabled={isPending}
              >
                <option value="">All Terms</option>
                <option value="odd_sem">Odd Semester</option>
                <option value="even_sem">Even Semester</option>
                <option value="summer_term">Summer Term</option>
              </Select>
            </div>

            {hasActiveFilters && (
              <div>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleResetFilters}
                  disabled={isPending}
                  className="whitespace-nowrap"
                >
                  Reset Filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-border-subtle flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Standings {entries.length > 0 && `(Top ${entries.length})`}
          </CardTitle>
          <span className="text-xs text-text-muted">
            Tied scores share a rank
          </span>
        </CardHeader>

        {entries.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title="No rankings found"
              description={
                hasActiveFilters
                  ? 'No students found matching your selected filter criteria. Try clearing filters to view all-time standings.'
                  : 'No points have been recorded on the platform yet.'
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={handleResetFilters}>
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 text-center">Rank</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="w-32">Branch</TableHead>
                  <TableHead className="w-32 text-center">Study Year</TableHead>
                  <TableHead className="w-44 text-center">Verified Qualifications</TableHead>
                  <TableHead className="w-32 text-right">Total Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const isCurrentUser = currentUserId === entry.student_id;
                  const isTop1 = entry.rank === 1;
                  const isTop2 = entry.rank === 2;
                  const isTop3 = entry.rank === 3;

                  return (
                    <TableRow
                      key={entry.student_id}
                      className={isCurrentUser ? 'bg-surface-subtle font-medium ring-1 ring-border-focus/40' : undefined}
                    >
                      {/* Rank Column */}
                      <TableCell className="text-center">
                        {isTop1 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs shadow-xs">
                            1
                          </span>
                        ) : isTop2 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs shadow-xs">
                            2
                          </span>
                        ) : isTop3 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-900 border border-orange-300 font-bold text-xs shadow-xs">
                            3
                          </span>
                        ) : (
                          <span className="inline-flex w-7 justify-center text-sm font-semibold text-text-secondary">
                            {entry.rank}
                          </span>
                        )}
                      </TableCell>

                      {/* Name */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text-primary">
                            {entry.full_name}
                          </span>
                          {isCurrentUser && (
                            <Badge variant="info" size="sm">
                              You
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      {/* Branch */}
                      <TableCell>
                        <Badge variant="neutral" size="sm">
                          {entry.branch}
                        </Badge>
                      </TableCell>

                      {/* Study Year */}
                      <TableCell className="text-center text-sm text-text-secondary">
                        Year {entry.academic_year}
                      </TableCell>

                      {/* Verified Qualifications */}
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-xs bg-surface-subtle text-text-secondary border border-border-subtle">
                          <svg
                            className="w-3.5 h-3.5 text-status-success-text"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {entry.verified_qualifications_count} {entry.verified_qualifications_count === 1 ? 'round' : 'rounds'}
                        </span>
                      </TableCell>

                      {/* Total Points */}
                      <TableCell className="text-right">
                        <span className="font-mono font-bold text-base text-text-primary">
                          {entry.total_points}
                        </span>
                        <span className="text-xs text-text-muted ml-1">pts</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
              <span className="text-xs text-text-secondary">
                Page {currentPage} &bull; Showing {entries.length} results
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || isPending}
                  onClick={() => updateFilters({ page: String(currentPage - 1) })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={entries.length < (filters.limit || 50) || isPending}
                  onClick={() => updateFilters({ page: String(currentPage + 1) })}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

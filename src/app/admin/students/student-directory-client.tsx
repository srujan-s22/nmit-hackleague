'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import {
  StudentAvatar,
  StudentSocialLinks,
  StudentCompetitionHistory,
  StudentPhoneRow,
  StudentEmailRow,
} from '@/components/students/student-detail-shared';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { BRANCHES } from '@/lib/validation/auth-schemas';
import {
  getStudentDirectoryAction,
  getStudentDetailAction,
  type StudentDirectoryItem,
  type StudentDetailView,
} from '@/actions/student-directory-actions';

interface StudentDirectoryClientProps {
  initialStudents: StudentDirectoryItem[];
  initialTotalCount: number;
  initialPage: number;
  initialPageSize: number;
  initialTotalPages: number;
  initialError?: string;
  isSuperAdmin?: boolean;
}

export function StudentDirectoryClient({
  initialStudents,
  initialTotalCount,
  initialPage,
  initialPageSize,
  initialTotalPages,
  initialError,
  isSuperAdmin,
}: StudentDirectoryClientProps) {
  // Directory List State
  const [students, setStudents] = useState<StudentDirectoryItem[]>(initialStudents);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [error, setError] = useState<string | null>(initialError || null);
  const [isPending, startTransition] = useTransition();

  // Filter & Search State
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [sortBy, setSortBy] = useState<'full_name' | 'usn' | 'branch' | 'academic_year'>('full_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Detail Modal State
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<StudentDetailView | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Query Execution Helper
  const loadDirectory = (targetPage: number) => {
    setError(null);
    startTransition(async () => {
      const res = await getStudentDirectoryAction({
        page: targetPage,
        pageSize,
        search: search.trim() || undefined,
        branch: branchFilter || undefined,
        academic_year: yearFilter ? Number(yearFilter) : undefined,
        sortBy,
        sortDirection,
      });

      if (res.success) {
        setStudents(res.students);
        setTotalCount(res.totalCount);
        setPage(res.page);
        setTotalPages(res.totalPages);
      } else {
        setError(res.error || 'Failed to fetch student directory.');
      }
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDirectory(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setBranchFilter('');
    setYearFilter('');
    setSortBy('full_name');
    setSortDirection('asc');
    setError(null);
    startTransition(async () => {
      const res = await getStudentDirectoryAction({
        page: 1,
        pageSize,
        sortBy: 'full_name',
        sortDirection: 'asc',
      });
      if (res.success) {
        setStudents(res.students);
        setTotalCount(res.totalCount);
        setPage(1);
        setTotalPages(res.totalPages);
      }
    });
  };

  // Student Detail Fetcher
  const handleOpenDetail = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setDetailData(null);
    setDetailError(null);
    setIsDetailLoading(true);

    try {
      const res = await getStudentDetailAction(studentId);
      if (res.success && res.data) {
        setDetailData(res.data);
      } else {
        setDetailError(res.error || 'Failed to load student details.');
      }
    } catch {
      setDetailError('Network error loading student details.');
    } finally {
      setIsDetailLoading(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* 1. Global Notification / Error Alert */}
      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 2. Controls & Filter Bar */}
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Input
                type="search"
                placeholder="Search approved students by full name or official USN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={isPending}
                className="w-full pl-9"
              />
              <svg
                className="w-4 h-4 absolute left-3 top-3 text-text-helper pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? 'Searching...' : 'Search'}
              </Button>
              {(search || branchFilter || yearFilter || sortBy !== 'full_name' || sortDirection !== 'asc') && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetFilters}
                  disabled={isPending}
                >
                  Reset
                </Button>
              )}
            </div>
          </form>

          {/* Filter Pills / Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border-subtle">
            <div>
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                Department / Branch
              </label>
              <Select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setTimeout(() => loadDirectory(1), 0);
                }}
                disabled={isPending}
                options={[
                  { label: 'All Departments', value: '' },
                  ...BRANCHES.map((b) => ({ label: `${b} Department`, value: b })),
                ]}
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                Academic Study Year
              </label>
              <Select
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value);
                  setTimeout(() => loadDirectory(1), 0);
                }}
                disabled={isPending}
                options={[
                  { label: 'All Study Years', value: '' },
                  { label: 'Year 1 (Freshmen)', value: '1' },
                  { label: 'Year 2 (Sophomores)', value: '2' },
                  { label: 'Year 3 (Juniors)', value: '3' },
                  { label: 'Year 4 (Seniors)', value: '4' },
                ]}
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                Sort Field
              </label>
              <Select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as any);
                  setTimeout(() => loadDirectory(1), 0);
                }}
                disabled={isPending}
                options={[
                  { label: 'Student Name', value: 'full_name' },
                  { label: 'University Seat Number (USN)', value: 'usn' },
                  { label: 'Department / Branch', value: 'branch' },
                  { label: 'Academic Year', value: 'academic_year' },
                ]}
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                Order
              </label>
              <Select
                value={sortDirection}
                onChange={(e) => {
                  setSortDirection(e.target.value as 'asc' | 'desc');
                  setTimeout(() => loadDirectory(1), 0);
                }}
                disabled={isPending}
                options={[
                  { label: 'Ascending (A–Z / 1–4)', value: 'asc' },
                  { label: 'Descending (Z–A / 4–1)', value: 'desc' },
                ]}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Directory Listing Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Verified Student Roster</CardTitle>
            <CardDescription>
              Showing {students.length} of {totalCount} approved student{totalCount === 1 ? '' : 's'} across the institution.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary hidden sm:inline">
              Page {page} of {totalPages || 1}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-full bg-surface-muted text-text-helper flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-text-primary">No Approved Students Found</h3>
              <p className="text-xs text-text-secondary max-w-sm mx-auto">
                {search || branchFilter || yearFilter
                  ? 'No approved students match the specified search query or filters. Try adjusting your search criteria.'
                  : 'No students have been approved yet. Students must complete onboarding and receive administrative verification.'}
              </p>
              {(search || branchFilter || yearFilter) && (
                <Button variant="outline" size="sm" onClick={handleResetFilters} className="mt-2">
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Official USN</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Professional Profiles</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id} className="hover:bg-surface-subtle/50 transition-colors">
                      {/* Name & Avatar */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-surface-muted shrink-0 flex items-center justify-center border border-border-subtle overflow-hidden">
                            {student.avatar_url ? (
                              <img
                                src={student.avatar_url}
                                alt={student.full_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-text-secondary">
                                {student.full_name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-sm text-text-primary block">
                              {student.full_name}
                            </span>
                            <Badge variant="success" size="sm" dot>
                              Approved
                            </Badge>
                          </div>
                        </div>
                      </TableCell>

                      {/* USN */}
                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-text-primary bg-surface-subtle px-2 py-1 rounded border border-border-subtle">
                          {student.usn}
                        </span>
                      </TableCell>

                      {/* Branch */}
                      <TableCell>
                        <span className="text-xs font-medium text-text-secondary">
                          {student.branch}
                        </span>
                      </TableCell>

                      {/* Academic Year */}
                      <TableCell>
                        <Badge variant="neutral" size="sm">
                          Year {student.academic_year}
                        </Badge>
                      </TableCell>

                      {/* Total Points */}
                      <TableCell>
                        <span className="text-xs font-bold text-brand-primary">
                          {student.total_points.toLocaleString()} pts
                        </span>
                      </TableCell>

                      {/* LinkedIn & GitHub Links */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {student.linkedin_url ? (
                            <a
                              href={student.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${student.full_name}'s LinkedIn profile`}
                              className="p-1.5 rounded bg-[#0A66C2]/10 text-[#0A66C2] hover:bg-[#0A66C2]/20 transition-colors"
                              title="LinkedIn Profile"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.62 1.62 0 0 0-1.62 1.62 1.62 1.62 0 0 0 1.62 1.62 1.62 1.62 0 0 0 1.62-1.62c0-.9-.73-1.62-1.62-1.62Z" />
                              </svg>
                            </a>
                          ) : (
                            <span className="text-[11px] text-text-helper italic">—</span>
                          )}

                          {student.github_url ? (
                            <a
                              href={student.github_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${student.full_name}'s GitHub profile`}
                              className="p-1.5 rounded bg-surface-muted text-text-primary hover:bg-surface-subtle transition-colors border border-border-subtle"
                              title="GitHub Profile"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                              </svg>
                            </a>
                          ) : null}
                        </div>
                      </TableCell>

                      {/* Detail Action */}
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDetail(student.id)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* 4. Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border-subtle">
              <span className="text-xs text-text-secondary">
                Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} students
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadDirectory(page - 1)}
                  disabled={page <= 1 || isPending}
                >
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => loadDirectory(pageNum)}
                        disabled={isPending}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadDirectory(page + 1)}
                  disabled={page >= totalPages || isPending}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Authorized Student Detail Dialog */}
      <Dialog
        isOpen={Boolean(selectedStudentId)}
        onClose={() => {
          setSelectedStudentId(null);
          setDetailData(null);
          setDetailError(null);
        }}
        title="Institutional Student Profile"
        description="Comprehensive verified profile, academic credentials, and competition timeline."
        maxWidth="lg"
      >
        {isDetailLoading && (
          <div className="py-12 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-text-secondary">Decrypting verified student profile...</p>
          </div>
        )}

        {detailError && (
          <Alert variant="error" className="my-4">
            {detailError}
          </Alert>
        )}

        {detailData && !isDetailLoading && (
          <div className="space-y-6 pt-2">
            {/* Header Identity Row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-lg bg-surface-subtle border border-border-subtle">
              <StudentAvatar
                avatarUrl={detailData.avatar_url}
                fullName={detailData.full_name}
                sizeClassName="w-16 h-16"
                initialsClassName="text-lg"
              />

              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-text-primary">{detailData.full_name}</h2>
                  <Badge variant="success" size="sm" dot>
                    Approved & Verified
                  </Badge>
                </div>
                <p className="text-xs font-mono font-medium text-text-secondary">
                  Official USN: <span className="text-text-primary font-semibold">{detailData.usn}</span>
                </p>
                <p className="text-xs text-text-secondary">
                  {detailData.branch} Department • Year {detailData.academic_year} • {detailData.sex || 'Not Specified'}
                </p>
              </div>

              <div className="text-right border-t sm:border-t-0 sm:border-l border-border-subtle pt-2 sm:pt-0 sm:pl-4">
                <span className="text-[11px] text-text-secondary uppercase tracking-wider block font-semibold">
                  Total Points
                </span>
                <span className="text-lg font-bold text-brand-primary">
                  {detailData.total_points.toLocaleString()} pts
                </span>
                {detailData.rank !== null && (
                  <span className="text-xs text-text-secondary block font-medium">
                    Rank #{detailData.rank}
                  </span>
                )}
              </div>
            </div>

            {/* Verified Contact Details Card (Exclusive to Detail View) */}
            <div className="p-4 rounded-lg bg-brand-primary/5 border border-brand-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-primary flex items-center gap-1.5 uppercase tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Confidential Verified Contact Information
                </span>
                <Badge variant="neutral" size="sm">
                  Restricted to Detail View
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <StudentPhoneRow phone={detailData.phone} compact />
                <StudentEmailRow email={detailData.email} compact />
              </div>
            </div>

            {/* Professional Profiles */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
                Professional Online Presence
              </span>
              <StudentSocialLinks linkedinUrl={detailData.linkedin_url} githubUrl={detailData.github_url} size="sm" />
            </div>

            {/* Competition History Timeline */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
                Hackathon & Competition Participations ({detailData.competitions.length})
              </span>

              <StudentCompetitionHistory competitions={detailData.competitions} variant="compact" />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

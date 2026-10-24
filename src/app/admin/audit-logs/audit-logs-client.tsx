'use client';

import React, { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getAuditLogsAction, type AuditLogItem } from '@/actions/audit-log-actions';
import { formatDateTime } from '@/lib/utils/date-format';

export interface AuditLogsClientProps {
  initialLogs: AuditLogItem[];
  initialTotalCount: number;
  isSuperAdmin: boolean;
}

export function AuditLogsClient({
  initialLogs,
  initialTotalCount,
  isSuperAdmin,
}: AuditLogsClientProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>(initialLogs);
  const [totalCount, setTotalCount] = useState<number>(initialTotalCount);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  const fetchLogs = async (newPage: number, action = actionFilter, targetType = targetTypeFilter) => {
    setIsLoading(true);
    const res = await getAuditLogsAction({
      action: action.trim() || undefined,
      targetType: targetType.trim() || undefined,
      limit: pageSize,
      offset: newPage * pageSize,
    });
    setIsLoading(false);

    if (res.success) {
      setLogs(res.logs);
      setTotalCount(res.totalCount);
      setPage(newPage);
    }
  };

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(0);
  };

  const handleResetFilters = () => {
    setActionFilter('');
    setTargetTypeFilter('');
    fetchLogs(0, '', '');
  };

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const formatActionBadge = (action: string) => {
    if (action.includes('reject') || action.includes('failed') || action.includes('danger')) {
      return <Badge variant="error">{action}</Badge>;
    }
    if (action.includes('reopen') || action.includes('revision') || action.includes('warning')) {
      return <Badge variant="warning">{action}</Badge>;
    }
    if (action.includes('accept') || action.includes('winner') || action.includes('success')) {
      return <Badge variant="success">{action}</Badge>;
    }
    return <Badge variant="neutral">{action}</Badge>;
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail & Compliance Log"
        description="Immutable record of administrative decisions, milestone reviews, exception overrides, and system operations."
        breadcrumbs={[
          { label: 'Admin Workspace', href: '/admin' },
          { label: 'Audit Trail' },
        ]}
      />

      {/* Filter Card */}
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-56 space-y-1">
              <label htmlFor="filter-action-input" className="block text-xs font-medium text-text-secondary">
                Filter by Action
              </label>
              <Input
                id="filter-action-input"
                placeholder="e.g., reopen_rejected_submission"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div className="w-full sm:w-56 space-y-1">
              <label htmlFor="filter-target-type-input" className="block text-xs font-medium text-text-secondary">
                Filter by Target Type
              </label>
              <Input
                id="filter-target-type-input"
                placeholder="e.g., submissions"
                value={targetTypeFilter}
                onChange={(e) => setTargetTypeFilter(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isLoading}
              id="btn-apply-audit-filters"
            >
              Filter Logs
            </Button>

            {(actionFilter || targetTypeFilter) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                id="btn-reset-audit-filters"
              >
                Reset
              </Button>
            )}

            <div className="ml-auto text-xs text-text-muted self-center">
              Showing {logs.length} of {totalCount} records
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Audit Logs Table Card */}
      <Card>
        <CardHeader className="pb-3 border-b border-border-subtle flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Audit Event Trail</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 0 || isLoading}
              onClick={() => fetchLogs(page - 1)}
              id="btn-audit-prev-page"
            >
              &larr; Prev
            </Button>
            <span className="text-xs text-text-secondary">
              Page {page + 1} of {Math.max(totalPages, 1)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1 || isLoading}
              onClick={() => fetchLogs(page + 1)}
              id="btn-audit-next-page"
            >
              Next &rarr;
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-xs">
              No audit log entries matching your criteria.
            </div>
          ) : (
            <div className="divide-y divide-border-subtle overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-background-elevated/50 text-[11px] font-semibold text-text-muted uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Target</th>
                    <th className="py-2.5 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50">
                  {logs.map((log) => {
                    const isExpanded = Boolean(expandedLogIds[log.id]);
                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-background-elevated/30 transition-colors">
                          <td className="py-2.5 px-4 whitespace-nowrap text-text-secondary font-mono text-[11px]">
                            {formatDateTime(log.created_at)}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {formatActionBadge(log.action)}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap text-text-secondary">
                            <span className="font-semibold text-text-primary">
                              {log.actor_role || 'system'}
                            </span>
                            {log.actor_id && (
                              <span className="block text-[10px] text-text-muted font-mono truncate max-w-[120px]">
                                {log.actor_id}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap text-text-secondary">
                            <span className="font-medium text-text-primary">
                              {log.target_type || '—'}
                            </span>
                            {log.target_id && (
                              <span className="block text-[10px] text-text-muted font-mono truncate max-w-[140px]">
                                {log.target_id}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            {log.details ? (
                              <Button
                                variant="tertiary"
                                size="sm"
                                className="h-6 text-[11px] px-2"
                                onClick={() => toggleExpand(log.id)}
                                id={`btn-expand-details-${log.id}`}
                              >
                                {isExpanded ? 'Hide' : 'Inspect'} Details
                              </Button>
                            ) : (
                              <span className="text-[11px] text-text-muted italic">None</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && log.details && (
                          <tr className="bg-background-elevated/80">
                            <td colSpan={5} className="p-3 text-[11px]">
                              <div className="font-semibold text-text-muted mb-1">
                                Event Payload / Context Metadata:
                              </div>
                              <pre className="p-2.5 rounded bg-surface-canvas border border-border-subtle font-mono text-[11px] text-text-primary overflow-x-auto max-h-60">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

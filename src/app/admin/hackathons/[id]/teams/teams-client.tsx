'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { RegistrationProofModal } from '@/components/submissions/registration-proof-modal';
import { formatDateTime } from '@/lib/utils/date-format';

export interface StudentProfileSummary {
  id: string;
  full_name: string;
  usn: string;
  branch: string;
  academic_year: number;
}

export interface RosterTeamItem {
  id: string;
  name: string;
  hackathon_id: string;
  leader_id: string;
  internal_status: string;
  external_status: string;
  external_proof_path: string | null;
  external_proof_submitted_at: string | null;
  cdc_declaration_accepted: boolean;
  cdc_declaration_accepted_at: string | null;
  created_at: string;
  leader: StudentProfileSummary | null;
  members: StudentProfileSummary[];
}

interface TeamsClientProps {
  hackathon: {
    id: string;
    title: string;
    slug: string;
    status: string;
    min_team_size: number;
    max_team_size: number;
    is_solo_allowed: boolean;
  };
  initialTeams: RosterTeamItem[];
  isSuperAdmin: boolean;
  fetchError?: string | null;
}

export function TeamsClient({
  hackathon,
  initialTeams,
  isSuperAdmin,
  fetchError,
}: TeamsClientProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'complete' | 'forming' | 'proof_submitted' | 'proof_missing'
  >('all');

  // Proof inspection modal state
  const [activeProofTeam, setActiveProofTeam] = useState<{
    teamId: string;
    teamName: string;
    cdcAccepted: boolean;
  } | null>(null);

  // Expanded member list for quick inline viewing
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  // Compute roster metrics
  const metrics = useMemo(() => {
    let complete = 0;
    let forming = 0;
    let proofSubmitted = 0;
    let proofMissing = 0;

    for (const t of initialTeams) {
      if (t.internal_status === 'complete') complete++;
      else forming++;

      if (t.external_proof_path || t.external_status === 'submitted' || t.external_status === 'verified') {
        proofSubmitted++;
      } else {
        proofMissing++;
      }
    }

    return {
      total: initialTeams.length,
      complete,
      forming,
      proofSubmitted,
      proofMissing,
    };
  }, [initialTeams]);

  // Filter teams based on search query and status tab
  const filteredTeams = useMemo(() => {
    return initialTeams.filter((t) => {
      // 1. Tab filter
      if (statusFilter === 'complete' && t.internal_status !== 'complete') return false;
      if (statusFilter === 'forming' && t.internal_status !== 'forming') return false;
      if (
        statusFilter === 'proof_submitted' &&
        !t.external_proof_path &&
        t.external_status !== 'submitted' &&
        t.external_status !== 'verified'
      ) {
        return false;
      }
      if (
        statusFilter === 'proof_missing' &&
        (t.external_proof_path || t.external_status === 'submitted' || t.external_status === 'verified')
      ) {
        return false;
      }

      // 2. Search query filter
      if (!search.trim()) return true;
      const query = search.toLowerCase();

      // Check team name
      if (t.name.toLowerCase().includes(query)) return true;

      // Check leader
      if (
        t.leader?.full_name.toLowerCase().includes(query) ||
        t.leader?.usn.toLowerCase().includes(query) ||
        t.leader?.branch.toLowerCase().includes(query)
      ) {
        return true;
      }

      // Check members
      return t.members.some(
        (m) =>
          m.full_name.toLowerCase().includes(query) ||
          m.usn.toLowerCase().includes(query) ||
          m.branch.toLowerCase().includes(query)
      );
    });
  }, [initialTeams, search, statusFilter]);

  const toggleExpandTeam = (teamId: string) => {
    setExpandedTeamId((prev) => (prev === teamId ? null : teamId));
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Link href="/admin/hackathons" className="hover:text-text-primary transition-colors">
            Hackathons
          </Link>
          <span>/</span>
          <Link
            href={`/hackathons/${hackathon.slug}`}
            className="hover:text-brand-primary transition-colors font-medium text-text-secondary"
          >
            {hackathon.title}
          </Link>
          <span>/</span>
          <span className="text-text-primary font-semibold">Registered Teams</span>
        </div>

        {/* Action Quick Links */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/hackathons/${hackathon.id}/submissions`}
            className="text-xs font-semibold px-3 py-1.5 rounded bg-surface-canvas border border-border-subtle text-text-primary hover:bg-surface-subtle transition-colors"
            id="btn-nav-submissions-queue"
          >
            Submissions Queue &rarr;
          </Link>
          <Link
            href={`/hackathons/${hackathon.slug}`}
            className="text-xs font-semibold px-3 py-1.5 rounded bg-surface-canvas border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
            id="btn-nav-public-details"
          >
            Public Details &rarr;
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Registered Teams — {hackathon.title}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Review registered teams, verified member rosters, and external registration claims for institutional oversight.
          </p>
        </div>
      </div>

      {/* Safe Error Banner */}
      {fetchError && (
        <div
          role="alert"
          className="p-4 rounded-md bg-status-error-bg border border-status-error-border text-status-error-text text-xs flex items-center justify-between"
          id="alert-teams-fetch-error"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">Notice:</span>
            <span>{fetchError}</span>
          </div>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Total Teams</span>
          <span className="text-2xl font-bold text-text-primary mt-2">{metrics.total}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Complete Rosters</span>
          <span className="text-2xl font-bold text-status-success-text mt-2">{metrics.complete}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Forming / Incomplete</span>
          <span className="text-2xl font-bold text-status-warning-text mt-2">{metrics.forming}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Proofs Submitted</span>
          <span className="text-2xl font-bold text-brand-primary mt-2">{metrics.proofSubmitted}</span>
        </Card>
      </div>

      {/* Filter Tabs and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { key: 'all', label: `All Teams (${metrics.total})` },
              { key: 'complete', label: `Complete (${metrics.complete})` },
              { key: 'forming', label: `Forming (${metrics.forming})` },
              { key: 'proof_submitted', label: `Proof Submitted (${metrics.proofSubmitted})` },
              { key: 'proof_missing', label: `Proof Missing (${metrics.proofMissing})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                  statusFilter === tab.key
                    ? 'bg-surface-inverse text-text-inverse font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full md:w-72">
            <Input
              placeholder="Search by team name, student, or USN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
              id="input-roster-search"
            />
          </div>
        </div>
      </Card>

      {/* Roster Table */}
      {filteredTeams.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            title="No teams found"
            description={
              search.trim()
                ? 'No registered teams match your current search query.'
                : 'No teams have formed in this category for this hackathon yet.'
            }
          />
        </Card>
      ) : (
        <div className="border border-border-subtle rounded-md overflow-hidden bg-surface-canvas shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-text-primary divide-y divide-border-subtle">
              <thead className="bg-surface-subtle text-text-secondary font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="p-3.5 pl-4">Team</th>
                  <th scope="col" className="p-3.5">Leader</th>
                  <th scope="col" className="p-3.5">Members</th>
                  <th scope="col" className="p-3.5">Formation</th>
                  <th scope="col" className="p-3.5">External Registration</th>
                  <th scope="col" className="p-3.5 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface-canvas">
                {filteredTeams.map((team) => {
                  const isExpanded = expandedTeamId === team.id;
                  const hasProof = Boolean(team.external_proof_path);

                  return (
                    <React.Fragment key={team.id}>
                      <tr className="hover:bg-surface-subtle/50 transition-colors">
                        {/* Team Name */}
                        <td className="p-3.5 pl-4 align-top">
                          <div className="font-semibold text-text-primary text-xs sm:text-sm">
                            {team.name}
                          </div>
                          <span className="text-[11px] text-text-muted block mt-0.5">
                            Created {formatDateTime(team.created_at)}
                          </span>
                        </td>

                        {/* Leader Details */}
                        <td className="p-3.5 align-top">
                          {team.leader ? (
                            <div>
                              <div className="font-medium text-text-primary">
                                {team.leader.full_name}
                              </div>
                              <div className="text-[11px] text-text-muted font-mono mt-0.5">
                                {team.leader.usn} &bull; {team.leader.branch} (Yr {team.leader.academic_year})
                              </div>
                            </div>
                          ) : (
                            <span className="text-text-muted italic">Unassigned</span>
                          )}
                        </td>

                        {/* Members Count & Quick View */}
                        <td className="p-3.5 align-top">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">
                              {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
                            </span>
                            {team.members.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleExpandTeam(team.id)}
                                className="text-[11px] text-brand-primary hover:underline font-medium"
                              >
                                {isExpanded ? 'Hide' : 'View'}
                              </button>
                            )}
                          </div>
                          <div className="text-[11px] text-text-muted mt-0.5">
                            Required: {hackathon.min_team_size}–{hackathon.max_team_size}
                          </div>
                        </td>

                        {/* Internal Formation Status */}
                        <td className="p-3.5 align-top">
                          <Badge
                            variant={team.internal_status === 'complete' ? 'success' : 'warning'}
                            size="sm"
                            className="capitalize text-[11px]"
                          >
                            {team.internal_status}
                          </Badge>
                        </td>

                        {/* External Registration & CDC Status */}
                        <td className="p-3.5 align-top">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant={
                                  team.external_status === 'verified'
                                    ? 'success'
                                    : team.external_status === 'submitted'
                                    ? 'info'
                                    : team.external_status === 'rejected'
                                    ? 'error'
                                    : 'neutral'
                                }
                                size="sm"
                                className="capitalize text-[11px]"
                              >
                                {team.external_status === 'not_submitted'
                                  ? 'Not Submitted'
                                  : team.external_status}
                              </Badge>

                              {team.cdc_declaration_accepted && (
                                <Badge variant="neutral" size="sm" className="text-[10px] bg-status-success-bg text-status-success-text border-none">
                                  CDC Accepted
                                </Badge>
                              )}
                            </div>

                            {team.external_proof_submitted_at && (
                              <span className="text-[10px] text-text-muted block">
                                Submitted {formatDateTime(team.external_proof_submitted_at)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 pr-4 align-top text-right">
                          {hasProof ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() =>
                                setActiveProofTeam({
                                  teamId: team.id,
                                  teamName: team.name,
                                  cdcAccepted: team.cdc_declaration_accepted,
                                })
                              }
                              id={`btn-view-proof-${team.id}`}
                            >
                              Inspect Proof
                            </Button>
                          ) : (
                            <span className="text-[11px] text-text-muted italic">
                              No proof attached
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Member Roster Row */}
                      {isExpanded && team.members.length > 0 && (
                        <tr className="bg-surface-subtle/30">
                          <td colSpan={6} className="p-3 pl-8 pr-4">
                            <div className="border-l-2 border-brand-primary pl-4 py-1 space-y-2">
                              <span className="text-[11px] uppercase font-semibold text-text-muted block tracking-wider">
                                Team Roster ({team.members.length} Confirmed Students)
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {team.members.map((member) => (
                                  <div
                                    key={member.id}
                                    className="p-2 rounded bg-surface-canvas border border-border-subtle text-xs"
                                  >
                                    <div className="font-semibold text-text-primary flex items-center justify-between">
                                      <span>{member.full_name}</span>
                                      {member.id === team.leader_id && (
                                        <Badge variant="neutral" size="sm" className="text-[10px] py-0 px-1 font-mono">
                                          Leader
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-text-secondary font-mono mt-0.5">
                                      {member.usn} &bull; {member.branch} (Yr {member.academic_year})
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Proof Preview Modal */}
      {activeProofTeam && (
        <RegistrationProofModal
          isOpen={Boolean(activeProofTeam)}
          onClose={() => setActiveProofTeam(null)}
          teamId={activeProofTeam.teamId}
          teamName={activeProofTeam.teamName}
          cdcDeclarationAccepted={activeProofTeam.cdcAccepted}
        />
      )}
    </div>
  );
}

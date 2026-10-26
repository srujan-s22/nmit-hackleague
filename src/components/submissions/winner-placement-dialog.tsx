'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { recordRoundWinnerPlacementAction } from '@/actions/round-review-actions';

export interface WinnerPlacementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string;
  submissionTitle: string;
  teamName: string;
  onSuccess: () => void;
}

export function WinnerPlacementDialog({
  isOpen,
  onClose,
  submissionId,
  submissionTitle,
  teamName,
  onSuccess,
}: WinnerPlacementDialogProps) {
  const [placement, setPlacement] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setPlacement(1);
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const res = await recordRoundWinnerPlacementAction(submissionId, placement);
    setIsSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || 'Failed to record winner placement.');
    }
  };

  const placementLabels: Record<1 | 2 | 3, { title: string; badge: string; color: string }> = {
    1: { title: '1st Place — Champion', badge: '1st Place', color: 'border-amber-400 bg-amber-500/10 text-amber-300' },
    2: { title: '2nd Place — Runner Up', badge: '2nd Place', color: 'border-slate-300 bg-slate-400/10 text-slate-200' },
    3: { title: '3rd Place — Bronze Finalist', badge: '3rd Place', color: 'border-amber-700 bg-amber-700/10 text-amber-500' },
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Award Official Winner Placement"
      description={`Record competitive ranking for ${teamName} (${submissionTitle}).`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
            id="btn-cancel-placement"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            id="btn-confirm-winner-placement"
          >
            Award {placementLabels[placement].badge}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-danger-bg text-status-danger-text rounded text-xs" id="placement-error-banner">
            {error}
          </div>
        )}

        <div className="space-y-2" role="radiogroup" aria-label="Placement Selection">
          {([1, 2, 3] as const).map((p) => {
            const isSelected = placement === p;
            return (
              <label
                key={p}
                className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-all ${
                  isSelected
                    ? `${placementLabels[p].color} border-2 shadow-sm`
                    : 'border-border-subtle bg-background-elevated hover:bg-background-elevated/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="placement"
                    checked={isSelected}
                    onChange={() => setPlacement(p)}
                    className="accent-brand-primary"
                    id={`radio-placement-${p}`}
                  />
                  <div>
                    <div className="text-xs font-bold text-text-primary">
                      {placementLabels[p].title}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      Official verified result in public results ledger
                    </div>
                  </div>
                </div>
                <span className="text-base font-bold">{placementLabels[p].badge.split(' ')[0]}</span>
              </label>
            );
          })}
        </div>

        <p className="text-[11px] text-text-muted italic">
          Note: This action records the verified placement result. Milestone points are transactional and idempotent.
        </p>
      </form>
    </Dialog>
  );
}

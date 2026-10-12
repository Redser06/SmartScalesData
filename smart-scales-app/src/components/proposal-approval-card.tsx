"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { applyApprovedProposal, discardProposal } from '@/app/actions';
import type { ScenarioProposalItem } from '@/types/journey';

interface ProposalApprovalCardProps {
  proposal: ScenarioProposalItem;
  onResolved: () => void;
}

export function ProposalApprovalCard({ proposal, onResolved }: ProposalApprovalCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  let parsedPayload: Record<string, unknown> = {};
  try {
    parsedPayload = JSON.parse(proposal.payloadJson);
  } catch {
    parsedPayload = {};
  }

  const handleConfirm = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const approvalRef = `ui-confirm-${proposal.id}-${Date.now()}`;
      const res = await applyApprovedProposal(proposal.id, proposal.stateHash, approvalRef);
      if (res.success) {
        onResolved();
      } else {
        setErrorMsg(res.error ?? 'Failed to apply proposal');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDiscard = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await discardProposal(proposal.id);
      if (res.success) {
        onResolved();
      } else {
        setErrorMsg(res.error ?? 'Failed to discard proposal');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-indigo-950/50 border border-indigo-500/40 rounded-xl p-3.5 space-y-2.5 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
          <ShieldAlert className="h-4 w-4 text-indigo-400" />
          <span>
            Pending Approval:{' '}
            {proposal.kind === 'log_entry'
              ? 'Log Weight Entry'
              : proposal.kind === 'update_target'
                ? 'Update Journey Target'
                : 'Apply Solution Pathway'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400">#{proposal.stateHash.slice(0, 8)}</span>
      </div>

      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-2.5 text-zinc-300 space-y-1">
        {proposal.kind === 'log_entry' ? (
          <>
            <div>
              Weight: <strong className="text-white">{String(parsedPayload.weight ?? '--')} kg</strong>
            </div>
            {parsedPayload.bodyFat !== null && parsedPayload.bodyFat !== undefined && (
              <div>
                Body Fat: <strong className="text-white">{String(parsedPayload.bodyFat)}%</strong>
              </div>
            )}
            {parsedPayload.note ? (
              <div>
                Note: <span className="text-zinc-400">{String(parsedPayload.note)}</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-0.5">
            {Object.entries(parsedPayload).map(([k, v]) =>
              v !== undefined && v !== null ? (
                <div key={k}>
                  <span className="text-zinc-400">{k}:</span>{' '}
                  <strong className="text-white">{String(v)}</strong>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {errorMsg && <div className="text-rose-400 text-[11px]">{errorMsg}</div>}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          disabled={submitting}
          onClick={handleConfirm}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          Confirm &amp; Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={handleDiscard}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 text-xs"
        >
          <XCircle className="h-3.5 w-3.5 mr-1" />
          Discard
        </Button>
      </div>
    </div>
  );
}

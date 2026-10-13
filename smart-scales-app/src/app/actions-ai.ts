'use server';

import {
  applyApprovedProposal,
  createScenarioProposal,
  resolveAuthenticatedUserId,
} from '@/app/actions';

/**
 * Auth-isolated AI weight logging action.
 * Never inserts orphaned rows with userId: null and never mutates WeightEntry directly
 * without an explicit approvalRef.
 */
export async function logWeightEntry(data: {
  weight: number;
  note?: string;
  bodyFat?: number;
  muscleMass?: number;
  timestamp?: string;
  stateHash?: string;
  approvalRef?: string;
}) {
  try {
    // Enforce authentication (throws / redirects if unauthenticated)
    await resolveAuthenticatedUserId();

    const proposal = await createScenarioProposal({
      kind: 'log_entry',
      stateHash: data.stateHash,
      payload: {
        weight: data.weight,
        note: data.note ?? null,
        bodyFat: data.bodyFat ?? null,
        muscleMass: data.muscleMass ?? null,
        timestamp: data.timestamp ?? new Date().toISOString(),
      },
    });

    if (data.approvalRef && data.approvalRef.trim()) {
      const applied = await applyApprovedProposal(
        proposal.id,
        proposal.stateHash,
        data.approvalRef
      );
      return {
        success: applied.success,
        status: applied.success ? 'approved' : 'pending',
        proposal,
        error: applied.error,
      };
    }

    return {
      success: true,
      status: 'pending' as const,
      proposal,
    };
  } catch (error) {
    console.error('Error creating weight proposal:', error);
    return { success: false, error: 'Failed to create weight entry proposal' };
  }
}

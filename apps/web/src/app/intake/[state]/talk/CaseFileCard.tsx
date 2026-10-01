'use client';

import DecisionPathList from '@/components/DecisionPathList';
import { decodeDecisionPath } from '@/lib/decisionPath';
import type { EligibilityReport, StateTree } from '@/lib/schemas';
import { useMemo } from 'react';
import {
  CaseDivider,
  CaseFilePanel,
  CaseFilePanelTitle,
  CaseLabel,
  CaseRow,
  CaseValue,
  ResultKey,
  ResultSection,
  StatusPill,
} from './CaseFileCard.styles';

type AgentStatus = 'pending' | 'running' | 'complete' | 'error';

interface Props {
  state: string;
  intakeId: string | null;
  status: AgentStatus;
  report: EligibilityReport | null;
  decisionTree: StateTree | null;
}

export default function CaseFileCard({ state, intakeId, status, report, decisionTree }: Props) {
  const statusLabel: Record<AgentStatus, string> = {
    pending: 'Waiting',
    running: 'Analyzing…',
    complete: 'Complete',
    error: 'Error',
  };

  const decodedPath = useMemo(
    () => (report ? decodeDecisionPath(report.traversed_path, decisionTree) : []),
    [report, decisionTree],
  );

  return (
    // tabIndex: a decoded decision path can run longer than the panel's
    // fixed height, and a scrollable region with no focusable content of
    // its own is otherwise unreachable by keyboard.
    <CaseFilePanel aria-label="Case file" tabIndex={0}>
      <CaseFilePanelTitle>Case File</CaseFilePanelTitle>

      <dl>
        <CaseRow>
          <CaseLabel>State</CaseLabel>
          <CaseValue>{state.charAt(0).toUpperCase() + state.slice(1)}</CaseValue>
        </CaseRow>

        <CaseRow>
          <CaseLabel>Mode</CaseLabel>
          <CaseValue>Agent</CaseValue>
        </CaseRow>

        <CaseRow>
          <CaseLabel>Status</CaseLabel>
          <CaseValue>
            <StatusPill $status={status}>{statusLabel[status]}</StatusPill>
          </CaseValue>
        </CaseRow>

        {intakeId && (
          <CaseRow>
            <CaseLabel>Session ID</CaseLabel>
            <CaseValue>{intakeId.slice(0, 14)}…</CaseValue>
          </CaseRow>
        )}
      </dl>

      {report && (
        <>
          <CaseDivider />
          <ResultSection aria-label="Eligibility result">
            <dl>
              <CaseRow>
                <CaseLabel>Outcome</CaseLabel>
                <ResultKey>{report.result_label}</ResultKey>
              </CaseRow>

              {report.recommended_services.length > 0 && (
                <CaseRow>
                  <CaseLabel>Services</CaseLabel>
                  {report.recommended_services.map((svc) => (
                    <CaseValue key={svc.key}>{svc.name}</CaseValue>
                  ))}
                </CaseRow>
              )}

              {report.traversed_path.length > 0 && (
                <CaseRow>
                  <CaseLabel>Decision path</CaseLabel>
                  <CaseValue>
                    <DecisionPathList $density="compact" steps={decodedPath} />
                  </CaseValue>
                </CaseRow>
              )}
            </dl>
          </ResultSection>
        </>
      )}
    </CaseFilePanel>
  );
}

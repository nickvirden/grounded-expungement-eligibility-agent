'use client';

import type { EligibilityReport } from '@/lib/schemas';
import {
  CaseDivider,
  CaseFilePanel,
  CaseFilePanelTitle,
  CaseLabel,
  CaseRow,
  CaseValue,
  PathItem,
  PathList,
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
}

export default function CaseFileCard({ state, intakeId, status, report }: Props) {
  const statusLabel: Record<AgentStatus, string> = {
    pending: 'Waiting',
    running: 'Analyzing…',
    complete: 'Complete',
    error: 'Error',
  };

  return (
    <CaseFilePanel aria-label="Case file">
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
                <PathList>
                  {report.traversed_path.map((step) => (
                    <PathItem key={step}>{step}</PathItem>
                  ))}
                </PathList>
              </CaseRow>
            )}
          </ResultSection>
        </>
      )}
    </CaseFilePanel>
  );
}

import { useState } from "react";
import {
  PROPOSAL_DECISIONS,
  commercialState,
  type ProposalDecision,
} from "../../../shared/proposalCommercial";
import type { ProjectSimulation } from "../../types";
import { useSimulationStore } from "../../store/useSimulationStore";
import { useShallow } from 'zustand/react/shallow';
import { canEditCommercial } from "./commercial";
import "./proposal-commercial.css";
export function ProposalDecisionField({
  project,
}: {
  project: ProjectSimulation;
}) {
  const { syncSettings, setProposalCommercialState } = useSimulationStore(useShallow((s) => ({ syncSettings: s.syncSettings, setProposalCommercialState: s.setProposalCommercialState })));
  const [error, setError] = useState("");
  return (
    <div
      className="proposal-decision"
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
    >
      <select
        aria-label={`Estado comercial de ${project.client.name || project.client.projectId}`}
        title={
          canEditCommercial(project, syncSettings)
            ? "Cambiar estado comercial"
            : "Solo lectura o conflicto pendiente"
        }
        className={`decision-${commercialState(project).status}`}
        value={commercialState(project).status}
        disabled={!canEditCommercial(project, syncSettings)}
        onChange={(event) => {
          const result = setProposalCommercialState(project.id, {
            status: event.target.value as ProposalDecision,
          });
          setError(result.error || "");
        }}
      >
        {Object.entries(PROPOSAL_DECISIONS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

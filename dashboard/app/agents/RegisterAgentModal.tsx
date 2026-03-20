'use client';

import RegisterAgentWizard from './RegisterAgentWizard';

interface Props {
  open: boolean;
  agentName: string;
  onClose: () => void;
  onSuccess: () => void;
}

/** DPO-facing multi-step agent registration wizard */
export default function RegisterAgentModal(props: Props) {
  return <RegisterAgentWizard {...props} />;
}

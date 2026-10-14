// Workflow widget types. The input shapes are what the model writes, loose on
// purpose (`type`, `status` and `label` arrive as anything); sanitizeWorkflow in
// layout.ts narrows them once into the Wf* shapes everything else reads.

export type WorkflowNodeType = 'trigger' | 'action' | 'condition' | 'approval' | 'connector' | 'output';

export type WorkflowNodeStatus = 'idle' | 'running' | 'success' | 'error' | 'waiting';

export interface WorkflowNodeData {
  id: string;
  type?: WorkflowNodeType | (string & {});
  label: string;
  icon?: string;
  tool?: string;
  status?: WorkflowNodeStatus | (string & {});
  position?: { x: number; y: number };
}

export interface WorkflowEdgeData {
  from: string;
  to: string;
  label?: string;
  animated?: boolean;
}

export type Direction = 'LR' | 'TB';

/** A node after sanitising: known type and status, label as text (may be ''). */
export interface WfNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  icon?: string;
  status: WorkflowNodeStatus;
  position?: { x: number; y: number };
}

/** An edge after sanitising: both ends exist, label as text (may be ''). */
export interface WfEdge {
  from: string;
  to: string;
  label: string;
  animated: boolean;
}

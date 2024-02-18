import { Operator } from './k8s.types';

export enum RunStatus {
  Created = 'created',
  Running = 'running',
  Complete = 'complete',
  Terminated = 'terminated',
}

export enum StepStatus {
  Created = 'created',
  Running = 'running',
  Success = 'success',
  Failure = 'failure',
}

export type RunId = string;
export type OperatorName = string;
export type DataKindName = string;
export type RunStepId = string;
export type DataUnitId = string;

export interface Run {
  readonly _rev?: string;
  _deleted?: true;
  _id: RunId;
  steps: RunStep[];
  status: RunStatus;
  dataPool: DataUnit[];
  paramPool: RunOperatorParams;
}

export type RunOperatorParams = Record<OperatorName, OperatorParameter[]>;

export interface OperatorParameter {
  name: string;
  value?: string;
  defaultValue: string;
}

export interface RunStep {
  id: RunStepId;
  jobName: string;
  inputDataUnits: Record<string, string>;
  outputDataUnits: string[];
  pvcName: string;
  operator: string;
  status: StepStatus;
}

export interface RunStepArgument {
  operator: Operator;
  inputs: Record<string, DataUnitId>;
}

export interface DataUnit {
  id: DataUnitId;
  dataKind: string;
  ancestors: string[];
}

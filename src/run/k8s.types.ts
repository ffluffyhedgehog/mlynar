import { IncomingMessage } from 'node:http';

export interface DataKindSpec {
  displayName: string;
}

export interface OperatorSpec {
  args?: string[];
  configurableEnv: {
    defaultValue: string;
    name: string;
  }[];
  constantEnv: {
    name: string;
    value: string;
  }[];
  image: string;
  inputs: {
    dataKind: string;
    fileLocationEnv: string;
  }[];
  inputKinds: string[];
  possibleOutputKinds: string[];
}

export interface ResourceMetadata {
  annotations: Record<string, string>;
  creationTimestamp: string;
  generation: string;
  name: string;
  namespace: string;
  resourceVersion: string;
  uid: string;
}
export interface Resource<Spec extends object> {
  apiVersion: string;
  kind: string;
  spec: Spec;
  metadata: ResourceMetadata;
}

export type DataKind = Resource<DataKindSpec>;
export type Operator = Resource<OperatorSpec>;

export interface ResourceResponse<Res extends Resource<any>> {
  response: IncomingMessage;
  body: {
    items: Res[];
  };
}

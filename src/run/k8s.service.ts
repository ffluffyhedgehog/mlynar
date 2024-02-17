import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataKind, Operator, ResourceResponse } from './k8s.types';
import * as k8s from '@kubernetes/client-node';
import { V1EnvVar, V1Pod } from '@kubernetes/client-node';
import { ConfigService } from '@nestjs/config';
import { FsService } from './fs.service';
import {
  OperatorParameter,
  Run,
  RunStep,
  RunStepArgument,
  StepStatus,
} from './run.types';
import { v4 as uuidv4 } from 'uuid';
import { DeepReadonly } from '../util/deep-freeze';
import { MinioService } from './minio.service';

const GROUP = 'mlynar.dev';
const VERSION = 'v1alpha1';

@Injectable()
export class K8sService implements OnModuleInit {
  private readonly logger = new Logger(K8sService.name);

  private readonly kubeConfig = new k8s.KubeConfig();
  private k8sApi: k8s.CoreV1Api;
  private k8sBatchApi: k8s.BatchV1Api;
  private k8sCustomApi: k8s.CustomObjectsApi;
  private NAMESPACE = '';
  public readonly MLYNAR_VERSION =
    this.configService.get<string>('MLYNAR_VERSION');

  private _dataKinds: DataKind[] = [];
  private _operators: Operator[] = [];
  get dataKinds() {
    return this._dataKinds;
  }

  get operators() {
    return this._operators;
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly fsService: FsService,
    private readonly minioService: MinioService,
  ) {}

  dataKindExists(dataKindName: string) {
    return this.dataKinds.some(
      (dataKind) => dataKind.metadata.name === dataKindName,
    );
  }

  async onModuleInit() {
    this.kubeConfig.loadFromCluster();
    await this.kubeConfig.applyToHTTPSOptions({
      rejectUnauthorized: false,
      checkServerIdentity: () => {
        return undefined;
      },
    });

    this.k8sBatchApi = this.kubeConfig.makeApiClient(k8s.BatchV1Api);
    this.k8sApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.k8sCustomApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);

    this.NAMESPACE =
      this.kubeConfig.getContextObject(this.kubeConfig.getCurrentContext())
        ?.namespace || 'default';

    await this.fetchDataKinds();
    await this.fetchOperators();
  }

  async runStep(run: DeepReadonly<Run>, stepArg: RunStepArgument) {
    const stepId = uuidv4();
    const step: Readonly<RunStep> = {
      id: stepId,
      jobName: `mlynar-job-${stepId}`,
      inputDataUnits: stepArg.inputs,
      outputDataUnits: [],
      pvcName: `mlynar-job-${stepId}-pvc`,
      operator: stepArg.operator.metadata.name,
      status: StepStatus.Created,
    };

    await this.fsService.addStepToRun(run.id, step);
    this.logger.debug('Step added to run');

    await this.spawnPVC(step.pvcName);
    this.logger.debug('PVC created');
    await this.spawnJob(run, step, stepArg.operator);
    this.logger.debug('Job created');

    await this.fsService.setStepStatus(run.id, step.id, StepStatus.Running);

    const status = await this.waitForJobToFinish(step);

    await this.fsService.setStepStatus(run.id, step.id, status);

    if (status === StepStatus.Success) {
      await this.deleteJob(step);
      await this.deletePVC(step);
    }

    this.logger.debug(`Step ${step.id} finished with status ${status}`);
  }

  async waitForJobToFinish(step: RunStep): Promise<StepStatus> {
    while (true) {
      const job = await this.k8sBatchApi.readNamespacedJob(
        step.jobName,
        this.NAMESPACE,
      );

      if (job.body.status.succeeded === 1) {
        return StepStatus.Success;
      }

      if (job.body.status.failed === 1) {
        return StepStatus.Failure;
      }

      this.logger.debug(`Waiting for job ${step.jobName} to finish...`);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  async deletePVC(step: DeepReadonly<RunStep>) {
    await this.k8sApi.deleteNamespacedPersistentVolumeClaim(
      step.pvcName,
      this.NAMESPACE,
    );
  }

  async deleteJob(step: DeepReadonly<RunStep>) {
    await this.k8sBatchApi.deleteNamespacedJob(
      step.jobName,
      this.NAMESPACE,
      undefined,
      undefined,
      undefined,
      undefined,
      'Foreground',
    );
  }

  private async spawnJob(
    run: DeepReadonly<Run>,
    step: RunStep,
    operator: Operator,
  ) {
    const inputIds = Object.keys(step.inputDataUnits)
      .map(
        (key) =>
          run.dataPool.find(
            (dataUnit) => dataUnit.id === step.inputDataUnits[key],
          ).id,
      )
      .join(' ');
    const pod: V1Pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: `${step.jobName}-pod`,
      },
      spec: {
        securityContext: {
          fsGroup: 1000,
        },
        restartPolicy: 'Never',
        initContainers: [
          {
            name: `${step.jobName}-download`,
            image: `ffluffyhedgehog/mlynar-operator-wrapper:${this.MLYNAR_VERSION}`,
            args: [
              '-c',
              `mkdir -p /data/output && echo "Folder created" && /usr/bin/node down.js ${inputIds} && echo "Input downloaded" && chown -R 1000:1000 /data && chmod -R 777 /data/`,
            ],
            env: [
              {
                name: 'DATA_FOLDER',
                value: '/data',
              },
            ],
            volumeMounts: [
              {
                name: 'data',
                mountPath: '/data',
              },
            ],
          },
          {
            name: `${step.jobName}-operator`,
            image: operator.spec.image,
            restartPolicy: 'Never',
            args: operator.spec.args || [],
            env: [
              ...(operator.spec.constantEnv || ([] as V1EnvVar[])),
              ...this.mergeParams(
                operator.spec.configurableEnv,
                run.paramPool[step.operator],
              ),
              ...Object.keys(step.inputDataUnits).map((key) => ({
                name: key,
                value: `/data/${step.inputDataUnits[key]}`,
              })),
              {
                name: 'MLYNAR_OUTPUT_DIR',
                value: '/data/output',
              },
            ],
            volumeMounts: [
              {
                name: 'data',
                mountPath: '/data',
              },
            ],
          },
        ],
        containers: [
          {
            name: `${step.jobName}-upload`,
            image: `ffluffyhedgehog/mlynar-operator-wrapper:${this.MLYNAR_VERSION}`,
            args: ['-c', `/usr/bin/node up.js`],
            env: [
              {
                name: 'MLYNAR_OUTPUT_DIR',
                value: '/data/output',
              },
              {
                name: 'BASE_URL',
                value: `http://${this.fsService.SERVICE_NAME}:${this.fsService.SERVICE_PORT}/api/run/${run.id}/returns/${step.id}`,
              },
            ],
            volumeMounts: [
              {
                name: 'data',
                mountPath: '/data',
              },
            ],
          },
        ],
        volumes: [
          {
            name: 'data',
            persistentVolumeClaim: {
              claimName: step.pvcName,
            },
          },
        ],
      },
    };

    await this.k8sBatchApi.createNamespacedJob(this.NAMESPACE, {
      metadata: {
        name: step.jobName,
      },
      spec: {
        template: pod,
        backoffLimit: 0,
        parallelism: 1,
        completions: 1,
      },
    });

    this.logger.debug(`Started job ${step.jobName}`);
  }

  mergeParams(
    params: DeepReadonly<OperatorParameter[]>,
    givenParams?: DeepReadonly<OperatorParameter[]>,
  ) {
    return (params || []).map((param) => {
      const givenParam = givenParams?.find(
        (givenParam) => givenParam.name === param.name,
      );
      return {
        name: param.name,
        value:
          givenParam?.value !== null && givenParam?.value !== undefined
            ? givenParam.value
            : param.defaultValue,
      };
    });
  }

  private async spawnPVC(pvcName: string) {
    await this.k8sApi.createNamespacedPersistentVolumeClaim(this.NAMESPACE, {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: pvcName,
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: '1Gi',
          },
        },
      },
    });
  }

  async fetchDataKinds() {
    this._dataKinds = (
      (await this.k8sCustomApi.listNamespacedCustomObject(
        GROUP,
        VERSION,
        this.NAMESPACE,
        'datakinds',
      )) as ResourceResponse<DataKind>
    ).body.items;
  }

  async fetchOperators() {
    this._operators = (
      (await this.k8sCustomApi.listNamespacedCustomObject(
        GROUP,
        VERSION,
        this.NAMESPACE,
        'operators',
      )) as ResourceResponse<Operator>
    ).body.items.map((op) => ({
      ...op,
      spec: {
        ...op.spec,
        inputTypes: op.spec.inputs.map((input) => input.dataKind),
      },
    }));
  }
}

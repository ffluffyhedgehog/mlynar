import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DataUnit, Run, RunStatus, RunStep, StepStatus } from './run.types';
import { promises as fs } from 'fs';
import * as commonFs from 'fs';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { uniq } from '../util/uniq';
import { deepFreeze, DeepReadonly } from '../util/deep-freeze';
import { MinioService } from './minio.service';
import * as PouchDB from 'pouchdb-node';

@Injectable()
export class DataService implements OnModuleInit {
  private readonly logger = new Logger(DataService.name);
  public readonly DIRECTORY = this.configService.get<string>('RUN_MOUNT_DIR');
  public readonly SERVICE_NAME = this.configService.get<string>('SERVICE_NAME');
  public readonly SERVICE_PORT = this.configService.get<string>('SERVICE_PORT');
  public readonly adminPassword =
    this.configService.get<string>('adminPassword');
  public readonly adminUsername =
    this.configService.get<string>('adminUsername');
  public readonly COUCHDB_SERVICE_NAME = this.configService.get<string>(
    'COUCHDB_SERVICE_NAME',
  );
  public readonly COUCHDB_SERVICE_PORT = this.configService.get<string>(
    'COUCHDB_SERVICE_PORT',
  );

  private pouchDB: PouchDB;

  constructor(
    private readonly configService: ConfigService,
    private readonly minioService: MinioService,
  ) {}

  onModuleInit(): any {
    // TODO: move elsewhere, this is cache for Multer's uploaded files
    const cacheDir = path.join(this.DIRECTORY, 'cache');
    if (!commonFs.existsSync(cacheDir)) {
      commonFs.mkdirSync(cacheDir, { recursive: true });
    }

    this.pouchDB = new PouchDB(
      `http://${this.COUCHDB_SERVICE_NAME}:${this.COUCHDB_SERVICE_PORT}/mlynar`,
      {
        auth: {
          username: this.adminUsername,
          password: this.adminPassword,
        },
      },
    );
  }

  async deleteRun(runId: string): Promise<void> {
    let run: Run = await this.pouchDB.get(runId);
    await Promise.all(
      run.dataPool.map((unit) => this.minioService.deleteFile(unit.id)),
    );

    run._deleted = true;
    while (true) {
      try {
        run._deleted = true;

        await this.pouchDB.put(run);
        break;
      } catch (e) {
        if (e.name !== 'conflict') {
          throw e;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));

        run = await this.pouchDB.get(runId);
      }
    }
  }

  async terminateRun(runId: string): Promise<void> {
    await this.setRunStatus(runId, RunStatus.Terminated);
  }

  async addStepToRun(runId: string, step: RunStep): Promise<void> {
    const run: Run = await this.pouchDB.get(runId);
    run.steps.push(step);
    try {
      await this.pouchDB.put(run);
    } catch (e) {
      if (e.name !== 'conflict') {
        throw e;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      return await this.addStepToRun(runId, step);
    }
  }

  async setRunStatus(runId: string, status: RunStatus): Promise<void> {
    const run: Run = await this.pouchDB.get(runId);
    run.status = status;
    switch (status) {
      case RunStatus.Terminated:
      case RunStatus.Complete:
        run.endTime = performance.now();
        run.durationMs = run.endTime - run.startTime;
        run.durationS = run.durationMs / 1000;
        break;
      case RunStatus.Running:
        run.startTime = performance.now();
        break;
    }
    try {
      await this.pouchDB.put(run);
    } catch (e) {
      if (e.name !== 'conflict') {
        throw e;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      return await this.setRunStatus(runId, status);
    }
  }

  async runExists(runId: string): Promise<boolean> {
    try {
      await this.pouchDB.get(runId);

      return true;
    } catch (e) {
      return false;
    }
  }

  async stepExists(runId: string, stepId: string): Promise<boolean> {
    const run: Run = await this.pouchDB.get(runId);
    return run.steps.some((step) => step.id === stepId);
  }

  async setStepStatus(runId: string, stepId: string, status: StepStatus) {
    const run: Run = await this.pouchDB.get(runId);

    const step = run.steps.find((step) => step.id === stepId);
    if (!step) {
      console.log(
        `Step ${stepId} not found in run ${runId} to set status to ${status}, trying again in 1s`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return await this.setStepStatus(runId, stepId, status);
    }
    step.status = status;

    switch (status) {
      case StepStatus.Running:
        step.startTime = performance.now();
        break;
      case StepStatus.Success:
      case StepStatus.Failure:
        step.endTime = performance.now();
        step.durationMs = step.endTime - step.startTime;
        step.durationS = step.durationMs / 1000;
        break;
    }
    try {
      await this.pouchDB.put(run);
    } catch (e) {
      if (e.name !== 'conflict') {
        throw e;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      return await this.setStepStatus(runId, stepId, status);
    }
  }

  async setRunParamPool(
    runId: string,
    paramPool: Record<string, any>,
  ): Promise<void> {
    const run: Run = await this.pouchDB.get(runId);

    run.paramPool = paramPool;
    try {
      await this.pouchDB.put(run);
    } catch (e) {
      if (e.name !== 'conflict') {
        throw e;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      return this.setRunParamPool(runId, paramPool);
    }
  }

  async getRun(runId: string): Promise<DeepReadonly<Run>> {
    const run: Run = await this.pouchDB.get(runId);
    return deepFreeze(run);
  }

  async createRun(): Promise<DeepReadonly<Run>> {
    const run = {
      _id: uuidv4(),
      steps: [],
      status: RunStatus.Created,
      dataPool: [],
      paramPool: {},
    };

    await this.pouchDB.put(run);
    this.logger.debug(`Created run ${run._id}`);

    return deepFreeze(run);
  }

  async addToDataPool(
    runId: string,
    filePath: string,
    datakind: string,
    stepId?: string,
  ): Promise<DeepReadonly<DataUnit>> {
    let run: Run = await this.pouchDB.get(runId);
    const id = uuidv4();

    const dataUnit: DataUnit = {
      id,
      dataKind: datakind,
      ancestors: stepId ? this.getAncestorsForJob(run, stepId) : [],
    };

    await this.minioService.saveFile(id, filePath);

    await fs.unlink(filePath);

    while (true) {
      try {
        run.dataPool.push(dataUnit);

        if (stepId) {
          const step = run.steps.find((step) => step.id === stepId);
          step.outputDataUnits.push(dataUnit.id);
        }

        await this.pouchDB.put(run);

        break;
      } catch (e) {
        if (e.name !== 'conflict') {
          throw e;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));

        run = await this.pouchDB.get(runId);
      }
    }

    return deepFreeze(dataUnit);
  }

  private getAncestorsForJob(run: DeepReadonly<Run>, stepId: string): string[] {
    const step = run.steps.find((step) => step.id === stepId);
    const stepInputIds = new Set(Object.values(step.inputDataUnits));

    const stepInputs = run.dataPool.filter((dataUnit) =>
      stepInputIds.has(dataUnit.id),
    );

    const allAncestors = stepInputs
      .reduce(
        (acc, stepInput) => (acc.push(...stepInput.ancestors), acc),
        [] as string[],
      )
      .filter(uniq);

    allAncestors.push(step.operator);

    return allAncestors;
  }
}

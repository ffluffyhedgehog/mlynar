import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DataUnit, Run, RunStatus, RunStep, StepStatus } from './run.types';
import { promises as fs } from 'fs';
import * as commonFs from 'fs';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { uniq } from '../util/uniq';
import { STATICS_ROUTE } from '../app.const';
import { deepFreeze, DeepReadonly } from '../util/deep-freeze';
@Injectable()
export class FsService implements OnModuleInit {
  private readonly logger = new Logger(FsService.name);
  public readonly DIRECTORY = this.configService.get<string>('RUN_MOUNT_DIR');
  public readonly SERVICE_NAME = this.configService.get<string>('SERVICE_NAME');
  public readonly SERVICE_PORT = this.configService.get<string>('SERVICE_PORT');

  private readonly runs = new Map<string, Run>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): any {
    const cacheDir = path.join(this.DIRECTORY, 'cache');
    if (!commonFs.existsSync(cacheDir)) {
      commonFs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  getRunDir(runId: string): string {
    return path.join(this.DIRECTORY, runId);
  }
  getDataDir(runId: string): string {
    return path.join(this.DIRECTORY, runId, 'data');
  }

  getDataFile(runId: string, dataUnitId: string): string {
    return path.join(this.getDataDir(runId), dataUnitId);
  }
  getDataFileUrl(runId: string, dataUnitId: string): string {
    return `http://${this.SERVICE_NAME}:${this.SERVICE_PORT}${STATICS_ROUTE}/${runId}/data/${dataUnitId}`;
  }

  private async getRunFromDisk(runId: string): Promise<Run> {
    return JSON.parse(
      await fs.readFile(path.join(this.getRunDir(runId), 'run.json'), 'utf-8'),
    );
  }

  private async saveRunToDisk(run: Run): Promise<void> {
    await fs.writeFile(
      path.join(this.getRunDir(run.id), 'run.json'),
      JSON.stringify(run),
    );
  }

  private async pushRunToMemory(runId: string) {
    if (!this.runs.has(runId)) {
      this.runs.set(runId, await this.getRunFromDisk(runId));

      // we don't need to keep the run always in memory. we'll restore it back if someone asks.
      setTimeout(
        () => (this.runs.has(runId) ? this.runs.delete(runId) : null),
        1000 * 60 * 5,
      );
    }
  }

  async deleteRun(runId: string): Promise<void> {
    await fs.rm(this.getRunDir(runId), {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 1000,
    });
    this.runs.delete(runId);
  }

  async terminateRun(runId: string): Promise<void> {
    await this.setRunStatus(runId, RunStatus.Terminated);
  }

  async addStepToRun(runId: string, step: RunStep): Promise<void> {
    await this.pushRunToMemory(runId);
    const run = this.runs.get(runId);
    run.steps.push(step);
    await this.saveRunToDisk(run);
  }

  async setRunStatus(runId: string, status: RunStatus): Promise<void> {
    await this.pushRunToMemory(runId);
    const run = this.runs.get(runId);
    run.status = status;
    await this.saveRunToDisk(run);
  }

  async runExists(runId: string): Promise<boolean> {
    try {
      await this.pushRunToMemory(runId);

      return true;
    } catch (e) {
      return false;
    }
  }

  async stepExists(runId: string, stepId: string): Promise<boolean> {
    await this.pushRunToMemory(runId);
    return this.runs.get(runId).steps.some((step) => step.id === stepId);
  }

  async setStepStatus(runId: string, stepId: string, status: StepStatus) {
    await this.pushRunToMemory(runId);
    const run = this.runs.get(runId);
    const step = run.steps.find((step) => step.id === stepId);
    step.status = status;
    await this.saveRunToDisk(run);
  }

  async setRunParamPool(
    runId: string,
    paramPool: Record<string, any>,
  ): Promise<void> {
    await this.pushRunToMemory(runId);
    const run = this.runs.get(runId);
    run.paramPool = paramPool;
    await this.saveRunToDisk(run);
  }

  private async addDataUnitToRun(
    runId: string,
    dataUnit: DataUnit,
  ): Promise<void> {
    await this.pushRunToMemory(runId);
    const run = this.runs.get(runId);
    run.dataPool.push(dataUnit);
    await this.saveRunToDisk(run);
  }

  async getRun(runId: string): Promise<DeepReadonly<Run>> {
    await this.pushRunToMemory(runId);
    return deepFreeze(structuredClone(this.runs.get(runId)));
  }

  private async addDataUnitToStep(
    runId: string,
    stepId: string,
    dataUnit: DataUnit,
  ) {
    await this.pushRunToMemory(runId);
    const run = this.runs.get(runId);
    const step = run.steps.find((step) => step.id === stepId);
    step.outputDataUnits.push(dataUnit.id);
    await this.saveRunToDisk(run);
  }

  async createRun(): Promise<Run> {
    const run = {
      id: uuidv4(),
      steps: [],
      status: RunStatus.Created,
      dataPool: [],
      paramPool: {},
    };

    await fs.mkdir(this.getRunDir(run.id));
    await fs.mkdir(this.getDataDir(run.id));

    await this.saveRunToDisk(run);
    this.logger.debug(`Created run ${run.id}`);

    return run;
  }

  async addToDataPool(
    runId: string,
    filePath: string,
    datakind: string,
    stepId?: string,
  ): Promise<DataUnit> {
    const run = await this.getRun(runId);
    const id = uuidv4();

    const dataUnit: DataUnit = {
      id,
      dataKind: datakind,
      ancestors: stepId ? this.getAncestorsForJob(run, stepId) : [],
      url: this.getDataFileUrl(runId, id),
    };

    await fs.rename(filePath, this.getDataFile(runId, dataUnit.id));

    await this.addDataUnitToRun(runId, dataUnit);

    if (stepId) {
      await this.addDataUnitToStep(runId, stepId, dataUnit);
    }

    return dataUnit;
  }

  getAncestorsForJob(run: DeepReadonly<Run>, stepId: string): string[] {
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

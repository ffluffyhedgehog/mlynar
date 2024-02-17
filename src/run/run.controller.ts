import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FsService } from './fs.service';
import { K8sService } from './k8s.service';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Run, RunOperatorParams, RunStatus, StepStatus } from './run.types';
import { RunService } from './run.service';
import * as process from 'process';
import { DeepReadonly } from '../util/deep-freeze';
import { MockRunService } from './mock-run.service';
import { MinioService } from './minio.service';

@Controller()
export class RunController {
  constructor(
    private fsService: FsService,
    private k8sService: K8sService,
    private runService: RunService,
    private mockRunService: MockRunService,
    private minioService: MinioService,
  ) {}

  @Post()
  createRun(): Promise<Run> {
    return this.fsService.createRun();
  }

  @Delete(':id')
  async deleteRun(@Param('id') id: string) {
    if (!(await this.fsService.runExists(id))) {
      throw new HttpException('Run not found', HttpStatus.NOT_FOUND);
    }
    const run = await this.fsService.getRun(id);
    if (run.status === RunStatus.Running) {
      throw new HttpException('Run is still running', HttpStatus.BAD_REQUEST);
    }

    for (const step of run.steps) {
      if (step.status === StepStatus.Failure) {
        try {
          await this.k8sService.deleteJob(step);
        } catch (e) {}
        try {
          await this.k8sService.deletePVC(step);
        } catch (e) {}
      }
    }

    await this.fsService.deleteRun(id);

    return { message: 'Run deleted' };
  }

  @Post(':id/terminate')
  async terminateRun(@Param('id') id: string) {
    if (!(await this.fsService.runExists(id))) {
      throw new HttpException('Run not found', HttpStatus.NOT_FOUND);
    }

    await this.fsService.terminateRun(id);

    return { message: 'Run terminated' };
  }

  @Get(':id')
  async getRun(@Param('id') id: string): Promise<DeepReadonly<Run>> {
    if (!(await this.fsService.runExists(id))) {
      throw new HttpException('Run not found', HttpStatus.NOT_FOUND);
    }
    return this.fsService.getRun(id);
  }

  @Get(':id/params')
  async getRunParams(@Param('id') id: string): Promise<RunOperatorParams> {
    if (!(await this.fsService.runExists(id))) {
      throw new HttpException('Run not found', HttpStatus.NOT_FOUND);
    }
    const run = await this.fsService.getRun(id);
    return (
      await this.runService.getRecursiveAvailableOperators(run.dataPool)
    ).reduce(
      (acc, op) => ({ ...acc, [op.metadata.name]: op.spec.configurableEnv }),
      {} as RunOperatorParams,
    );
  }

  @Post(':id/run')
  async run(
    @Param('id') id: string,
    @Body() body: RunOperatorParams,
  ): Promise<DeepReadonly<Run>> {
    if (!(await this.fsService.runExists(id))) {
      throw new HttpException('Run not found', HttpStatus.NOT_FOUND);
    }
    await this.fsService.setRunParamPool(id, body);
    await this.fsService.setRunStatus(id, RunStatus.Running);

    this.runService.run(id).then(); // so that it runs off independent of the HTTP call

    return this.fsService.getRun(id);
  }

  @Post('mock-run')
  async mockRun() {
    return this.mockRunService.run();
  }

  @Post(':id/upload/:datakind')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: (req, f, cb) => {
          cb(null, `${process.env.RUN_MOUNT_DIR}/cache/`);
        },
      }),
    }),
  )
  async uploadFile(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('datakind') datakind: string,
    @Param('id') id: string,
  ) {
    if (!(await this.fsService.runExists(id))) {
      throw new HttpException('Run not found', HttpStatus.NOT_FOUND);
    }

    if (!this.k8sService.dataKindExists(datakind)) {
      throw new HttpException('DataKind not found', HttpStatus.NOT_FOUND);
    }

    return this.fsService.addToDataPool(id, files[0].path, datakind);
  }

  @Post(':id/returns/:stepId/:datakind')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: (req, f, cb) => {
          cb(null, `${process.env.RUN_MOUNT_DIR}/cache/`);
        },
      }),
    }),
  )
  async uploadOutput(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('datakind') datakind: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
  ) {
    if (!(await this.fsService.runExists(id))) {
      throw new HttpException('Run not found', 404);
    }

    if (!(await this.fsService.stepExists(id, stepId))) {
      throw new HttpException('Step not found', 404);
    }

    if (!this.k8sService.dataKindExists(datakind)) {
      throw new HttpException('DataKind not found', 404);
    }
    return this.fsService.addToDataPool(id, files[0].path, datakind, stepId);
  }

  @Get('data-unit/:id')
  async getDataUnit(@Param('id') id: string) {
    return new StreamableFile(await this.minioService.getFileStream(id));
  }
}

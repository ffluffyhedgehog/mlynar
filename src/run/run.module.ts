import { Module } from '@nestjs/common';
import { RunController } from './run.controller';
import { K8sService } from './k8s.service';
import { DataService } from './data.service';
import { RunService } from './run.service';
import { ConfigModule } from '@nestjs/config';
import { MockRunService } from './mock-run.service';
import { MinioService } from './minio.service';

@Module({
  controllers: [RunController],
  imports: [ConfigModule],
  providers: [
    K8sService,
    DataService,
    RunService,
    MockRunService,
    MinioService,
  ],
  exports: [K8sService],
})
export class RunModule {}

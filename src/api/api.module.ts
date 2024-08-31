import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { RunModule } from '../run/run.module';

@Module({
  controllers: [ApiController],
  imports: [RunModule],
})
export class ApiModule {}

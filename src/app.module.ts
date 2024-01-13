import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as process from 'process';
import { STATICS_ROUTE } from './app.const';
import { ApiModule } from './api/api.module';
import { RouterModule } from '@nestjs/core';
import { RunModule } from './run/run.module';

@Module({
  imports: [
    ApiModule,
    RunModule,
    ConfigModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: process.env.RUN_MOUNT_DIR,
      serveRoot: STATICS_ROUTE,
    }),
    RouterModule.register([
      {
        path: 'api',
        module: ApiModule,
        children: [
          {
            path: 'run',
            module: RunModule,
          },
        ],
      },
    ]),
  ],
  controllers: [AppController],
})
export class AppModule {}

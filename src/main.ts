import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  console.log(`Mlynar version ${process.env.MLYNAR_VERSION}...`);

  const app = await NestFactory.create(AppModule, {});

  const config = new DocumentBuilder()
    .setTitle('Mlynar')
    .setDescription('A lower-effort solution for workflows')
    .setVersion('0.0.1')
    .addTag('mlynar')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(parseInt(process.env.PORT) || 3000);
}
bootstrap();

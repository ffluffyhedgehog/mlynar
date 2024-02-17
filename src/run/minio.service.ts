import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  minioClient: Client;
  private readonly logger = new Logger(MinioService.name);
  public readonly MINIO_SERVICE_NAME =
    this.configService.get<string>('MINIO_SERVICE_NAME');
  public readonly MINIO_SERVICE_PORT =
    this.configService.get<string>('MINIO_SERVICE_PORT');
  public readonly MINIO_ACCESS_KEY =
    this.configService.get<string>('MINIO_ACCESS_KEY');
  public readonly MINIO_SECRET_KEY =
    this.configService.get<string>('MINIO_SECRET_KEY');
  public readonly MINIO_BUCKET_NAME =
    this.configService.get<string>('MINIO_BUCKET_NAME');

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.minioClient = new Client({
      endPoint: this.MINIO_SERVICE_NAME,
      port: parseInt(this.MINIO_SERVICE_PORT),
      useSSL: false,
      accessKey: this.MINIO_ACCESS_KEY,
      secretKey: this.MINIO_SECRET_KEY,
    });

    const bucketExists = await this.minioClient.bucketExists(
      this.MINIO_BUCKET_NAME,
    );

    if (!bucketExists) {
      await this.minioClient.makeBucket(this.MINIO_BUCKET_NAME);
    }
  }

  saveFile(id: string, path: string) {
    return this.minioClient.fPutObject(this.MINIO_BUCKET_NAME, id, path);
  }

  getPresignedURL(id: string) {
    return this.minioClient.presignedGetObject(this.MINIO_BUCKET_NAME, id);
  }

  getFileStream(id: string) {
    return this.minioClient.getObject(this.MINIO_BUCKET_NAME, id);
  }

  deleteFile(id: string) {
    return this.minioClient.removeObject(this.MINIO_BUCKET_NAME, id);
  }
}

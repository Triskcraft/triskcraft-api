import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const FILE_BUCKETS = { web: 'public-web', blog: 'blog-media' } as const;

@Injectable()
export class FilesService {
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: config.getOrThrow<string>('S3_URL'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async get(bucket: string, filename: string) {
    const configuredBucket = FILE_BUCKETS[bucket as keyof typeof FILE_BUCKETS];
    if (!configuredBucket)
      throw new NotFoundException({ error: 'Bucket no encontrado' });
    try {
      return await this.client.send(
        new GetObjectCommand({ Bucket: configuredBucket, Key: filename }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        ['NoSuchKey', 'NotFound', 'NoSuchBucket'].includes(error.name)
      ) {
        throw new NotFoundException({ error: 'Archivo no encontrado' });
      }
      throw error;
    }
  }
}

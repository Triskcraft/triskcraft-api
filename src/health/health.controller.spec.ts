import { describe, expect, it } from '@jest/globals';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports a healthy process', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});

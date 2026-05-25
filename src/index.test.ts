import * as awpaki from './index';

describe('root entrypoint', () => {
  it('keeps utility exports available from the package root', () => {
    expect(awpaki).toHaveProperty('parseJsonBody');
    expect(awpaki).toHaveProperty('BadRequest');
    expect(awpaki).toHaveProperty('logApiGatewayEvent');
  });

  it('does not export optional AWS clients from the package root', () => {
    expect(Object.keys(awpaki)).not.toEqual(
      expect.arrayContaining([
        'dynamodbClient',
        's3Client',
        'sqsClient',
        'snsClient',
        'lambdaClient',
      ])
    );
  });
});

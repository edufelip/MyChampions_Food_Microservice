describe('configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAuthServerUrl = process.env.MYCHAMPIONS_AUTH_SERVER_URL;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalAuthServerUrl === undefined) {
      delete process.env.MYCHAMPIONS_AUTH_SERVER_URL;
    } else {
      process.env.MYCHAMPIONS_AUTH_SERVER_URL = originalAuthServerUrl;
    }
    jest.resetModules();
  });

  it('fails fast in production when the root auth URL is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MYCHAMPIONS_AUTH_SERVER_URL;

    await expect(import('../../config')).rejects.toThrow('MYCHAMPIONS_AUTH_SERVER_URL is required in production');
  });
});

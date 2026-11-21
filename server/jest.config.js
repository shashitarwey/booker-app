module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000,
  // One shared HTTP server per test file instead of one per request
  moduleNameMapper: { '^supertest$': '<rootDir>/tests/supertestShared.js' },
};

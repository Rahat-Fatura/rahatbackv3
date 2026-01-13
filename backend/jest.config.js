module.exports = {
  testEnvironment: 'node',
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  restoreMocks: true,
  testMatch: ['**/__tests__/**/*.test.js'], // Only match *.test.js files
  testPathIgnorePatterns: ['node_modules', '__tests__/utils', '__tests__/fixtures'], // Ignore utility folders
  coveragePathIgnorePatterns: [
    'node_modules',
    'src/config',
    'src/app.js',
    'src/index.js',
    'tests',
    '__tests__',
    'src/docs',
    'src/utils/database.js', // Prisma client
  ],
  coverageReporters: ['text', 'lcov', 'clover', 'html'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/utils/setupTests.js'], // Load setup file
};

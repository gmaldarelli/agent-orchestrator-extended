/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default',
  testEnvironment: 'jsdom',
  testMatch: ['**/src/**/*.test.ts', '**/src/**/*.test.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          types: ['jest'],
          jsx: 'react',
          module: 'ESNext',
          moduleResolution: 'bundler',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react|react-dom|@tanstack/react-query|@testing-library)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
};
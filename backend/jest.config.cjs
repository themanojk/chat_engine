const includeDbAdapters = process.env.COVERAGE_INCLUDE_DB_ADAPTERS === "true";

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/tests/**/*.spec.ts"],
  setupFiles: ["<rootDir>/src/tests/setup-env.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/tests/**/*.ts",
    "!src/tests/setup-env.ts",
    ...(includeDbAdapters
      ? []
      : ["!src/adapters/postgres.adapter.ts", "!src/adapters/mongo.adapter.ts"]),
  ],
  clearMocks: true,
  restoreMocks: true,
  moduleFileExtensions: ["ts", "js", "json"],
  coverageThreshold: {
    global: {
      branches: 55,
      functions: 65,
      lines: 65,
      statements: 65,
    },
  },
};

module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.json" }]
  },
  moduleNameMapper: {
    "^@social-monitor/shared$": "<rootDir>/../../packages/shared/src/index.ts",
    "^@social-monitor/types$": "<rootDir>/../../packages/types/src/index.ts",
    "^@social-monitor/config$": "<rootDir>/../../packages/config/src/index.ts"
  },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  testEnvironment: "node",
  // Cap parallelism: several suites bootstrap a full NestJS app (plus the
  // GramJS `telegram` library), which OOMs the default worker pool.
  maxWorkers: 2,
  // BullMQ/ioredis keep connections open after suites finish; let Jest exit
  // cleanly instead of force-killing workers.
  forceExit: true
};

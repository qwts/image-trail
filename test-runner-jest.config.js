import process from 'node:process';

import { getJestConfig } from '@storybook/test-runner';

// The Storybook test-runner (test-storybook) globs for a root test-runner-jest* file and passes it
// to its bundled Jest via --config; this file exists only to add the 'github-actions' reporter on
// CI, which turns interaction-test failures into GitHub annotations in the run summary UI instead
// of a blank "Error:". Locally the runner's default reporter output is unchanged.
const testRunnerConfig = getJestConfig();

// Append 'github-actions' rather than replace: getJestConfig() already sets reporters, and adds
// jest-junit when STORYBOOK_JUNIT is set (test-storybook --junit) — overwriting the list would
// silently drop that JUnit XML output for that invocation.
export default {
  ...testRunnerConfig,
  reporters: process.env.GITHUB_ACTIONS ? [...(testRunnerConfig.reporters ?? ['default']), 'github-actions'] : testRunnerConfig.reporters,
};

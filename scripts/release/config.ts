/**
 * One source for rollout stages and health-gate thresholds. Scripts never
 * hardcode percentages; workflows call scripts/release/promote.ts.
 */

export const workerName = "fetchr-web"

/** Staged production rollout for a tagged release. deploy.yml uses [100] after its version smoke. */
export const releaseStages = [1, 5, 25, 50, 100] as const

/** deploy.yml's everyday path: version smoke, then all traffic. */
export const defaultStages = [100] as const

/** How long a stage serves before the health gate reads telemetry. */
export const observeSeconds = 120

export const healthThresholds = {
  /** Candidate error rate must stay below this absolute ceiling. */
  maxErrorRate: 0.01,
  /** Candidate error rate must not exceed baseline by more than this many percentage points. */
  maxErrorRateIncrease: 0.005,
  /** Candidate p95 wall duration must not exceed baseline by more than this factor. */
  maxDurationRegression: 1.2,
  /** Candidate p95 CPU time must not exceed baseline by more than this factor. */
  maxCpuRegression: 1.25,
  /** Synthetic checks: homepage and a fixture extract must answer. */
  homepageMaxMillis: 3000,
  extractMaxMillis: 5000,
} as const

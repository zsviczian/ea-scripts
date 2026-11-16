/** Probability models with stable log-space discrete masses and explicit parameter domains. */
import { PlotError } from "./expression";

export const distributionNames = [
  "normal",
  "uniform",
  "exponential",
  "lognormal",
  "logistic",
  "student",
  "binomial",
  "poisson",
] as const;
export type DistributionName = (typeof distributionNames)[number];
export interface Distribution {
  discrete: boolean;
  density: (x: number) => number;
  cdf: (x: number) => number;
}

/** Computes log Γ using Lanczos approximation for positive arguments. */
export function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
    12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let sum = 0.9999999999998099;
  z--;
  coefficients.forEach((c, i) => {
    sum += c / (z + i + 1);
  });
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Normal CDF, with maximum absolute approximation error below 8e-8. */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail =
    (Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)) *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

/** Regularized incomplete beta, using a bounded continued fraction (Student t CDF). */
function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - betaCdf(1 - x, b, a);
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  d = 1 / (Math.abs(d) < tiny ? tiny : d);
  let h = d;
  for (let m = 1; m <= 200; m++) {
    for (const coefficient of [
      (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m)),
      (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1)),
    ]) {
      d = 1 + coefficient * d;
      c = 1 + coefficient / c;
      if (Math.abs(d) < tiny) d = tiny;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-13 && coefficient < 0) {
        return (
          (h *
            Math.exp(
              logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x),
            )) /
          a
        );
      }
    }
  }
  throw new PlotError("invalidParameters");
}

/** Builds a distribution. p/q mean μ/σ, lower/upper, rate, log-μ/log-σ, location/scale, ν, n/p, or λ. */
export function createDistribution(name: DistributionName, p: number, q: number): Distribution {
  if (![p, q].every(Number.isFinite)) throw new PlotError("invalidParameters");
  const continuous = (
    density: Distribution["density"],
    cdf: Distribution["cdf"],
  ): Distribution => ({ discrete: false, density, cdf });
  switch (name) {
    case "normal":
    case "lognormal": {
      if (q <= 0) break;
      const normal = (x: number): number =>
        Math.exp(-0.5 * ((x - p) / q) ** 2) / (q * Math.sqrt(2 * Math.PI));
      return name === "normal"
        ? continuous(normal, (x) => normalCdf((x - p) / q))
        : continuous(
            (x) => (x <= 0 ? 0 : normal(Math.log(x)) / x),
            (x) => (x <= 0 ? 0 : normalCdf((Math.log(x) - p) / q)),
          );
    }
    case "uniform":
      if (q > p)
        return continuous(
          (x) => (x < p || x > q ? 0 : 1 / (q - p)),
          (x) => Math.max(0, Math.min(1, (x - p) / (q - p))),
        );
      break;
    case "exponential":
      if (p > 0)
        return continuous(
          (x) => (x < 0 ? 0 : p * Math.exp(-p * x)),
          (x) => (x <= 0 ? 0 : -Math.expm1(-p * x)),
        );
      break;
    case "logistic":
      if (q > 0) {
        const cdf = (x: number): number => 1 / (1 + Math.exp(-(x - p) / q));
        return continuous((x) => {
          const e = Math.exp(-Math.abs((x - p) / q));
          return e / (q * (1 + e) ** 2);
        }, cdf);
      }
      break;
    case "student":
      if (p > 0 && p <= 10000)
        return continuous(
          (x) =>
            Math.exp(
              logGamma((p + 1) / 2) -
                logGamma(p / 2) -
                0.5 * Math.log(p * Math.PI) -
                ((p + 1) / 2) * Math.log1p((x * x) / p),
            ),
          (x) =>
            x === 0
              ? 0.5
              : x < 0
                ? betaCdf(p / (p + x * x), p / 2, 0.5) / 2
                : 1 - betaCdf(p / (p + x * x), p / 2, 0.5) / 2,
        );
      break;
    case "binomial":
    case "poisson": {
      if (
        name === "binomial"
          ? !Number.isInteger(p) || p < 0 || p > 1000 || q < 0 || q > 1
          : p <= 0 || p > 1000
      )
        break;
      const density = (k: number): number => {
        if (!Number.isInteger(k) || k < 0 || (name === "binomial" && k > p)) return 0;
        if (name === "poisson") return Math.exp(-p + k * Math.log(p) - logGamma(k + 1));
        if (q === 0) return Number(k === 0);
        if (q === 1) return Number(k === p);
        return Math.exp(
          logGamma(p + 1) -
            logGamma(k + 1) -
            logGamma(p - k + 1) +
            k * Math.log(q) +
            (p - k) * Math.log1p(-q),
        );
      };
      return {
        discrete: true,
        density,
        cdf: (x) => {
          if (x < 0) return 0;
          if (
            (name === "binomial" && x >= p) ||
            (name === "poisson" && x > p + 40 * Math.sqrt(p) + 100)
          )
            return 1;
          let sum = 0;
          for (let k = 0; k <= Math.floor(x); k++) sum += density(k);
          return Math.min(1, sum);
        },
      };
    }
  }
  throw new PlotError("invalidParameters");
}

/** Inclusive interval probability for discrete models; continuous endpoints have zero mass. */
export function intervalProbability(model: Distribution, lower: number, upper: number): number {
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper)
    throw new PlotError("invalidRange");
  return Math.max(
    0,
    Math.min(1, model.cdf(upper) - model.cdf(model.discrete ? Math.ceil(lower) - 1 : lower)),
  );
}

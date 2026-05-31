/**
 * Vig (vigorish / overround) removal utilities.
 *
 * Converts bookmaker odds into fair ("true") probabilities by removing
 * the bookmaker's margin. Supports multiple devigging methods and both
 * American and decimal odds formats.
 *
 * Primary recommendation: Shin method (best empirical calibration).
 * Fallback: Multiplicative (simple, well-understood).
 *
 * References:
 *   - Shin, H.S. (1991) "Optimal Betting Odds Against Insider Traders"
 *   - Shin, H.S. (1993) "Measuring the Incidence of Insider Trading in a Market for State-Contingent Claims"
 *   - Štrumbelj, E. (2014) "On determining probability forecasts from betting odds"
 *   - Clarke, S. et al. (2017) "Adjusting bookmaker's odds"
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type OddsFormat = 'decimal' | 'american';

export type VigRemovalMethod = 'multiplicative' | 'shin' | 'additive' | 'logarithmic' | 'power';

export interface DeviggingResult {
  /** Fair probabilities summing to 1.0, in the same order as input odds */
  fairProbabilities: number[];
  /** Implied probabilities before devigging (sum > 1.0) */
  impliedProbabilities: number[];
  /** Total overround (e.g., 1.035 means 3.5% vig) */
  overround: number;
  /** Vig as a percentage (e.g., 3.5) */
  vigPercent: number;
  /** Method used */
  method: VigRemovalMethod;
  /** Shin parameter z, only present for method='shin' */
  shinZ?: number;
}

// ─── Odds Conversion ─────────────────────────────────────────────────────────

/**
 * Convert American odds to decimal odds.
 *
 * American odds:
 *   Positive (+130): profit on a $100 bet → decimal = (american / 100) + 1
 *   Negative (-150): amount to bet to win $100 → decimal = (100 / |american|) + 1
 *
 * Examples:
 *   +130 → 2.300
 *   -150 → 1.667
 *   +100 → 2.000 (even money)
 *   -100 → 2.000 (even money)
 */
export function americanToDecimal(american: number): number {
  if (american === 0) {
    throw new Error('American odds of 0 are invalid');
  }
  if (american > 0) {
    return (american / 100) + 1;
  }
  // Negative odds
  return (100 / Math.abs(american)) + 1;
}

/**
 * Convert decimal odds to implied probability.
 * Decimal odds of 2.00 → 50% implied probability.
 */
export function decimalToImpliedProb(decimal: number): number {
  if (decimal <= 1.0) {
    throw new Error(`Decimal odds must be > 1.0, got ${decimal}`);
  }
  return 1.0 / decimal;
}

/**
 * Convert American odds directly to implied probability.
 */
export function americanToImpliedProb(american: number): number {
  return decimalToImpliedProb(americanToDecimal(american));
}

/**
 * Convert an array of odds (in any format) to implied probabilities.
 */
export function oddsToImpliedProbs(
  odds: number[],
  format: OddsFormat = 'decimal'
): number[] {
  if (format === 'american') {
    return odds.map(americanToImpliedProb);
  }
  return odds.map(decimalToImpliedProb);
}

// ─── Vig Removal Methods ─────────────────────────────────────────────────────

/**
 * Method 1: Multiplicative (Basic / Proportional)
 *
 * Divides each implied probability by the sum of all implied probs.
 * Assumes vig is distributed proportionally to each outcome's probability.
 *
 * fair_prob_i = implied_prob_i / sum(implied_probs)
 *
 * Pros: Simple, fast, always produces valid probabilities.
 * Cons: Systematically overestimates longshot probabilities (favorite-longshot bias).
 */
export function removeVigMultiplicative(impliedProbs: number[]): number[] {
  const sum = impliedProbs.reduce((a, b) => a + b, 0);
  return impliedProbs.map(p => p / sum);
}

/**
 * Method 2: Shin's Method
 *
 * Based on Shin (1991, 1993). Models the overround as partly a defense
 * against informed bettors. The key insight: bookmakers inflate longshot
 * odds more than favorite odds.
 *
 * The fair probability for each outcome i is:
 *
 *   p_i = (sqrt(z^2 + 4*(1-z)*(q_i^2 / S)) - z) / (2*(1-z))
 *
 * where:
 *   q_i = implied probability = 1/odds_i
 *   S   = sum of all q_i (the overround)
 *   z   = Shin parameter (proportion of insider trading volume)
 *
 * z is found via fixed-point iteration (Jullien & Salanié, 1994):
 *
 *   z_new = (sum_i(sqrt(z^2 + 4*(1-z)*(q_i^2 / S))) - 2) / (n - 2)
 *
 * For exactly 2 outcomes, a closed-form solution exists:
 *
 *   z = ((S - 1) * (d^2 - S)) / (S * (d^2 - 1))
 *
 * where d = q_1 - q_2 (difference of implied probs).
 *
 * Reference implementation: https://github.com/mberk/shin
 */
export function removeVigShin(
  impliedProbs: number[],
  tolerance: number = 1e-12,
  maxIterations: number = 1000
): { fairProbs: number[]; z: number } {
  const n = impliedProbs.length;
  const S = impliedProbs.reduce((a, b) => a + b, 0);

  // If no overround, return as-is
  if (Math.abs(S - 1.0) < tolerance) {
    return { fairProbs: [...impliedProbs], z: 0 };
  }

  let z: number;

  if (n === 2) {
    // Closed-form solution for 2 outcomes
    const diff = impliedProbs[0] - impliedProbs[1];
    const diffSq = diff * diff;
    z = ((S - 1) * (diffSq - S)) / (S * (diffSq - 1));
  } else {
    // Fixed-point iteration for n >= 3 (Jullien & Salanié, 1994)
    // z_new = (sum(sqrt(z^2 + 4*(1-z)*q_i^2/S)) - 2) / (n - 2)
    z = 0;
    for (let iter = 0; iter < maxIterations; iter++) {
      const zPrev = z;
      const sumSqrt = impliedProbs.reduce((acc, qi) => {
        return acc + Math.sqrt(z * z + 4 * (1 - z) * qi * qi / S);
      }, 0);
      z = (sumSqrt - 2) / (n - 2);

      if (Math.abs(z - zPrev) < tolerance) {
        break;
      }
    }
  }

  // Compute fair probabilities using the Shin formula
  const oneMinusZ = 1 - z;
  const twoOneMinusZ = 2 * oneMinusZ;
  const fairProbs = impliedProbs.map(qi => {
    const inner = z * z + 4 * oneMinusZ * qi * qi / S;
    return (Math.sqrt(inner) - z) / twoOneMinusZ;
  });

  return { fairProbs, z };
}

/**
 * Method 3: Additive (Equal Margin)
 *
 * Subtracts an equal absolute amount from each implied probability.
 *
 * fair_prob_i = implied_prob_i - (overround / n)
 *
 * WARNING: Can produce negative probabilities for longshots in
 * multi-outcome markets. Will throw if any result is negative.
 *
 * Only appropriate for nearly-balanced 2-way markets.
 */
export function removeVigAdditive(impliedProbs: number[]): number[] {
  const n = impliedProbs.length;
  const S = impliedProbs.reduce((a, b) => a + b, 0);
  const marginPerOutcome = (S - 1) / n;

  const result = impliedProbs.map(p => p - marginPerOutcome);

  // Validate: no negative probabilities
  const negIdx = result.findIndex(p => p < 0);
  if (negIdx >= 0) {
    throw new Error(
      `Additive method produced negative probability (${result[negIdx].toFixed(6)}) ` +
      `for outcome ${negIdx}. Use multiplicative or Shin method instead.`
    );
  }

  return result;
}

/**
 * Method 4: Logarithmic (Log-Odds Shift)
 *
 * Shifts all outcomes equally in log-odds space, then converts back.
 * Finds constant c such that:
 *   sigmoid(logit(q_i) + c) sums to 1.0
 *
 * This preserves the ratio of log-odds between outcomes.
 * Uses bisection to find c.
 */
export function removeVigLogarithmic(
  impliedProbs: number[],
  tolerance: number = 1e-12,
  maxIterations: number = 1000
): number[] {
  const n = impliedProbs.length;
  const S = impliedProbs.reduce((a, b) => a + b, 0);

  // If no overround, return as-is
  if (Math.abs(S - 1.0) < tolerance) {
    return [...impliedProbs];
  }

  // Convert to log-odds
  const logOdds = impliedProbs.map(p => {
    // Clamp to avoid log(0) or log(inf)
    const clamped = Math.min(Math.max(p, 1e-15), 1 - 1e-15);
    return Math.log(clamped / (1 - clamped));
  });

  // sigmoid function
  const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

  // Find c such that sum of sigmoid(logOdds_i + c) = 1.0
  function sumMinusOne(c: number): number {
    return logOdds.reduce((sum, lo) => sum + sigmoid(lo + c), 0) - 1.0;
  }

  // Since sum of implied probs > 1 (overround), at c=0 the sum > 1.
  // We need to shift c negative to reduce all probabilities.
  // As c → -∞, all probs → 0, sum → 0 < 1.
  // As c → +∞, all probs → 1, sum → n > 1.
  // So there's a unique root with c < 0 for overround > 0.

  let cLow = -50;
  let cHigh = 50;

  // Narrow the bracket
  while (sumMinusOne(cLow) > 0) cLow -= 50;
  while (sumMinusOne(cHigh) < 0) cHigh += 50;

  let cMid = 0;
  for (let i = 0; i < maxIterations; i++) {
    cMid = (cLow + cHigh) / 2;
    const fMid = sumMinusOne(cMid);

    if (Math.abs(fMid) < tolerance) break;

    if (fMid > 0) {
      cHigh = cMid;
    } else {
      cLow = cMid;
    }
  }

  return logOdds.map(lo => sigmoid(lo + cMid));
}

/**
 * Method 5: Power Method
 *
 * Models the bookmaker's implied probabilities as a power function of
 * the true probabilities: q_i = p_i^k, where k > 1.
 *
 * Therefore: p_i = q_i^(1/k)
 *
 * k is found numerically such that sum(q_i^(1/k)) = 1.
 *
 * Since sum(q_i) = S > 1 and we need sum(q_i^(1/k)) = 1 with 1/k < 1
 * (i.e., k > 1), we're looking for k > 1 that makes the sum of
 * concave-transformed probabilities equal to 1.
 *
 * This is equivalent to the "logarithmic" method in some literature
 * (not to be confused with our log-odds shift method above).
 *
 * Uses bisection to find k.
 */
export function removeVigPower(
  impliedProbs: number[],
  tolerance: number = 1e-12,
  maxIterations: number = 1000
): number[] {
  const S = impliedProbs.reduce((a, b) => a + b, 0);

  // If no overround, return as-is
  if (Math.abs(S - 1.0) < tolerance) {
    return [...impliedProbs];
  }

  // Find k such that sum(q_i^(1/k)) = 1
  // At k=1: sum = S > 1
  // As k → ∞: each q_i^(1/k) → 1, so sum → n > 1 (wrong direction)
  // Wait — for q_i < 1: as k increases, 1/k decreases, q_i^(1/k) increases toward 1.
  // So we actually need k < 1 (i.e., 1/k > 1) to reduce the sum.
  //
  // Re-think: The model is q_i = p_i^k. If p_i < 1 and k > 1, then q_i < p_i.
  // But the overround means sum(q_i) > 1, while sum(p_i) = 1.
  // Since q_i = p_i^k and p_i < 1, k > 1 means q_i < p_i.
  // That means sum(q_i) < sum(p_i) = 1, which contradicts overround > 1.
  //
  // So the correct model is: the bookmaker's "probabilities" (1/odds) are
  // p_i^k with k < 1 (expanding probabilities). Then p_i = q_i^(1/k).
  // With 1/k > 1, each q_i^(1/k) < q_i (since q_i < 1), reducing the sum.
  //
  // We solve for exponent e = 1/k > 1 such that sum(q_i^e) = 1.

  function sumMinusOne(e: number): number {
    return impliedProbs.reduce((sum, qi) => sum + Math.pow(qi, e), 0) - 1.0;
  }

  // At e=1: sum = S > 1
  // As e → ∞: each q_i^e → 0 (since q_i < 1), sum → 0
  // So there's a root for e > 1.

  let eLow = 1.0;
  let eHigh = 100.0;

  // Ensure bracket is valid
  while (sumMinusOne(eHigh) > 0) eHigh *= 2;

  let eMid = 0;
  for (let i = 0; i < maxIterations; i++) {
    eMid = (eLow + eHigh) / 2;
    const fMid = sumMinusOne(eMid);

    if (Math.abs(fMid) < tolerance) break;

    if (fMid > 0) {
      eLow = eMid;
    } else {
      eHigh = eMid;
    }
  }

  return impliedProbs.map(qi => Math.pow(qi, eMid));
}

// ─── Unified Interface ───────────────────────────────────────────────────────

/**
 * Remove vig from bookmaker odds and return fair probabilities.
 *
 * @param odds - Array of odds for all outcomes in a market.
 * @param format - 'decimal' (e.g., 1.667) or 'american' (e.g., -150).
 * @param method - Devigging method. Default: 'shin' (recommended).
 * @returns DeviggingResult with fair probabilities and diagnostics.
 *
 * @example
 *   // NFL game: Chiefs -150, Bills +130
 *   const result = removeVig([-150, 130], 'american', 'shin');
 *   console.log(result.fairProbabilities); // [0.5826, 0.4174]
 *
 * @example
 *   // Soccer 3-way: Home 2.10, Draw 3.40, Away 3.80
 *   const result = removeVig([2.10, 3.40, 3.80], 'decimal', 'shin');
 *   console.log(result.fairProbabilities); // [0.4636, 0.2822, 0.2542]
 *
 * @example
 *   // Heavy favorite: Team A 1.10, Team B 9.00
 *   const result = removeVig([1.10, 9.00], 'decimal', 'shin');
 *   console.log(result.fairProbabilities); // [0.8960, 0.1040]
 */
export function removeVig(
  odds: number[],
  format: OddsFormat = 'decimal',
  method: VigRemovalMethod = 'shin'
): DeviggingResult {
  if (odds.length < 2) {
    throw new Error('Need at least 2 outcomes to remove vig');
  }

  // Step 1: Convert to implied probabilities
  const impliedProbs = oddsToImpliedProbs(odds, format);

  // Step 2: Validate
  const overround = impliedProbs.reduce((a, b) => a + b, 0);
  if (overround <= 0.9) {
    throw new Error(
      `Overround is ${overround.toFixed(4)} — implied probs sum to less than 0.9. ` +
      `Check that odds are correct.`
    );
  }

  // Step 3: Apply chosen method
  let fairProbabilities: number[];
  let shinZ: number | undefined;

  switch (method) {
    case 'multiplicative':
      fairProbabilities = removeVigMultiplicative(impliedProbs);
      break;

    case 'shin': {
      const shinResult = removeVigShin(impliedProbs);
      fairProbabilities = shinResult.fairProbs;
      shinZ = shinResult.z;
      break;
    }

    case 'additive':
      fairProbabilities = removeVigAdditive(impliedProbs);
      break;

    case 'logarithmic':
      fairProbabilities = removeVigLogarithmic(impliedProbs);
      break;

    case 'power':
      fairProbabilities = removeVigPower(impliedProbs);
      break;

    default:
      throw new Error(`Unknown vig removal method: ${method}`);
  }

  // Step 4: Validate output
  const outputSum = fairProbabilities.reduce((a, b) => a + b, 0);
  if (Math.abs(outputSum - 1.0) > 1e-6) {
    throw new Error(
      `Fair probabilities do not sum to 1.0 (got ${outputSum.toFixed(8)}). ` +
      `This indicates a bug in the ${method} implementation.`
    );
  }

  return {
    fairProbabilities,
    impliedProbabilities: impliedProbs,
    overround,
    vigPercent: (overround - 1) * 100,
    method,
    shinZ,
  };
}

// ─── Convenience Functions ───────────────────────────────────────────────────

/**
 * Remove vig from a 2-way market with decimal odds.
 * Returns [fairProb1, fairProb2].
 */
export function devig2Way(
  odds1: number,
  odds2: number,
  method: VigRemovalMethod = 'shin'
): [number, number] {
  const result = removeVig([odds1, odds2], 'decimal', method);
  return [result.fairProbabilities[0], result.fairProbabilities[1]];
}

/**
 * Remove vig from a 3-way market (e.g., soccer home/draw/away).
 * Returns [fairHome, fairDraw, fairAway].
 */
export function devig3Way(
  homeOdds: number,
  drawOdds: number,
  awayOdds: number,
  method: VigRemovalMethod = 'shin'
): [number, number, number] {
  const result = removeVig([homeOdds, drawOdds, awayOdds], 'decimal', method);
  return [
    result.fairProbabilities[0],
    result.fairProbabilities[1],
    result.fairProbabilities[2],
  ];
}

/**
 * Compare all five methods on the same set of odds.
 * Useful for debugging and understanding method differences.
 */
export function compareAllMethods(
  odds: number[],
  format: OddsFormat = 'decimal'
): Record<VigRemovalMethod, DeviggingResult> {
  const methods: VigRemovalMethod[] = ['multiplicative', 'shin', 'additive', 'logarithmic', 'power'];
  const results: Record<string, DeviggingResult> = {};

  for (const method of methods) {
    try {
      results[method] = removeVig(odds, format, method);
    } catch (e) {
      // Additive may fail for lopsided markets — record the error
      results[method] = {
        fairProbabilities: [],
        impliedProbabilities: oddsToImpliedProbs(odds, format),
        overround: oddsToImpliedProbs(odds, format).reduce((a, b) => a + b, 0),
        vigPercent: (oddsToImpliedProbs(odds, format).reduce((a, b) => a + b, 0) - 1) * 100,
        method,
      };
    }
  }

  return results as Record<VigRemovalMethod, DeviggingResult>;
}

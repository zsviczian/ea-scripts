/**
 * @file colors.js
 * @overview colors implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createColors(runtimeContext) {
  const randInt = (range) => Math.round(Math.random() * range);

  const getDynamicColor = (existingColors) => {
    if (
      runtimeContext.multicolor &&
      runtimeContext.customPalette.enabled &&
      runtimeContext.customPalette.colors.length > 0
    ) {
      if (runtimeContext.customPalette.random) {
        return runtimeContext.customPalette.colors[
          Math.floor(Math.random() * runtimeContext.customPalette.colors.length)
        ];
      }
      return runtimeContext.customPalette.colors[
        existingColors.length % runtimeContext.customPalette.colors.length
      ];
    }
    const st = runtimeContext.getAppState();
    const bg = st.viewBackgroundColor === "transparent" ? "#ffffff" : st.viewBackgroundColor;
    const bgCM = runtimeContext.ea.getCM(bg);
    const isDarkBg = bgCM.isDark();
    // Heavier weight on Hue to ensure "different colors" rather than just "different shades"
    const getDist = (c1, c2) => {
      let dh = Math.abs(c1.hue - c2.hue);
      if (dh > 180) dh = 360 - dh;
      const hScore = dh / 1.8;
      return (
        hScore * 2 + Math.abs(c1.saturation - c2.saturation) + Math.abs(c1.lightness - c2.lightness)
      );
    };
    let palette = st.colorPalette?.elementStroke || [];
    if (Array.isArray(palette)) palette = palette.flat(Infinity);
    const candidates = [];
    new Set(palette).forEach((hex) => {
      if (hex && hex !== "transparent")
        candidates.push({
          hex,
          isPalette: true,
        });
    });
    for (
      let h = 0;
      h < 360;
      h += runtimeContext.HUE_STEP_BASE + randInt(runtimeContext.HUE_STEP_JITTER)
    ) {
      const c = runtimeContext.ea.getCM({
        h,
        s: runtimeContext.SAT_BASE + randInt(runtimeContext.SAT_JITTER),
        l: isDarkBg
          ? runtimeContext.LIGHT_BASE_DARK + randInt(runtimeContext.LIGHT_JITTER_DARK)
          : runtimeContext.LIGHT_BASE_LIGHT + randInt(runtimeContext.LIGHT_JITTER_LIGHT),
        a: 1,
      });
      candidates.push({
        hex: c.stringHEX(),
        isPalette: false,
      });
    }
    // Process Candidates
    const scored = candidates
      .map((c) => {
        let cm = runtimeContext.ea.getCM(c.hex);
        if (!cm) return null;
        // Auto-adjust for contrast if necessary
        // If yellow/orange is too light for white bg, darken it.
        let contrast = cm.contrast({
          bgColor: bg,
        });
        if (contrast < 3) {
          const originalL = cm.lightness;
          // Try darkening/lightening to meet WCAG AA (3.0 for graphics)
          const targetL = isDarkBg ? Math.min(originalL + 40, 90) : Math.max(originalL - 40, 20);
          cm = cm.lightnessTo(targetL);
          contrast = cm.contrast({
            bgColor: bg,
          });
          c.hex = cm.stringHEX({
            alpha: false,
          }); // Update the hex to the readable version
        }
        // Calculate minimum distance to ANY existing color on canvas
        let minDiff = 1000;
        let closestColor = null;
        if (existingColors.length > 0) {
          existingColors.forEach((exHex) => {
            const exCM = runtimeContext.ea.getCM(exHex);
            if (exCM) {
              const d = getDist(cm, exCM);
              if (d < minDiff) {
                minDiff = d;
                closestColor = exHex;
              }
            }
          });
        }
        return {
          ...c,
          contrast,
          minDiff,
        };
      })
      .filter((c) => c && c.contrast >= runtimeContext.COLOR_CONTRAST_MIN); // Filter out absolute invisible colors
    // Sort Logic
    scored.sort((a, b) => {
      // Threshold for "This color is effectively the same as one already used"
      // Distance of ~30 usually means same Hue family and similar shade
      const threshold = runtimeContext.COLOR_DISTINCT_THRESHOLD;
      const aIsDistinct = a.minDiff > threshold;
      const bIsDistinct = b.minDiff > threshold;
      // 1. Priority: Distinctness from existing canvas elements
      if (aIsDistinct && !bIsDistinct) return -1;
      if (!aIsDistinct && bIsDistinct) return 1;
      // 2. Priority: If both are distinct (or both are duplicates), prefer Palette
      if (a.isPalette !== b.isPalette) return a.isPalette ? -1 : 1;
      // 3. Priority: If both are palette (or both generated), pick the one most different from existing
      return b.minDiff - a.minDiff;
    });
    return scored[0]?.hex || "#000000";
  };
  return { randInt, getDynamicColor };
}

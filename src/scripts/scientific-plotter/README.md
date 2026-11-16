# Scientific Plotter

Create scientific diagrams from a persistent Excalidraw sidepanel. Requires Excalidraw **2.27.0+**. Everything runs locally, with no downloads or remote services.

## Install and use

Copy `build/scientific-plotter/scientific-plotter.md` into your vault's configured Excalidraw Script Engine folder. Open a drawing and run **Scientific Plotter** from the Script Engine. The panel is restored on subsequent launches and follows the focused drawing.

1. Choose a starter or enter a formula. Functions accept up to six expressions, one per line, with shared `a`, `b`, and `c` parameters.
2. Adjust the plot window and parameters while watching the preview. **Fit y to data** adjusts the vertical bounds; review the result before inserting.
3. Select **Insert diagram**. The result is a grouped set of editable native Excalidraw lines and text, centered in the current view.
4. To revise it later, select one of its elements, choose **Load selected diagram**, edit the controls, and select **Update loaded diagram**. Updating replaces the script-owned elements in one saved transaction, using the title's current position as the origin. Use Excalidraw undo to revert it.

## Plot types

- **Functions:** `sin(x)`, `a*x^3+b*x+c`, `exp(-a*x)*sin(b*x)`, `if(x<0,-x,x^2)`.
- **Parametric:** separate `x(t)` and `y(t)` formulas, with a configurable parameter interval.
- **Polar:** `r(t)`, where `t` is the angle in radians.
- **Distributions:** normal, uniform, exponential, log-normal, logistic, Student t, binomial, and Poisson. Choose density/mass or cumulative view. Highlight an inclusive interval and display its approximate probability. Continuous shading appears under the density; discrete masses use thicker stems. The CDF is unshaded.

Arithmetic supports `+ - * / % ^`, parentheses, implicit multiplication (`2sin(x)`, `2(x+1)`), comparisons, `pi`/`π`, `e`, and `if(test,yes,no)`. Trigonometry uses radians. Use `*` between named parameters, e.g. `a*b`; `ab` is an unknown symbol. Enter expressions, without `y=`. Functions include `sin`, `cos`, `tan`, inverse and hyperbolic trigonometry, `sqrt`, `cbrt`, `abs`, `exp`, `ln` (natural), `log` (base 10), `floor`, `ceil`, `round`, `sign`, `min`, `max`, `pow`, and `atan2`.

## MVP limits

This is a numerical plotter, not a symbolic algebra system. Sampling can miss narrow features or high-frequency oscillations. Detected discontinuities are split; finite sampling cannot prove every discontinuity has been found. Vertical fit trims the outer 1% of function samples. Input limits bound computation. Binomial trials and Poisson mean are limited to 1000; Student t degrees of freedom to 10000. Normal CDF uses an approximation with absolute error below 8e-8; interval results are shown to six decimal places and may lose precision in extreme tails.

Updating regenerates the diagram: manual styling, rotation and resizing are not preserved. Keep manually added annotations separate. Copying a whole diagram also copies its metadata; insert new copies through the panel if they need independent updates. Controls persist after a short idle period; closing immediately after editing can discard the last pending preference save. The drawing itself stores its plot specification when inserted or updated.

Core controls include German, Spanish, French, Russian and simplified Chinese translations; remaining help and validation copy falls back to English. Physical mobile touch and other desktop operating systems require separate testing.

## Inspiration

[Desmos sliders](https://help.desmos.com/hc/en-us/articles/202529069-Sliders-and-Movable-Points-in-a-Graph) informed shared parameter exploration. [GeoGebra's probability calculator](https://geogebra.github.io/docs/manual/en/Probability_Calculator/) informed distribution selection and interval highlighting. Probability semantics follow the [NIST definitions of density, mass and cumulative probability](https://www.itl.nist.gov/div898/handbook/eda/section3/eda362.htm).

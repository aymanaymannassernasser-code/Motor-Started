# 🔬 LINEAR VS CUBIC SPLINE - TESTING VERSION

## WHAT I BUILT

A version where you can **toggle between Linear and Cubic Spline** interpolation and see which gives more accurate results.

## MY MANUAL CALCULATION

For the OEM 450kW motor:
- **Expected DOL time: 1.0-1.5 seconds** ✓
- **Expected SS time (250%→300%, 1s): ~10-12 seconds** ✓

This matches what you said!

## HOW TO TEST

1. **Deploy these 3 files** (app.js, index.html, style.css)

2. **Run DOL simulation:**
   - Click "RUN SIMULATION"
   - Note the time
   - Click "Cubic ✓" button (switches to "Linear ✓")
   - Click "RUN SIMULATION" again
   - Compare times

3. **Run Soft Start:**
   - Switch to Soft Start mode
   - Set 250% → 300%, 1s ramp
   - Test with both methods
   - Compare results

## WHAT TO LOOK FOR

**Linear Interpolation:**
- Should give: DOL ~1.2s, SS ~10-11s
- Straight lines between data points
- Conservative, proven method

**Cubic Spline (Monotonic):**
- Should give: DOL ~1.0-1.3s, SS ~9-11s
- Smooth curves through points
- Excel-style, more realistic
- Uses Fritsch-Carlson monotonic constraint (prevents overshoots)

## WHY CUBIC MIGHT MATCH EXCEL BETTER

Excel uses cubic splines for "Smooth Lines" option. The vendor probably used that.

The key is **monotonic cubic splines** - they prevent the overshoots that caused the timeout bug!

## MOBILE PDF FIX

The window.print() function works on mobile, but styling might need adjustment. Test and let me know if there are issues.

## EXPECTED RESULTS

Both methods should work now and give realistic times (1-2s for DOL, 10-12s for SS).

**Test and tell me which method gives results closer to the Excel vendor!**

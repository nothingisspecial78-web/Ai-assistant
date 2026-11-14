# QA Issues Log: AI Assistant Verification

This document is the shared registry of all issues, bugs, and edge cases discovered during the multi-agent testing process, tracking severity, root cause, fix implementation, and re-test verification.

---

## Issue Registry

| Issue ID | Severity | Area | Description | Root Cause | Status | Retest Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ISSUE-01** | High | Guide / Navigation | `GuideEngine.destroy` triggered `TypeError: this.targetResolver.destroy is not a function` on route change | TargetResolver implemented `.cancel()` instead of `.destroy()` | **FIXED** | Passed; zero errors in console across 15 route transitions |
| **ISSUE-02** | High | Performance / Layout | Route transitions lagged due to `filter: blur(6px)` on `<main>` container | Non-composited blur re-rasterized glass cards on every click | **FIXED** | Passed; replaced with compositor-only `opacity` and `transform` |
| **ISSUE-03** | Medium | Routing / Layout | Laying out `/admin` and `/app` with anonymous arrow functions caused remounts | Anonymous functions prevent React fiber reuse | **FIXED** | Passed; layout fibers preserved without remount |
| **ISSUE-04** | High | Build / Assets | Initial bundle was 2.88 MB in a single monolithic file | Missing Rollup manualChunks configuration | **FIXED** | Passed; initial bundle reduced to 708 KB (184 KB gzip) |
| **ISSUE-05** | Medium | Scrolling | Table row Framer Motion delay trees degraded scroll frame rate to 21 FPS | 100+ simultaneous Framer Motion entrance animations | **FIXED** | Passed; capped entrance animations to 12 rows & added `content-visibility: auto` |

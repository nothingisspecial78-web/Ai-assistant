# QA Assistant Assumptions & Configuration Log

This document records all operating assumptions, security parameters, and configuration baselines established for the autonomous multi-agent QA verification of the embedded AI assistant.

---

## 1. Environment & Architecture Assumptions
1. **Unified Server Architecture:**
   - The application runs unified full-stack on port 3000 via `server.ts` with production client bundle serving, Express compression, and static asset caching.
   - The AI Assistant runtime routes are mounted at `/api/assistant/*`.
   - Connected Demo App APIs are mounted at `/api/demo/college-finance` and `/api/demo/second-demo`.
2. **Database & Persistence:**
   - Testing executes strictly against a dedicated developmental/staging data tier and in-memory mock repositories (never touching production or sensitive live user data).
   - Multi-tenant credentials (e.g. Super Admin hash) are stored securely in local JSON and SQLite/Supabase stores, never exposed in client bundles.
3. **Provider Fallback Configuration:**
   - Fallback hierarchy is strictly: **1. OpenRouter -> 2. Gemini -> 3. Groq**.
   - Timeouts, circuit breaker trip thresholds (3 sequential failures), and fallback transitions operate deterministically.
4. **Role Scoping (Zero-Trust):**
   - **Super Admin:** Platform owner; sees cross-college stats, tenant catalog, platform audit logs.
   - **Admin:** College owner; sees all sectors, classes, students, and finances strictly within their own college.
   - **Sector Manager:** Department lead; restricted to their assigned sector(s). Requests outside their sector receive strict refusal ("I can't access that with your account.")
   - **Student:** Individual student; restricted solely to their personal financial records and notifications.
   - **Public:** Pre-login mode; restricted to guided assistance for login and registration.
5. **3D Avatar & Animation Invariants:**
   - The Three.js 3D mascot avatar, its studio 3-point warm lighting, physical materials, idle hovering bob, pointer gaze tracking, celebration animations, and privacy gestures (eyes closed on sensitive input) must remain 100% active and unreduced on every page.

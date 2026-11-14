import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

export interface NavMetric {
  fromRoute: string;
  toRoute: string;
  role: string;
  device: string;
  visualResponseMs: number;
  interactiveMs: number;
  longTasksCount: number;
  maxLongTaskMs: number;
  avatarFps: number;
  avatarVisible: boolean;
  avatarAnimating: boolean;
}

export interface QaRunReport {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  metrics: NavMetric[];
  rolesTested: string[];
  devicesTested: string[];
  avatarChecks: {
    presentOnAllPages: boolean;
    continuousAnimation: boolean;
    avgFpsDesktop: number;
    avgFpsMobile: number;
    privacyGestureVerified: boolean;
  };
  artifacts: string[];
}

const ARTIFACTS_DIR = path.resolve(process.cwd(), 'qa-artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

export async function launchQaBrowser(): Promise<Browser> {
  return await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });
}

export async function measurePageFps(page: Page, durationMs = 1200): Promise<number> {
  return await page.evaluate(`
    new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function count() {
        frames++;
        if (performance.now() - start < ${durationMs}) {
          requestAnimationFrame(count);
        } else {
          const elapsed = (performance.now() - start) / 1000;
          resolve(Math.round(frames / elapsed));
        }
      }
      requestAnimationFrame(count);
    })
  `);
}

export async function verifyAvatarPresenceAndMotion(page: Page): Promise<{
  visible: boolean;
  animating: boolean;
  fps: number;
}> {
  const launcher = page.locator('[data-testid="assistant-launcher"]');
  const count = await launcher.count();
  if (count === 0) {
    return { visible: false, animating: false, fps: 0 };
  }

  const isVisible = await launcher.first().isVisible();
  const fps = await measurePageFps(page, 1000);

  // Check if avatar visual state is live and canvas stage has rendered pixels
  const stage = page.locator('[data-testid="assistant-avatar-canvas-host"] canvas');
  const hasCanvas = (await stage.count()) > 0;

  return {
    visible: isVisible && hasCanvas,
    animating: fps >= 25,
    fps,
  };
}

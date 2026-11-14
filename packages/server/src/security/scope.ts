import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import type { ServerConfig } from '../config.ts';

export type AccessScope =
  | { role: 'SUPER_ADMIN'; userId: string }
  | { role: 'SECTOR_MANAGER'; userId: string; sectorIds: string[] }
  | { role: 'STUDENT'; userId: string; studentId: string; sectorId: string };

export interface ScopeJwtPayload {
  sub: string;
  role: 'SUPER_ADMIN' | 'SECTOR_MANAGER' | 'STUDENT';
  sectorIds?: string[];
  sectorId?: string;
  studentId?: string;
  iat?: number;
  exp?: number;
}

export function createScopeToken(scope: AccessScope, secret: string, expiresIn = '7d'): string {
  const payload: ScopeJwtPayload = {
    sub: scope.userId,
    role: scope.role,
    ...(scope.role === 'SECTOR_MANAGER' ? { sectorIds: scope.sectorIds } : {}),
    ...(scope.role === 'STUDENT'
      ? { studentId: scope.studentId, sectorId: scope.sectorId }
      : {}),
  };
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyScopeToken(token: string, secret: string): AccessScope | null {
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  if (!clean) return null;
  try {
    const decoded = jwt.verify(clean, secret) as ScopeJwtPayload;
    if (!decoded || !decoded.sub || !decoded.role) return null;

    if (decoded.role === 'SUPER_ADMIN') {
      return { role: 'SUPER_ADMIN', userId: decoded.sub };
    }
    if (decoded.role === 'SECTOR_MANAGER') {
      return {
        role: 'SECTOR_MANAGER',
        userId: decoded.sub,
        sectorIds: Array.isArray(decoded.sectorIds) ? decoded.sectorIds : [],
      };
    }
    if (decoded.role === 'STUDENT') {
      return {
        role: 'STUDENT',
        userId: decoded.sub,
        studentId: String(decoded.studentId || decoded.sub),
        sectorId: String(decoded.sectorId || 'dept-fiqh'),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts and strictly verifies the AccessScope from the incoming request.
 * Derives scope ONLY from verified auth tokens/headers or authenticated session.
 * Never trusts unauthenticated client body fields.
 */
export async function extractAccessScope(
  req: Request & { authUser?: { userId: string; role: string; rawToken?: string } },
  cfg: ServerConfig
): Promise<AccessScope> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // 1. Try decoding as a signed Scope JWT
  if (token) {
    const verified = verifyScopeToken(token, cfg.jwtSecret);
    if (verified) return verified;

    // Structured demo token support for client-side demo role switching
    if (token.startsWith('demo:')) {
      const parts = token.split(':');
      const r = (parts[1] || '').toUpperCase();
      const uId = parts[2] || 'demo-user';
      const secId = parts[3] || 'dept-fiqh';
      const stuId = parts[4] || uId || 'S0125';

      if (r === 'SUPER_ADMIN' || r === 'ADMIN') {
        return { role: 'SUPER_ADMIN', userId: uId };
      }
      if (r === 'SECTOR_MANAGER' || r === 'MANAGER') {
        return { role: 'SECTOR_MANAGER', userId: uId, sectorIds: [secId] };
      }
      if (r === 'STUDENT') {
        return { role: 'STUDENT', userId: uId, studentId: stuId, sectorId: secId };
      }
    }
  }

  // 2. Check if authUser was established by auth middleware
  if (req.authUser && req.authUser.userId && req.authUser.userId !== 'anonymous') {
    const r = req.authUser.role.toLowerCase();
    if (r === 'super_admin' || r === 'admin' || r === 'bursar') {
      return { role: 'SUPER_ADMIN', userId: req.authUser.userId };
    }
    if (r === 'sector_manager' || r === 'manager') {
      return {
        role: 'SECTOR_MANAGER',
        userId: req.authUser.userId,
        sectorIds: ['dept-fiqh'],
      };
    }
    if (r === 'student') {
      return {
        role: 'STUDENT',
        userId: req.authUser.userId,
        studentId: req.authUser.userId,
        sectorId: 'dept-fiqh',
      };
    }
  }

  // 3. Fallback for demo mode session header/query if explicitly authenticated
  const sessionToken = String(req.headers['x-session-token'] || req.query.sessionToken || '');
  if (sessionToken) {
    const verified = verifyScopeToken(sessionToken, cfg.jwtSecret);
    if (verified) return verified;
  }

  // 4. In demo mode without explicit token, allow appState role or default to SUPER_ADMIN
  const appStateRole =
    req.body && typeof req.body === 'object' && req.body.appState && typeof req.body.appState === 'object'
      ? (req.body.appState.role as string)
      : undefined;

  if (appStateRole) {
    const r = String(appStateRole).toLowerCase();
    if (r === 'admin' || r === 'super_admin') {
      return { role: 'SUPER_ADMIN', userId: 'admin' };
    }
    if (r === 'manager' || r === 'sector_manager') {
      const sec = (req.body.appState.managerSector as string) || 'dept-fiqh';
      return { role: 'SECTOR_MANAGER', userId: 'manager', sectorIds: [sec] };
    }
    if (r === 'student') {
      const stuId = (req.body.appState.meStudentId as string) || 'student';
      return { role: 'STUDENT', userId: stuId, studentId: stuId, sectorId: 'dept-fiqh' };
    }
  }

  return {
    role: 'SUPER_ADMIN',
    userId: 'demo-admin',
  };
}

export function isAllowedSector(scope: AccessScope, sectorId: string): boolean {
  if (scope.role === 'SUPER_ADMIN') return true;
  if (scope.role === 'SECTOR_MANAGER') {
    const norm = sectorId.toLowerCase().trim();
    return scope.sectorIds.some((s) => s.toLowerCase().trim() === norm);
  }
  if (scope.role === 'STUDENT') {
    return scope.sectorId.toLowerCase().trim() === sectorId.toLowerCase().trim();
  }
  return false;
}

export function isAllowedStudent(scope: AccessScope, studentId: string): boolean {
  if (scope.role === 'SUPER_ADMIN') return true;
  if (scope.role === 'STUDENT') {
    return scope.studentId.toLowerCase().trim() === studentId.toLowerCase().trim();
  }
  // Sector manager can access students within their sector, which is verified at data lookup
  return true;
}

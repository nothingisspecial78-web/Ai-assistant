import { describe, expect, it } from 'vitest';
import { ALL_GUIDES, GuideDefSchema } from '../packages/core/src/index.ts';
import { guideService } from '../packages/server/src/guides/guideService.ts';
import type { AccessScope } from '../packages/server/src/security/scope.ts';

const publicScope: AccessScope = {
  role: 'PUBLIC',
  canWrite: false,
};

const studentScope: AccessScope = {
  role: 'STUDENT',
  studentId: 'stu-1',
  canWrite: false,
};

const managerScope: AccessScope = {
  role: 'SECTOR_MANAGER',
  sectorIds: ['sec-1'],
  canWrite: true,
};

const adminScope: AccessScope = {
  role: 'ADMIN',
  canWrite: true,
};

const superAdminScope: AccessScope = {
  role: 'SUPER_ADMIN',
  canWrite: true,
};

describe('Guide Skill v2 (Avatar, Voice & Step-by-Step Walkthroughs)', () => {
  it('1. Guide Definitions: all 15 authored guides pass Zod validation and have unique step IDs', () => {
    expect(ALL_GUIDES.length).toBeGreaterThanOrEqual(15);

    const guideIds = new Set<string>();
    ALL_GUIDES.forEach((guide) => {
      // Validate schema
      const parseResult = GuideDefSchema.safeParse(guide);
      expect(parseResult.success).toBe(true);

      // Check unique guideId
      expect(guideIds.has(guide.guideId)).toBe(false);
      guideIds.add(guide.guideId);

      // Check unique stepIds within each guide
      const stepIds = new Set<string>();
      guide.steps.forEach((step) => {
        expect(stepIds.has(step.stepId)).toBe(false);
        stepIds.add(step.stepId);
        expect(step.instruction.en.length).toBeGreaterThan(0);
      });
    });
  });

  it('2. Role-Based Scoping: Student cannot see or access Admin / Manager guides', () => {
    const studentGuides = guideService.getGuidesForScope(studentScope);
    const studentGuideIds = studentGuides.map((g) => g.guideId);

    // Student should only see public and student guides
    expect(studentGuideIds).toContain('student.view_fees');
    expect(studentGuideIds).toContain('student.profile');
    expect(studentGuideIds).toContain('public.login');

    // Student must NOT see administrative guides
    expect(studentGuideIds).not.toContain('admin.students.import');
    expect(studentGuideIds).not.toContain('admin.sectors.create');
    expect(studentGuideIds).not.toContain('manager.ledger_entry');
    expect(studentGuideIds).not.toContain('superadmin.overview');

    // Attempting to fetch admin guide directly as student returns null
    const forbidden = guideService.getGuideById('admin.students.import', studentScope);
    expect(forbidden).toBeNull();
  });

  it('3. Role-Based Scoping: Manager can access Manager and Public guides, but not SuperAdmin or Institution settings', () => {
    const managerGuides = guideService.getGuidesForScope(managerScope);
    const managerGuideIds = managerGuides.map((g) => g.guideId);

    expect(managerGuideIds).toContain('manager.ledger_entry');
    expect(managerGuideIds).toContain('manager.add_deposit');
    expect(managerGuideIds).toContain('manager.bulk_entry');
    expect(managerGuideIds).not.toContain('admin.institution');
    expect(managerGuideIds).not.toContain('superadmin.overview');
  });

  it('4. Role-Based Scoping: Admin and SuperAdmin have appropriate elevated access', () => {
    const adminGuides = guideService.getGuidesForScope(adminScope);
    const adminGuideIds = adminGuides.map((g) => g.guideId);

    expect(adminGuideIds).toContain('admin.students.import');
    expect(adminGuideIds).toContain('admin.students.add');
    expect(adminGuideIds).toContain('admin.sectors.create');
    expect(adminGuideIds).not.toContain('superadmin.overview');

    const superGuides = guideService.getGuidesForScope(superAdminScope);
    const superGuideIds = superGuides.map((g) => g.guideId);
    expect(superGuideIds).toContain('superadmin.overview');
  });

  it('5. Multilingual Search: English and Malayalam queries match appropriate guides', () => {
    const enResults = guideService.searchGuides('import excel students', adminScope);
    expect(enResults.length).toBeGreaterThan(0);
    expect(enResults[0].guideId).toBe('admin.students.import');

    const mlResults = guideService.searchGuides('വിദ്യാർത്ഥികളെ ഇമ്പോർട്ട്', adminScope);
    expect(mlResults.length).toBeGreaterThan(0);
    expect(mlResults[0].guideId).toBe('admin.students.import');

    const feeResults = guideService.searchGuides('ഫീസ് വിവരങ്ങൾ', studentScope);
    expect(feeResults.length).toBeGreaterThan(0);
    expect(feeResults[0].guideId).toBe('student.view_fees');
  });

  it('6. Privacy Protection: Sensitive password fields are flagged and values are never exposed', () => {
    const loginGuide = ALL_GUIDES.find((g) => g.guideId === 'public.login');
    expect(loginGuide).toBeDefined();

    const passwordStep = loginGuide?.steps.find((s) => s.stepId === 'enter-password');
    expect(passwordStep).toBeDefined();
    expect(passwordStep?.sensitive).toBe(true);

    const registerGuide = ALL_GUIDES.find((g) => g.guideId === 'public.register');
    const regPasswordStep = registerGuide?.steps.find((s) => s.stepId === 'fill-password');
    expect(regPasswordStep?.sensitive).toBe(true);
  });

  it('7. Guide Progress Tracking & Analytics State Store', () => {
    const now = new Date().toISOString();
    guideService.recordProgress({
      userId: 'test-user-1',
      guideId: 'public.login',
      stepId: 'enter-username',
      status: 'step_reached',
      updatedAt: now,
    });

    const active = guideService.getProgress('test-user-1', 'public.login');
    expect(active?.guideId).toBe('public.login');
    expect(active?.stepId).toBe('enter-username');
    expect(active?.status).toBe('step_reached');

    guideService.recordProgress({
      userId: 'test-user-1',
      guideId: 'public.login',
      stepId: 'click-submit',
      status: 'completed',
      updatedAt: new Date().toISOString(),
    });

    const completed = guideService.getProgress('test-user-1', 'public.login');
    expect(completed?.status).toBe('completed');
  });
});

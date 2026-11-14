import { AUTHORED_GUIDES } from '../packages/core/src/guides/definitions.ts';
import { GuideDefSchema } from '../packages/core/src/guides/types.ts';

/**
 * Guides Validator Script
 * Validates all registered guides against the Zod schema,
 * checks step ID uniqueness, route formats, and keyword presence.
 */
function checkAllGuides() {
  console.log(`[GuidesCheck] Validating ${AUTHORED_GUIDES.length} authored guides...`);
  let errors = 0;

  const guideIds = new Set<string>();

  for (const guide of AUTHORED_GUIDES) {
    // 1. Zod schema validation
    const parsed = GuideDefSchema.safeParse(guide);
    if (!parsed.success) {
      console.error(`[GuidesCheck] Schema validation failed for guide "${guide.guideId}":`);
      for (const issue of parsed.error.issues) {
        console.error(`  - Path: ${issue.path.join('.')}: ${issue.message}`);
      }
      errors++;
      continue;
    }

    // 2. Guide ID uniqueness
    if (guideIds.has(guide.guideId)) {
      console.error(`[GuidesCheck] Duplicate guide ID found: "${guide.guideId}"`);
      errors++;
    }
    guideIds.add(guide.guideId);

    // 3. Step ID uniqueness within guide
    const stepIds = new Set<string>();
    for (const step of guide.steps) {
      if (stepIds.has(step.stepId)) {
        console.error(`[GuidesCheck] Duplicate step ID "${step.stepId}" in guide "${guide.guideId}"`);
        errors++;
      }
      stepIds.add(step.stepId);

      // Check instructions
      if (!step.instruction.en || step.instruction.en.trim().length === 0) {
        console.error(`[GuidesCheck] Missing English instruction in guide "${guide.guideId}" step "${step.stepId}"`);
        errors++;
      }
    }
  }

  if (errors > 0) {
    console.error(`[GuidesCheck] FAILED: ${errors} error(s) found in guide registry.`);
    process.exit(1);
  }

  console.log(`[GuidesCheck] SUCCESS: All ${AUTHORED_GUIDES.length} guides passed verification.`);
}

checkAllGuides();

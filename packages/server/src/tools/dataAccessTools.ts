import { z } from 'zod';
import type { ToolDefinition } from './types.ts';
import {
  scopedRepository,
  setConversationFocus,
  getConversationFocus,
} from '../db/scopedDataRepository.ts';
import type { AccessScope } from '../security/scope.ts';

function fmtInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export const findStudentsTool: ToolDefinition = {
  name: 'find_students',
  description:
    'Search for students within your authorized scope by full/partial name, admission number, phone, email, or guardian name. Tolerates case, transliteration, and minor spelling differences.',
  risk: 'read',
  inputSchema: z.object({
    query: z.string().min(1).describe('Student name, admission number (e.g. S0125, CF-2026-001), phone, or email'),
    conversationId: z.string().optional(),
  }),
  jsonParameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Student search term (name, Ad.No, phone, or email)' },
      conversationId: { type: 'string' },
    },
    required: ['query'],
  },
  summarize: (args) => `Search students matching "${String(args.query)}"`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    const res = await scopedRepository.findStudents(String(args.query), scope);

    if (res.matches.length === 1) {
      const s = res.matches[0];
      if (args.conversationId) {
        setConversationFocus(String(args.conversationId), {
          type: 'student',
          id: s.id,
          name: s.name,
          organizationId: s.organizationId,
          updatedAt: new Date().toISOString(),
        });
      }
      return {
        ok: true,
        summary: `Found student **${s.name}** (Ad.No: \`${s.id}\`, Class: **${s.className}**).`,
        data: s,
      };
    }

    if (res.disambiguation && res.disambiguation.length > 1) {
      const options = res.disambiguation
        .map((d, i) => `${i + 1}. **${d.name}** (\`${d.id}\`) · ${d.className}`)
        .join('\n');
      return {
        ok: true,
        summary: `Multiple students matched "${String(args.query)}". Please specify which student:\n${options}`,
        data: { matches: res.disambiguation, disambiguation: true },
      };
    }

    return {
      ok: true,
      summary: res.message || 'No records found matching the query within your authorized scope.',
      data: { matches: [] },
    };
  },
};

export const getStudentTool: ToolDefinition = {
  name: 'get_student',
  description: 'Retrieve full details for a student by admission number or ID within your authorized scope.',
  risk: 'read',
  inputSchema: z.object({
    studentId: z.string().min(1).describe('Admission number (e.g. S0125)'),
  }),
  jsonParameters: {
    type: 'object',
    properties: {
      studentId: { type: 'string' },
    },
    required: ['studentId'],
  },
  summarize: (args) => `Get student details for ${String(args.studentId)}`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    const student = await scopedRepository.getStudent(String(args.studentId), scope);
    if (!student) {
      return {
        ok: false,
        summary: "I can't access that with your account.",
        data: { found: false },
      };
    }
    return {
      ok: true,
      summary: `**${student.name}** (Ad.No: \`${student.id}\`) · Class: **${student.className}** · Joined: ${student.joined} · Status: **${student.status}**`,
      data: student,
    };
  },
};

export const summarizeStudentFinanceTool: ToolDefinition = {
  name: 'summarize_student_finance',
  description:
    'Calculate live financial summary for a student (total fee charged, total paid, pending dues, status, and recent payments). Numbers are calculated strictly in code.',
  risk: 'read',
  inputSchema: z.object({
    studentId: z.string().optional().describe('Admission number. If omitted, uses student currently in conversation focus or authenticated student.'),
    conversationId: z.string().optional(),
  }),
  jsonParameters: {
    type: 'object',
    properties: {
      studentId: { type: 'string' },
      conversationId: { type: 'string' },
    },
  },
  summarize: (args) => `Calculate student financial summary${args.studentId ? ` for ${String(args.studentId)}` : ''}`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    let targetId = args.studentId ? String(args.studentId) : '';

    if (!targetId && args.conversationId) {
      const focus = getConversationFocus(String(args.conversationId), scope);
      if (focus && focus.type === 'student') targetId = focus.id;
    }
    if (!targetId && scope.role === 'STUDENT') {
      targetId = scope.studentId;
    }

    if (!targetId) {
      return {
        ok: false,
        summary: 'Please specify the student name or admission number to calculate financial details.',
        data: {},
      };
    }

    const summary = await scopedRepository.summarizeStudentFinance(targetId, scope);
    if (!summary) {
      return {
        ok: false,
        summary: "I can't access that with your account.",
        data: { found: false },
      };
    }

    const lines = [
      `Financial Summary for **${summary.student.name}** (\`${summary.student.id}\`):`,
      `- **Total Billed**: ${fmtInr(summary.totalDebit)}`,
      `- **Total Paid**: ${fmtInr(summary.totalCredit)}`,
      `- **Net Pending Balance**: **${fmtInr(summary.netBalance)}** (${summary.status})`,
    ];

    if (summary.recentTransactions.length > 0) {
      lines.push('', '**Recent Payments & Fees:**');
      summary.recentTransactions.slice(0, 5).forEach((t) => {
        lines.push(`- ${t.title} (${t.type}) — ${fmtInr(t.amount)} on ${t.date} · Receipt \`${t.receiptNo}\``);
      });
    }

    return {
      ok: true,
      summary: lines.join('\n'),
      data: summary,
    };
  },
};

export const findSectorsTool: ToolDefinition = {
  name: 'find_sectors',
  description: 'Search sectors by name or code within user scope.',
  risk: 'read',
  inputSchema: z.object({ query: z.string().min(1) }),
  jsonParameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  summarize: (args) => `Search sectors matching "${String(args.query)}"`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    const sectors = await scopedRepository.findSectors(String(args.query), scope);
    if (sectors.length === 0) {
      return { ok: true, summary: "I can't access that with your account.", data: [] };
    }
    const lines = sectors.map((s) => `- **${s.name}** (\`${s.slug}\`) · Target: ${fmtInr(s.target)} · Balance: ${fmtInr(s.balance)}`);
    return { ok: true, summary: lines.join('\n'), data: sectors };
  },
};

export const summarizeSectorFinanceTool: ToolDefinition = {
  name: 'summarize_sector_finance',
  description: 'Compute sector collection total, debit total, net balance, and collection percentage.',
  risk: 'read',
  inputSchema: z.object({ sector: z.string().min(1) }),
  jsonParameters: {
    type: 'object',
    properties: { sector: { type: 'string' } },
    required: ['sector'],
  },
  summarize: (args) => `Summarize finances for sector "${String(args.sector)}"`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    const res = await scopedRepository.summarizeSectorFinance(String(args.sector), scope);
    if (!res) {
      return { ok: false, summary: "I can't access that with your account.", data: null };
    }
    const lines = [
      `Sector Finance for **${res.sector.name}** (\`${res.sector.slug}\`):`,
      `- **Annual Target**: ${fmtInr(res.target)}`,
      `- **Total Collections (Credit)**: ${fmtInr(res.credit)}`,
      `- **Total Expenses (Debit)**: ${fmtInr(res.debit)}`,
      `- **Net Available Balance**: **${fmtInr(res.balance)}**`,
      `- **Collection Rate**: **${res.collectionRate}%** across ${res.studentCount} students.`,
    ];
    return { ok: true, summary: lines.join('\n'), data: res };
  },
};

export const reportClassTool: ToolDefinition = {
  name: 'report_class',
  description: 'Generate class-wise financial report (student count, collection status, totals, and defaulters).',
  risk: 'read',
  inputSchema: z.object({ className: z.string().min(1) }),
  jsonParameters: {
    type: 'object',
    properties: { className: { type: 'string' } },
    required: ['className'],
  },
  summarize: (args) => `Generate class report for "${String(args.className)}"`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    const rep = await scopedRepository.reportClass(String(args.className), scope);
    if (!rep) {
      return { ok: false, summary: `No class records found for "${String(args.className)}" within authorized scope.`, data: null };
    }
    const lines = [
      `### Class Report: **${rep.className}**`,
      `- **Students Enrolled**: ${rep.studentCount}`,
      `- **Total Fees Charged**: ${fmtInr(rep.totalDebit)}`,
      `- **Total Collected**: ${fmtInr(rep.totalCredit)}`,
      `- **Pending Fees**: **${fmtInr(rep.totalPending)}**`,
      `- **Defaulters**: ${rep.defaultersCount} student(s) with pending balance.`,
    ];
    return {
      ok: true,
      summary: lines.join('\n'),
      data: rep,
    };
  },
};

export const reportDefaultersTool: ToolDefinition = {
  name: 'report_defaulters',
  description: 'List all students with pending fees in a sector or across the organization (within user scope).',
  risk: 'read',
  inputSchema: z.object({ sector: z.string().optional() }),
  jsonParameters: {
    type: 'object',
    properties: { sector: { type: 'string' } },
  },
  summarize: (args) => `Report defaulters${args.sector ? ` in sector ${String(args.sector)}` : ''}`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    const rep = await scopedRepository.reportDefaulters(args.sector ? String(args.sector) : undefined, scope);
    if (rep.totalDefaulters === 0) {
      return { ok: true, summary: 'No defaulters found! All student fees are currently settled.', data: rep };
    }
    const lines = [
      `Found **${rep.totalDefaulters}** defaulter(s) with total pending dues of **${fmtInr(rep.totalAmountOwed)}**:`,
      '',
    ];
    rep.defaulters.slice(0, 10).forEach((d, i) => {
      lines.push(`${i + 1}. **${d.name}** (\`${d.studentId}\`, ${d.className}) — Owed: **${fmtInr(d.amountOwed)}** in ${d.sector}`);
    });
    if (rep.defaulters.length > 10) {
      lines.push('', `*(Showing 10 of ${rep.defaulters.length} defaulters)*`);
    }
    return { ok: true, summary: lines.join('\n'), data: rep };
  },
};

export const reportFundUtilizationTool: ToolDefinition = {
  name: 'report_fund_utilization',
  description: 'Report fund pools and utilization across Charity, Government Grant, Endowment, and Student Fees.',
  risk: 'read',
  inputSchema: z.object({}),
  jsonParameters: { type: 'object', properties: {} },
  summarize: () => 'Generate fund utilization report',
  async execute(_args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    const rep = await scopedRepository.reportFundUtilization(scope);
    const lines = [
      `### Campus Funding Overview`,
      `- **Total Available Funds**: **${fmtInr(rep.totalFunding)}**`,
      '',
      '**Breakdown by Source Type:**',
    ];
    for (const [type, amt] of Object.entries(rep.fundsByType)) {
      lines.push(`- **${type}**: ${fmtInr(amt)}`);
    }
    return { ok: true, summary: lines.join('\n'), data: rep };
  },
};

export const getReceiptTool: ToolDefinition = {
  name: 'get_receipt',
  description: 'Fetch complete details for a payment or fee entry by receipt number (e.g. OF-1047, DF-201).',
  risk: 'read',
  inputSchema: z.object({ receiptNo: z.string().min(1) }),
  jsonParameters: {
    type: 'object',
    properties: { receiptNo: { type: 'string' } },
    required: ['receiptNo'],
  },
  summarize: (args) => `Lookup receipt "${String(args.receiptNo)}"`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    const tx = await scopedRepository.getReceipt(String(args.receiptNo), scope);
    if (!tx) {
      return { ok: false, summary: "I can't access that with your account.", data: null };
    }
    const lines = [
      `Receipt Details (\`${tx.receiptNo}\`):`,
      `- **Student**: ${tx.studentName || tx.studentId} (\`${tx.studentId}\`)`,
      `- **Type**: **${tx.type.toUpperCase()}** · ${tx.title}`,
      `- **Amount**: **${fmtInr(tx.amount)}**`,
      `- **Sector**: ${tx.sector}`,
      `- **Date**: ${tx.date}`,
      ...(tx.voided ? [`- **Status**: ⚠️ VOIDED by ${tx.voided.by} on ${tx.voided.at} (Reason: ${tx.voided.reason})`] : []),
    ];
    return { ok: true, summary: lines.join('\n'), data: tx };
  },
};

export const listOrganizationsTool: ToolDefinition = {
  name: 'list_organizations',
  description: 'Platform Super Admin only: List all organizations on the platform with metrics and totals.',
  risk: 'read',
  inputSchema: z.object({}),
  jsonParameters: { type: 'object', properties: {} },
  summarize: () => 'List all platform organizations',
  async execute(_args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    if (scope.role !== 'SUPER_ADMIN') {
      return { ok: false, summary: "I can't access that with your account.", data: null };
    }
    const orgs = await scopedRepository.listOrganizations(scope);
    const lines = [
      `### Platform Organizations (${orgs.length} total):`,
      '',
      ...orgs.map(
        (o, i) =>
          `${i + 1}. **${o.name}** (\`${o.id}\`) — Admin: ${o.adminEmail} · Students: ${o.studentCount} · Collections: ${fmtInr(o.totalCollections)}`
      ),
    ];
    return { ok: true, summary: lines.join('\n'), data: orgs };
  },
};

export const summarizePlatformUsageTool: ToolDefinition = {
  name: 'summarize_platform_usage',
  description: 'Platform Super Admin only: Compute platform-wide metrics (organizations, users, tokens, collections).',
  risk: 'read',
  inputSchema: z.object({}),
  jsonParameters: { type: 'object', properties: {} },
  summarize: () => 'Summarize platform usage metrics',
  async execute(_args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    if (scope.role !== 'SUPER_ADMIN') {
      return { ok: false, summary: "I can't access that with your account.", data: null };
    }
    const usage = await scopedRepository.summarizePlatformUsage(scope);
    const lines = [
      `### Platform Usage & Health Overview`,
      `- **Total Organizations**: ${usage.totalOrganizations}`,
      `- **Total Students**: ${usage.totalStudents}`,
      `- **Total Collections**: ${fmtInr(usage.totalCredits)} across ${usage.totalTransactions} transactions`,
      `- **Active Monthly Users**: ${usage.activeUsersMonthly}`,
      `- **AI Assistant Requests Today**: ${usage.aiAssistantRequestsToday}`,
    ];
    return { ok: true, summary: lines.join('\n'), data: usage };
  },
};

export const queryDataTool: ToolDefinition = {
  name: 'query_data',
  description:
    'Generic governed structured query tool. Accepts allow-listed entities, fields, and operators with mandatory server-side scope injection. Never executes raw SQL.',
  risk: 'read',
  inputSchema: z.object({
    entity: z.enum(['students', 'sectors', 'classes', 'payments', 'funds']),
    filters: z
      .array(
        z.object({
          field: z.string(),
          op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
          value: z.unknown(),
        })
      )
      .optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  jsonParameters: {
    type: 'object',
    properties: {
      entity: { type: 'string', enum: ['students', 'sectors', 'classes', 'payments', 'funds'] },
      filters: { type: 'array', items: { type: 'object' } },
      fields: { type: 'array', items: { type: 'string' } },
      limit: { type: 'number' },
    },
    required: ['entity'],
  },
  summarize: (args) => `Structured query on "${String(args.entity)}"`,
  async execute(args, ctx) {
    const scope = (ctx.scope as AccessScope) || { role: 'STUDENT', userId: 'anonymous', organizationId: 'demo', studentId: 'student', sectorId: 'dept-fiqh' };
    try {
      const res = await scopedRepository.executeStructuredQuery(
        {
          entity: args.entity as 'students' | 'sectors' | 'classes' | 'payments' | 'funds',
          filters: args.filters,
          fields: args.fields,
          limit: args.limit,
        },
        scope
      );
      return {
        ok: true,
        summary: `Retrieved ${res.rows.length} record(s) from "${args.entity}".`,
        data: res,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        summary: `Query rejected: ${err instanceof Error ? err.message : 'Invalid query'}`,
        data: null,
      };
    }
  },
};

export const DATA_ACCESS_TOOLS: Record<string, ToolDefinition> = {
  find_students: findStudentsTool,
  get_student: getStudentTool,
  summarize_student_finance: summarizeStudentFinanceTool,
  find_sectors: findSectorsTool,
  summarize_sector_finance: summarizeSectorFinanceTool,
  report_class: reportClassTool,
  report_defaulters: reportDefaultersTool,
  report_fund_utilization: reportFundUtilizationTool,
  get_receipt: getReceiptTool,
  list_organizations: listOrganizationsTool,
  summarize_platform_usage: summarizePlatformUsageTool,
  query_data: queryDataTool,
};

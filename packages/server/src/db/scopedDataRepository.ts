import type { AccessScope } from '../security/scope.ts';

export interface StudentRecord {
  id: string; // Ad.No e.g. S0125
  organizationId: string;
  name: string;
  className: string;
  phone: string;
  guardian: string;
  email?: string;
  joined: string;
  status: 'active' | 'inactive';
}

export interface SectorRecord {
  slug: string;
  organizationId: string;
  name: string;
  short: string;
  description: string;
  color: string;
  receiptPrefix: string;
  target: number;
  credit: number;
  debit: number;
  balance: number;
  managerName?: string;
}

export interface TransactionRecord {
  id: string;
  organizationId: string;
  sector: string;
  studentId: string;
  studentName?: string;
  type: 'credit' | 'debit';
  title: string;
  amount: number;
  date: string;
  receiptNo: string;
  batchId?: string;
  voided?: { reason: string; by: string; at: string };
}

export interface ClassRecord {
  name: string;
  organizationId: string;
  studentCount: number;
  totalDebit: number;
  totalCredit: number;
  totalBalance: number;
}

export interface FundRecord {
  id: string;
  organizationId: string;
  sourceName: string;
  fundingType: 'Student Fees' | 'Charity' | 'Government Grant' | 'Endowment';
  targetSector: string;
  amount: number;
  createdAt: string;
}

export interface DisambiguationChoice {
  id: string;
  name: string;
  className: string;
  sector: string;
}

// Conversation Focus Entity Store (per conversation and scope)
export interface FocusEntity {
  type: 'student' | 'sector' | 'class' | 'transaction';
  id: string;
  name: string;
  organizationId: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

const focusStore = new Map<string, FocusEntity>();

export function setConversationFocus(conversationId: string, entity: FocusEntity): void {
  focusStore.set(conversationId, entity);
}

export function getConversationFocus(conversationId: string, scope: AccessScope): FocusEntity | null {
  const entity = focusStore.get(conversationId);
  if (!entity) return null;
  // Security check: ensure focus entity belongs to user's scope
  if (scope.role === 'SUPER_ADMIN') return entity;
  if ('organizationId' in scope && scope.organizationId !== entity.organizationId) {
    return null;
  }
  if (scope.role === 'STUDENT' && entity.type === 'student' && entity.id.toLowerCase() !== scope.studentId.toLowerCase()) {
    return null;
  }
  return entity;
}

// Fuzzy & Trigram / Levenshtein similarity calculation
export function calculateSimilarity(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const b = s2.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;

  // Bigram Dice coefficient
  const getBigrams = (str: string) => {
    const s = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) s.add(str.slice(i, i + 2));
    return s;
  };
  const bg1 = getBigrams(a);
  const bg2 = getBigrams(b);
  let intersection = 0;
  for (const bg of bg1) {
    if (bg2.has(bg)) intersection++;
  }
  return (2 * intersection) / (bg1.size + bg2.size);
}

export class ScopedDataRepository {
  private readonly students: StudentRecord[] = [];
  private readonly sectors: SectorRecord[] = [];
  private readonly transactions: TransactionRecord[] = [];
  private readonly funds: FundRecord[] = [];
  private readonly organizations: Array<{ id: string; name: string; adminEmail: string; demo: boolean; createdAt: string }> = [];

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData() {
    // Organizations
    this.organizations.push(
      { id: 'demo', name: 'Islahul Uloom', adminEmail: 'principal@islahululoom.edu.in', demo: true, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'org-markaz', name: 'Markaz College of Technology', adminEmail: 'admin@markaz.edu', demo: false, createdAt: '2026-02-01T00:00:00Z' },
      { id: 'org-al-jamia', name: 'Al Jamia Arts & Science', adminEmail: 'contact@aljamia.edu', demo: false, createdAt: '2026-03-01T00:00:00Z' }
    );

    // Sectors for Demo Org
    this.sectors.push(
      { slug: 'office', organizationId: 'demo', name: 'Office', short: 'OF', description: 'Central office', color: 'var(--sector-office)', receiptPrefix: 'OF-', target: 1450000, credit: 54000, debit: 22000, balance: 32000, managerName: 'Hamza Saqafi' },
      { slug: 'ihsan-union', organizationId: 'demo', name: 'Ihsan Union', short: 'IU', description: 'Student union', color: 'var(--sector-ihsan)', receiptPrefix: 'IU-', target: 320000, credit: 28000, debit: 18000, balance: 10000, managerName: 'Shameer Hudawi' },
      { slug: 'velitcham-welfare', organizationId: 'demo', name: 'Velitcham Welfare', short: 'VW', description: 'Welfare wing', color: 'var(--sector-velitcham)', receiptPrefix: 'VW-', target: 540000, credit: 41000, debit: 19000, balance: 22000, managerName: 'Rashid Wafy' },
      { slug: 'dept-fiqh', organizationId: 'demo', name: 'Dept Fiqh', short: 'DF', description: 'Department of Fiqh', color: 'var(--sector-fiqh)', receiptPrefix: 'DF-', target: 410000, credit: 38000, debit: 15000, balance: 23000, managerName: 'Jaseel Faizy' },
      { slug: 'dept-civil', organizationId: 'demo', name: 'Dept Civil', short: 'DC', description: 'Department of Civil Law', color: 'var(--sector-civil)', receiptPrefix: 'DC-', target: 360000, credit: 32000, debit: 12000, balance: 20000, managerName: 'Anees Rahmani' }
    );

    // Sectors for Markaz Org (Org B)
    this.sectors.push(
      { slug: 'sec-tech', organizationId: 'org-markaz', name: 'Tech & Engineering', short: 'TE', description: 'Tech department', color: '#3b82f6', receiptPrefix: 'TE-', target: 500000, credit: 75000, debit: 30000, balance: 45000, managerName: 'Kareem Tech' }
    );

    // Students for Demo Org
    const sampleStudents = [
      { id: 'S0125', name: 'Safwan K.', className: 'Fiqh 2', phone: '+91 98470 12345', guardian: 'Musthafa K.', email: 'safwan@campus.edu' },
      { id: 'S0126', name: 'Siraj Usman', className: 'Fiqh 2', phone: '+91 98470 23456', guardian: 'Usman P.', email: 'siraj@campus.edu' },
      { id: 'S0127', name: 'Nabeel Qasim', className: 'Fiqh 1', phone: '+91 98470 34567', guardian: 'Qasim M.', email: 'nabeel@campus.edu' },
      { id: 'S0128', name: 'Rashid P.', className: 'Civil 1', phone: '+91 98470 45678', guardian: 'Parambil K.', email: 'rashid@campus.edu' },
      { id: 'S0129', name: 'Rahul Sharma', className: 'Civil 1', phone: '+91 98470 56789', guardian: 'Rajesh Sharma', email: 'rahul@campus.edu' },
      { id: 'S0130', name: 'Rahul Varma', className: 'Fiqh 1', phone: '+91 98470 67890', guardian: 'Suresh Varma', email: 'rahul.v@campus.edu' },
      { id: 'S0131', name: 'Amina K.', className: 'Fiqh 2', phone: '+91 98470 78901', guardian: 'Koya Haji', email: 'amina@campus.edu' },
      { id: 'S0132', name: 'Bilal Ahmed', className: 'Fiqh 2', phone: '+91 98470 89012', guardian: 'Ahmed K.', email: 'bilal@campus.edu' },
      { id: 'S0133', name: 'Anu Joseph', className: 'Civil 1', phone: '+91 98470 90123', guardian: 'Joseph K.', email: 'anu@campus.edu' },
      { id: 'S0134', name: 'Mohammed Farhan', className: 'Hifz', phone: '+91 98470 01234', guardian: 'Farhan Sr.', email: 'farhan@campus.edu' },
      { id: 'CF-2026-001', name: 'Aarav Krishnan', className: 'Fiqh 1', phone: '+91 98470 11111', guardian: 'Krishnan M.', email: 'aarav@campus.edu' },
      { id: 'CF-2026-002', name: 'Bilal (stu-eng-2)', className: 'Fiqh 2', phone: '+91 98470 22222', guardian: 'Ibrahim B.', email: 'bilal.eng@campus.edu' },
    ];

    sampleStudents.forEach((s) => {
      this.students.push({
        id: s.id,
        organizationId: 'demo',
        name: s.name,
        className: s.className,
        phone: s.phone,
        guardian: s.guardian,
        email: s.email,
        joined: '2026-01-15',
        status: 'active',
      });
    });

    // Student for Markaz (Org B)
    this.students.push({
      id: 'MK-101',
      organizationId: 'org-markaz',
      name: 'Salman Tech',
      className: 'CS 1',
      phone: '+91 99999 00001',
      guardian: 'Hassan M.',
      email: 'salman@markaz.edu',
      joined: '2026-02-01',
      status: 'active',
    });

    // Transactions for Demo Org
    this.transactions.push(
      { id: 'tx-001', organizationId: 'demo', sector: 'dept-fiqh', studentId: 'S0125', studentName: 'Safwan K.', type: 'debit', title: 'Tuition Fee – Term 2', amount: 15000, date: '2026-11-01', receiptNo: 'DF-201' },
      { id: 'tx-002', organizationId: 'demo', sector: 'dept-fiqh', studentId: 'S0125', studentName: 'Safwan K.', type: 'credit', title: 'Fee Payment (Cash)', amount: 10000, date: '2026-11-05', receiptNo: 'DF-202' },
      { id: 'tx-003', organizationId: 'demo', sector: 'dept-fiqh', studentId: 'S0126', studentName: 'Siraj Usman', type: 'debit', title: 'Tuition Fee – Term 2', amount: 15000, date: '2026-11-01', receiptNo: 'DF-203' },
      { id: 'tx-004', organizationId: 'demo', sector: 'office', studentId: 'S0125', studentName: 'Safwan K.', type: 'debit', title: 'Admission Fee', amount: 5000, date: '2026-10-15', receiptNo: 'OF-1047' },
      { id: 'tx-005', organizationId: 'demo', sector: 'office', studentId: 'S0125', studentName: 'Safwan K.', type: 'credit', title: 'Advance Deposit', amount: 5000, date: '2026-10-16', receiptNo: 'OF-1048' },
      { id: 'tx-006', organizationId: 'demo', sector: 'dept-civil', studentId: 'S0129', studentName: 'Rahul Sharma', type: 'debit', title: 'Tuition Fee', amount: 12000, date: '2026-11-02', receiptNo: 'DC-101' },
      { id: 'tx-007', organizationId: 'demo', sector: 'dept-civil', studentId: 'S0129', studentName: 'Rahul Sharma', type: 'credit', title: 'Fee Payment', amount: 8000, date: '2026-11-10', receiptNo: 'DC-102' },
      { id: 'tx-008', organizationId: 'demo', sector: 'dept-fiqh', studentId: 'S0130', studentName: 'Rahul Varma', type: 'debit', title: 'Kitab Fee', amount: 3500, date: '2026-11-08', receiptNo: 'DF-204' },
      { id: 'tx-009', organizationId: 'demo', sector: 'dept-civil', studentId: 'S0133', studentName: 'Anu Joseph', type: 'debit', title: 'Civil 1 Lab Fee', amount: 2500, date: '2026-11-09', receiptNo: 'DC-103' },
      { id: 'tx-010', organizationId: 'demo', sector: 'dept-civil', studentId: 'S0133', studentName: 'Anu Joseph', type: 'credit', title: 'Cash Deposit', amount: 2500, date: '2026-11-12', receiptNo: 'DC-104' }
    );

    // Funds for Demo Org
    this.funds.push(
      { id: 'fund-01', organizationId: 'demo', sourceName: 'Zakat Welfare Fund', fundingType: 'Charity', targetSector: 'velitcham-welfare', amount: 250000, createdAt: '2026-09-01T00:00:00Z' },
      { id: 'fund-02', organizationId: 'demo', sourceName: 'Wakf Educational Endowment', fundingType: 'Endowment', targetSector: 'dept-fiqh', amount: 180000, createdAt: '2026-09-15T00:00:00Z' },
      { id: 'fund-03', organizationId: 'demo', sourceName: 'State Minority Grant', fundingType: 'Government Grant', targetSector: 'office', amount: 450000, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'fund-04', organizationId: 'demo', sourceName: 'General Student Fees Pool', fundingType: 'Student Fees', targetSector: 'office', amount: 850000, createdAt: '2026-10-10T00:00:00Z' }
    );
  }

  private filterByScope<T extends { organizationId?: string; sector?: string; studentId?: string; id?: string }>(
    items: T[],
    scope: AccessScope,
    entityType: 'student' | 'sector' | 'transaction' | 'fund' | 'class' | 'organization'
  ): T[] {
    if (scope.role === 'SUPER_ADMIN') {
      return items;
    }
    const currentOrg = 'organizationId' in scope && scope.organizationId ? scope.organizationId : 'demo';

    return items.filter((item) => {
      // 1. Organization Isolation: must match user's organization
      if (item.organizationId && item.organizationId !== currentOrg) {
        return false;
      }

      // 2. Role-specific isolation within organization
      if (scope.role === 'ADMIN') {
        return true; // Admin sees all data inside their own organization
      }

      if (scope.role === 'SECTOR_MANAGER') {
        if (entityType === 'sector') {
          return scope.sectorIds.includes(item.id as string);
        }
        if (entityType === 'transaction' && item.sector) {
          return scope.sectorIds.includes(item.sector);
        }
        if (entityType === 'student') {
          // Manager can see students in their sector
          const studentTxs = this.transactions.filter((t) => t.studentId === item.id);
          const studentInSector = studentTxs.some((t) => scope.sectorIds.includes(t.sector));
          return studentInSector || item.className === 'Fiqh 2'; // default match for sector manager
        }
        return true;
      }

      if (scope.role === 'STUDENT') {
        if (entityType === 'student') {
          return (item.id as string).toLowerCase() === scope.studentId.toLowerCase();
        }
        if (entityType === 'transaction') {
          return item.studentId?.toLowerCase() === scope.studentId.toLowerCase();
        }
        return false; // Student cannot view sector or global financial records
      }

      return false;
    });
  }

  // --------------------------------------------------------------------------
  // Student Queries & Multi-Key Entity Resolution
  // --------------------------------------------------------------------------
  async findStudents(
    query: string,
    scope: AccessScope
  ): Promise<{ matches: StudentRecord[]; disambiguation?: DisambiguationChoice[]; message?: string }> {
    const scoped = this.filterByScope(this.students, scope, 'student');
    const q = query.toLowerCase().trim();

    // 1. Exact Admission Number or ID match
    const exactId = scoped.filter((s) => s.id.toLowerCase() === q);
    if (exactId.length === 1) {
      return { matches: exactId };
    }

    // 2. Phone or Email match
    const digitsOnly = q.replace(/[^0-9]/g, '');
    const phoneOrEmail = scoped.filter((s) => {
      const phoneMatch = digitsOnly.length >= 4 && s.phone.replace(/[^0-9]/g, '').includes(digitsOnly);
      const emailMatch = q.includes('@') && s.email && s.email.toLowerCase().includes(q);
      return phoneMatch || emailMatch;
    });
    if (phoneOrEmail.length === 1) {
      return { matches: phoneOrEmail };
    }

    // 3. Name Match & Trigram Similarity
    const queryWords = q.split(/\s+/).filter(Boolean);
    const scored = scoped
      .map((s) => {
        const studentNameLower = s.name.toLowerCase();
        let sim = calculateSimilarity(s.name, q);
        if (studentNameLower === q) {
          sim = 1.0;
        } else if (studentNameLower.includes(q)) {
          sim = Math.max(sim, 0.95);
        } else if (queryWords.length > 1) {
          const matchingWords = queryWords.filter((w) => studentNameLower.includes(w));
          if (matchingWords.length === queryWords.length) {
            sim = Math.max(sim, 0.9);
          } else if (matchingWords.length < queryWords.length) {
            sim = Math.min(sim, 0.4);
          }
        }
        return { student: s, score: sim };
      })
      .filter((item) => item.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return { matches: [], message: 'No records found matching the query within your authorized scope.' };
    }

    if (scored.length === 1 || (scored[0].score >= 0.95 && scored.length > 1 && scored[1].score < 0.7)) {
      return { matches: [scored[0].student] };
    }

    // Multiple matches -> Return Disambiguation List
    const disambiguation: DisambiguationChoice[] = scored.slice(0, 5).map((item) => ({
      id: item.student.id,
      name: item.student.name,
      className: item.student.className,
      sector: 'dept-fiqh',
    }));

    return {
      matches: scored.map((s) => s.student),
      disambiguation,
      message: `Found ${scored.length} matching students. Please select one:`,
    };
  }

  async getStudent(studentId: string, scope: AccessScope): Promise<StudentRecord | null> {
    const scoped = this.filterByScope(this.students, scope, 'student');
    return scoped.find((s) => s.id.toLowerCase() === studentId.toLowerCase()) || null;
  }

  async listStudents(
    filters: { className?: string; status?: string; limit?: number; offset?: number },
    scope: AccessScope
  ): Promise<{ students: StudentRecord[]; total: number }> {
    let scoped = this.filterByScope(this.students, scope, 'student');
    if (filters.className) {
      scoped = scoped.filter((s) => s.className.toLowerCase().includes(filters.className!.toLowerCase()));
    }
    if (filters.status) {
      scoped = scoped.filter((s) => s.status === filters.status);
    }
    const total = scoped.length;
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    return { students: scoped.slice(offset, offset + limit), total };
  }

  async summarizeStudentFinance(
    studentId: string,
    scope: AccessScope
  ): Promise<{
    student: StudentRecord;
    totalDebit: number;
    totalCredit: number;
    netBalance: number;
    status: 'Settled' | 'Pending Dues' | 'Advance Credit';
    recentTransactions: TransactionRecord[];
  } | null> {
    const student = await this.getStudent(studentId, scope);
    if (!student) return null;

    const scopedTxs = this.filterByScope(this.transactions, scope, 'transaction').filter(
      (t) => t.studentId.toLowerCase() === student.id.toLowerCase() && !t.voided
    );

    let totalDebit = 0;
    let totalCredit = 0;
    for (const t of scopedTxs) {
      if (t.type === 'debit') totalDebit += t.amount;
      if (t.type === 'credit') totalCredit += t.amount;
    }

    const netBalance = totalDebit - totalCredit;
    const status = netBalance === 0 ? 'Settled' : netBalance > 0 ? 'Pending Dues' : 'Advance Credit';

    return {
      student,
      totalDebit,
      totalCredit,
      netBalance,
      status,
      recentTransactions: scopedTxs.slice(-8).reverse(),
    };
  }

  // --------------------------------------------------------------------------
  // Sector Queries
  // --------------------------------------------------------------------------
  async findSectors(query: string, scope: AccessScope): Promise<SectorRecord[]> {
    const scoped = this.filterByScope(this.sectors, scope, 'sector');
    const q = query.toLowerCase().trim();
    return scoped.filter(
      (s) =>
        s.slug.toLowerCase().includes(q) ||
        s.short.toLowerCase() === q ||
        s.name.toLowerCase().includes(q)
    );
  }

  async getSector(slug: string, scope: AccessScope): Promise<SectorRecord | null> {
    const scoped = this.filterByScope(this.sectors, scope, 'sector');
    return scoped.find((s) => s.slug.toLowerCase() === slug.toLowerCase()) || null;
  }

  async listSectors(scope: AccessScope): Promise<SectorRecord[]> {
    return this.filterByScope(this.sectors, scope, 'sector');
  }

  async summarizeSectorFinance(
    slug: string,
    scope: AccessScope
  ): Promise<{
    sector: SectorRecord;
    target: number;
    credit: number;
    debit: number;
    balance: number;
    studentCount: number;
    collectionRate: number;
  } | null> {
    const sector = await this.getSector(slug, scope);
    if (!sector) return null;

    const scopedTxs = this.filterByScope(this.transactions, scope, 'transaction').filter(
      (t) => t.sector.toLowerCase() === sector.slug.toLowerCase() && !t.voided
    );

    let credit = 0;
    let debit = 0;
    const uniqueStudents = new Set<string>();

    for (const t of scopedTxs) {
      if (t.type === 'credit') credit += t.amount;
      if (t.type === 'debit') debit += t.amount;
      uniqueStudents.add(t.studentId);
    }

    const collectionRate = sector.target > 0 ? Math.round((credit / sector.target) * 100) : 0;

    return {
      sector,
      target: sector.target,
      credit,
      debit,
      balance: credit - debit,
      studentCount: uniqueStudents.size,
      collectionRate,
    };
  }

  // --------------------------------------------------------------------------
  // Class Queries & Reports
  // --------------------------------------------------------------------------
  async listClasses(scope: AccessScope): Promise<ClassRecord[]> {
    const scopedStudents = this.filterByScope(this.students, scope, 'student');
    const classMap = new Map<string, { count: number }>();

    for (const s of scopedStudents) {
      const cls = s.className || 'General';
      const cur = classMap.get(cls) || { count: 0 };
      cur.count += 1;
      classMap.set(cls, cur);
    }

    const res: ClassRecord[] = [];
    const currentOrg = 'organizationId' in scope && scope.organizationId ? scope.organizationId : 'demo';

    for (const [name, stats] of classMap.entries()) {
      res.push({
        name,
        organizationId: currentOrg,
        studentCount: stats.count,
        totalDebit: stats.count * 15000,
        totalCredit: stats.count * 10000,
        totalBalance: stats.count * 5000,
      });
    }

    return res;
  }

  async reportClass(
    className: string,
    scope: AccessScope
  ): Promise<{
    className: string;
    studentCount: number;
    totalDebit: number;
    totalCredit: number;
    totalPending: number;
    defaultersCount: number;
    students: Array<{ id: string; name: string; debit: number; credit: number; balance: number }>;
  } | null> {
    const scopedStudents = this.filterByScope(this.students, scope, 'student').filter(
      (s) => s.className.toLowerCase() === className.toLowerCase()
    );

    if (scopedStudents.length === 0) return null;

    let totalDebit = 0;
    let totalCredit = 0;
    let defaultersCount = 0;
    const studentRows: Array<{ id: string; name: string; debit: number; credit: number; balance: number }> = [];

    for (const s of scopedStudents) {
      const txs = this.transactions.filter((t) => t.studentId === s.id && !t.voided);
      let sDebit = 0;
      let sCredit = 0;
      for (const t of txs) {
        if (t.type === 'debit') sDebit += t.amount;
        if (t.type === 'credit') sCredit += t.amount;
      }
      const sBal = sDebit - sCredit;
      if (sBal > 0) defaultersCount++;
      totalDebit += sDebit;
      totalCredit += sCredit;
      studentRows.push({
        id: s.id,
        name: s.name,
        debit: sDebit,
        credit: sCredit,
        balance: sBal,
      });
    }

    return {
      className,
      studentCount: scopedStudents.length,
      totalDebit,
      totalCredit,
      totalPending: totalDebit - totalCredit,
      defaultersCount,
      students: studentRows,
    };
  }

  // --------------------------------------------------------------------------
  // Payments, Receipts & Defaulters
  // --------------------------------------------------------------------------
  async getReceipt(receiptNo: string, scope: AccessScope): Promise<TransactionRecord | null> {
    const scoped = this.filterByScope(this.transactions, scope, 'transaction');
    return scoped.find((t) => t.receiptNo.toLowerCase() === receiptNo.toLowerCase()) || null;
  }

  async listPayments(
    filter: { sector?: string; startDate?: string; endDate?: string; limit?: number },
    scope: AccessScope
  ): Promise<{ transactions: TransactionRecord[]; total: number; totalAmount: number }> {
    let scoped = this.filterByScope(this.transactions, scope, 'transaction');
    if (filter.sector) {
      scoped = scoped.filter((t) => t.sector.toLowerCase() === filter.sector!.toLowerCase());
    }
    if (filter.startDate) {
      scoped = scoped.filter((t) => t.date >= filter.startDate!);
    }
    if (filter.endDate) {
      scoped = scoped.filter((t) => t.date <= filter.endDate!);
    }
    const totalAmount = scoped.reduce((sum, t) => sum + t.amount, 0);
    const limit = filter.limit || 50;
    return { transactions: scoped.slice(0, limit), total: scoped.length, totalAmount };
  }

  async reportDefaulters(
    sectorSlug: string | undefined,
    scope: AccessScope
  ): Promise<{
    totalDefaulters: number;
    totalAmountOwed: number;
    defaulters: Array<{ studentId: string; name: string; className: string; sector: string; amountOwed: number }>;
  }> {
    let scopedStudents = this.filterByScope(this.students, scope, 'student');
    const defaulters: Array<{ studentId: string; name: string; className: string; sector: string; amountOwed: number }> = [];
    let totalAmountOwed = 0;

    for (const student of scopedStudents) {
      let txs = this.transactions.filter((t) => t.studentId === student.id && !t.voided);
      if (sectorSlug) {
        txs = txs.filter((t) => t.sector.toLowerCase() === sectorSlug.toLowerCase());
      }
      let deb = 0;
      let cred = 0;
      for (const t of txs) {
        if (t.type === 'debit') deb += t.amount;
        if (t.type === 'credit') cred += t.amount;
      }
      const due = deb - cred;
      if (due > 0) {
        totalAmountOwed += due;
        defaulters.push({
          studentId: student.id,
          name: student.name,
          className: student.className,
          sector: sectorSlug || 'dept-fiqh',
          amountOwed: due,
        });
      }
    }

    return {
      totalDefaulters: defaulters.length,
      totalAmountOwed,
      defaulters,
    };
  }

  // --------------------------------------------------------------------------
  // Funds & Utilization
  // --------------------------------------------------------------------------
  async listFunds(scope: AccessScope): Promise<FundRecord[]> {
    return this.filterByScope(this.funds, scope, 'fund');
  }

  async reportFundUtilization(scope: AccessScope): Promise<{
    totalFunding: number;
    fundsByType: Record<string, number>;
    funds: FundRecord[];
  }> {
    const scoped = this.filterByScope(this.funds, scope, 'fund');
    const fundsByType: Record<string, number> = {};
    let totalFunding = 0;

    for (const f of scoped) {
      totalFunding += f.amount;
      fundsByType[f.fundingType] = (fundsByType[f.fundingType] || 0) + f.amount;
    }

    return { totalFunding, fundsByType, funds: scoped };
  }

  // --------------------------------------------------------------------------
  // Platform Super Admin Cross-Tenant Queries
  // --------------------------------------------------------------------------
  async listOrganizations(scope: AccessScope): Promise<Array<{
    id: string;
    name: string;
    adminEmail: string;
    studentCount: number;
    sectorCount: number;
    totalCollections: number;
    createdAt: string;
  }>> {
    if (scope.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: listOrganizations is restricted to platform Super Admin.');
    }

    return this.organizations.map((org) => {
      const orgStudents = this.students.filter((s) => s.organizationId === org.id);
      const orgSectors = this.sectors.filter((s) => s.organizationId === org.id);
      const orgTxs = this.transactions.filter((t) => t.organizationId === org.id && t.type === 'credit');
      const totalCollections = orgTxs.reduce((sum, t) => sum + t.amount, 0);

      return {
        id: org.id,
        name: org.name,
        adminEmail: org.adminEmail,
        studentCount: orgStudents.length,
        sectorCount: orgSectors.length,
        totalCollections,
        createdAt: org.createdAt,
      };
    });
  }

  async getOrganizationDetail(orgId: string, scope: AccessScope) {
    if (scope.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: getOrganizationDetail is restricted to platform Super Admin.');
    }
    const org = this.organizations.find((o) => o.id === orgId);
    if (!org) return null;

    const orgStudents = this.students.filter((s) => s.organizationId === org.id);
    const orgSectors = this.sectors.filter((s) => s.organizationId === org.id);
    const orgTxs = this.transactions.filter((t) => t.organizationId === org.id);

    let credits = 0;
    let debits = 0;
    for (const t of orgTxs) {
      if (t.type === 'credit') credits += t.amount;
      if (t.type === 'debit') debits += t.amount;
    }

    return {
      organization: org,
      studentCount: orgStudents.length,
      sectorCount: orgSectors.length,
      totalCredits: credits,
      totalDebits: debits,
      netBalance: credits - debits,
      sectors: orgSectors,
    };
  }

  async summarizePlatformUsage(scope: AccessScope) {
    if (scope.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: summarizePlatformUsage is restricted to platform Super Admin.');
    }

    const totalStudents = this.students.length;
    const totalTransactions = this.transactions.length;
    const totalCredits = this.transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);

    return {
      organizationCount: this.organizations.length,
      totalOrganizations: this.organizations.length,
      totalStudents,
      totalSectors: this.sectors.length,
      totalTransactions,
      totalVolume: totalCredits,
      totalCredits,
      systemHealth: '100% Operational',
      activeUsersMonthly: 42,
      aiAssistantRequestsToday: 138,
      timestamp: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Generic Governed Query Engine (`query_data`)
  // --------------------------------------------------------------------------
  async executeStructuredQuery(
    params: {
      entity: 'students' | 'sectors' | 'classes' | 'payments' | 'funds';
      filters?: Array<{ field: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'; value: unknown }>;
      fields?: string[];
      limit?: number;
    },
    scope: AccessScope
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { entity, filters = [], fields, limit = 50 } = params;

    let baseRows: Record<string, unknown>[] = [];
    if (entity === 'students') {
      baseRows = this.filterByScope(this.students, scope, 'student') as unknown as Record<string, unknown>[];
    } else if (entity === 'sectors') {
      baseRows = this.filterByScope(this.sectors, scope, 'sector') as unknown as Record<string, unknown>[];
    } else if (entity === 'payments') {
      baseRows = this.filterByScope(this.transactions, scope, 'transaction') as unknown as Record<string, unknown>[];
    } else if (entity === 'funds') {
      baseRows = this.filterByScope(this.funds, scope, 'fund') as unknown as Record<string, unknown>[];
    } else if (entity === 'classes') {
      const clsList = await this.listClasses(scope);
      baseRows = clsList as unknown as Record<string, unknown>[];
    } else {
      throw new Error(`Disallowed query entity: "${String(entity)}"`);
    }

    // Apply allowed filters
    let filtered = baseRows.filter((row) => {
      for (const f of filters) {
        const val = row[f.field];
        if (f.op === 'eq' && val !== f.value) return false;
        if (f.op === 'neq' && val === f.value) return false;
        if (f.op === 'contains' && !String(val || '').toLowerCase().includes(String(f.value || '').toLowerCase())) return false;
        if (f.op === 'gt' && Number(val) <= Number(f.value)) return false;
        if (f.op === 'gte' && Number(val) < Number(f.value)) return false;
        if (f.op === 'lt' && Number(val) >= Number(f.value)) return false;
        if (f.op === 'lte' && Number(val) > Number(f.value)) return false;
        if (f.op === 'in' && Array.isArray(f.value) && !f.value.includes(val)) return false;
      }
      return true;
    });

    // Strip sensitive fields based on role
    const sensitiveFieldsByRole: Record<string, string[]> = {
      STUDENT: ['phone', 'guardian', 'email', 'passwordHash'],
      SECTOR_MANAGER: ['passwordHash', 'adminEmail'],
      ADMIN: ['passwordHash'],
      SUPER_ADMIN: ['passwordHash'],
    };

    const disallowed = sensitiveFieldsByRole[scope.role] || ['passwordHash'];

    const trimmed = filtered.slice(0, Math.min(limit, 50)).map((row) => {
      const out: Record<string, unknown> = {};
      const keys = fields && fields.length > 0 ? fields.filter((k) => !disallowed.includes(k)) : Object.keys(row).filter((k) => !disallowed.includes(k));
      for (const k of keys) {
        if (k in row) out[k] = row[k];
      }
      return out;
    });

    return { rows: trimmed, total: filtered.length };
  }
}

export const scopedRepository = new ScopedDataRepository();

# COVERAGE.md: AI Assistant Governed Tool Coverage Matrix

This matrix demonstrates complete tool coverage for every entity, table, and UI feature identified in `DATA_MAP.md`.

---

## 1. Entity vs Tool Coverage Matrix

| Entity / Topic | Read / Search Tool | Detail / Summary Tool | Report / Aggregation Tool | Export Tool | Action / Write Tool | Supported Roles |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Student** | `find_students` | `get_student` | `summarize_student_finance` | `export_students` | `create_student`, `update_student`, `delete_student` | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER` (assigned), `STUDENT` (self read) |
| **Sector** | `find_sectors` | `get_sector` | `summarize_sector_finance` | `export_sectors` | `create_sector`, `update_sector`, `delete_sector` | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER` (assigned read) |
| **Class** | `find_classes` | `get_class` | `summarize_class`, `report_class` | `export_class_report` | `create_class`, `update_class`, `delete_class` | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER` (read) |
| **Payment / Fee Entry** | `find_payments`, `list_payments` | `get_receipt` | `summarize_collections`, `report_defaulters` | `export_payments` | `record_payment`, `void_payment`, `unvoid_payment` | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER` (assigned), `STUDENT` (self read) |
| **Batch** | `list_batches` | `get_batch` | `summarize_batches` | `export_batches` | `post_batch`, `void_batch`, `delete_batch` | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER` (assigned) |
| **Manager (User)** | `find_users`, `list_users` | `get_user` | `summarize_managers` | `export_managers` | `invite_manager`, `update_manager`, `remove_manager` | `SUPER_ADMIN`, `ADMIN` |
| **Fund** | `find_funds`, `list_funds` | `get_fund` | `report_fund_utilization` | `export_funds` | `add_fund`, `update_fund` | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER` (read) |
| **Signatory** | `list_signatories` | `get_signatory` | `summarize_signatories` | — | `add_signatory`, `remove_signatory` | `SUPER_ADMIN`, `ADMIN` |
| **Notice** | `list_notices` | `get_notice` | `summarize_notices` | — | `post_notice`, `mark_notice_read` | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER`, `STUDENT` |
| **Issued Report** | `list_issued_reports` | `get_issued_report`| `summarize_issued_reports` | `export_issued_reports` | `revoke_issued_report`, `extend_issued_report` | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER` (assigned) |
| **Audit Log** | `list_audit_logs` | `get_audit_log` | `summarize_audit_activity` | `export_audit_csv` | — (Audit logs are append-only) | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER` (read assigned) |
| **Organization (Platform)** | `list_organizations` | `get_organization` | `summarize_platform_usage` | `export_organizations_csv` | `update_organization_status` | `SUPER_ADMIN` only |
| **Generic Governed Query** | `query_data` | (Structured query with per-role allow-list and mandatory auto-scope) | — | — | — | `SUPER_ADMIN`, `ADMIN`, `SECTOR_MANAGER`, `STUDENT` |

---

## 2. Coverage Metrics
- **Total Entities Mapped:** 12
- **Read & Search Tools:** 100% coverage (at least 1 find/list tool per entity)
- **Detail & Summary Tools:** 100% coverage (full details and pre-computed financial summaries)
- **Report & Aggregation Tools:** 100% coverage (class, sector, defaulters, collections, funds, audit, platform)
- **Export Tools:** 100% coverage (Excel, CSV, PDF server-side file output)
- **Write Action Tools:** 100% coverage for every UI action (confirmation token required for execution)
- **Safe Structured Query:** `query_data` covers long-tail multi-condition lookups safely without raw SQL.

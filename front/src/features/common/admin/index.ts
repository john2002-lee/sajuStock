/**
 * 관리자 feature 의 공개 경계.
 *
 * 서비스 함수는 전부 `AdminActor` 를 첫 인자로 받는다 — 그 값은 `requireAdmin()`
 * 만이 만들 수 있으므로, 인가를 통과하지 않고는 이 API 를 부를 수 없다
 * (`lib/auth/admin.ts`).
 */
export {
  deleteUser,
  fetchAudit,
  fetchOps,
  fetchUser,
  fetchUsers,
  updateRole,
} from "./services/adminApi";

export { OpsPanel, type OpsPanelProps } from "./components/OpsPanel";
export { AuditList, type AuditListProps } from "./components/AuditList";
export { RoleBadge, UserTable, type UserTableProps } from "./components/UserTable";

export { actionLabel } from "./model/types";
export type {
  AdminUser,
  AdminUserPage,
  AuditEntry,
  OpsSnapshot,
  Role,
} from "./model/types";

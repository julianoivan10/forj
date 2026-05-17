import { relations } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Append-only audit log for sensitive admin actions — designed for
 * actions that could enable account takeover if abused.
 *
 * Captured today:
 *   - relink_user — admin bound a new privyId to an existing user row
 *     (emergency recovery, see docs/design/emergency-recovery.md §2c)
 *
 * Future actions to log here when added:
 *   - restore_user (un-delete a soft-deleted account)
 *   - force_role (override a role gate)
 *   - dispute_force_resolve
 *
 * Reads of this table are admin-only — surfacing it to other users
 * would itself be a privacy leak (admin identities, target user
 * patterns).
 *
 * Retention: keep forever for now. GDPR right-to-erasure may force
 * us to anonymise admin identities in old rows eventually; revisit
 * after counsel review.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    reason: text('reason').notNull(),
    // Free-form before/after snapshot. Schema is `{ before: {...}, after: {...} }`
    // by convention; not enforced at the type system because action types
    // vary. Always non-null so a NULL means "we forgot to log details" =
    // bug, not "nothing happened".
    details: jsonb('details').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Hot lookup: "show me every admin action by this admin"
    index('admin_audit_admin_idx').on(table.adminUserId, table.createdAt),
    // "Show me every admin action that touched this user" — used by
    // support when investigating a user complaint or reviewing prior
    // recovery attempts.
    index('admin_audit_target_idx').on(table.targetUserId, table.createdAt),
    // Filter-by-action for ops dashboards.
    index('admin_audit_action_idx').on(table.action, table.createdAt),
  ],
);

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  admin: one(users, {
    fields: [adminAuditLog.adminUserId],
    references: [users.id],
    relationName: 'adminAuditAsAdmin',
  }),
  target: one(users, {
    fields: [adminAuditLog.targetUserId],
    references: [users.id],
    relationName: 'adminAuditAsTarget',
  }),
}));

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLog.$inferInsert;

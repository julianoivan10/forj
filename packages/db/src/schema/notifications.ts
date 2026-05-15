import { relations } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { notificationTypeEnum } from './enums';
import { users } from './users';

/**
 * In-app notifications. One row per delivery — we fan out on write rather
 * than joining against other tables at read time so the inbox query stays flat
 * and cheap.
 *
 * `entityId` + `entityType` point at the thing the notification is ABOUT (a
 * proposal, a job, a conversation, a contract). We store it as a loose pair
 * instead of N nullable FK columns so adding a new notification type later
 * doesn't require a schema migration.
 *
 * `metadata` is a small JSONB bag for UI rendering data the reader shouldn't
 * need to re-fetch (e.g. the sender's display name for a "new message" toast).
 * Keep it under ~500 bytes; anything heavier should live in a related table.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Recipient. We cascade-delete so a removed user doesn't leave orphans.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    // The actor that caused the notification (client accepting a proposal,
    // freelancer sending a message, etc). Nullable for system-generated events.
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    // Loose reference to the entity this notification is about.
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    // Deep-link target inside the app (e.g. /dashboard/proposals/<id>).
    actionUrl: text('action_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Primary inbox query: "my notifications, newest first".
    index('notifications_user_created_idx').on(table.userId, table.createdAt),
    // Unread-count query.
    index('notifications_user_read_idx').on(table.userId, table.isRead),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: 'notifications',
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'triggeredNotifications',
  }),
}));

export const insertNotificationSchema = createInsertSchema(notifications);
export const selectNotificationSchema = createSelectSchema(notifications);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

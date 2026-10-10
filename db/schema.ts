import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const blocks = sqliteTable('blocks', { id:text('id').primaryKey(),value:text('value').notNull(),version:integer('version').notNull().default(1),author:text('author').notNull() });
export const presence = sqliteTable('presence', { id:text('id').primaryKey(), name:text('name').notNull(), seen:integer('seen').notNull() });

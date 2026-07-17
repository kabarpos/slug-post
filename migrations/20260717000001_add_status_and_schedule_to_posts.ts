import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema.table("posts", (table) => {
    table.string("status", 20).defaultTo("published").index();
    table.timestamp("scheduled_at").nullable();
    table.timestamp("expires_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.table("posts", (table) => {
    table.dropColumn("status");
    table.dropColumn("scheduled_at");
    table.dropColumn("expires_at");
  });
}

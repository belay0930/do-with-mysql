/**
 * @param {import('knex')} knex
 */
export const up = async (knex) => {
  // Create users table
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.string('password').notNullable();
    table.enum('role', ['admin', 'user']).defaultTo('user');
    table.timestamps(true, true); // created_at and updated_at
  });

  // Create documents table
  await knex.schema.createTable('documents', (table) => {
    table.increments('id').primary();
    table.string('title').notNullable();
    table.string('filename').notNullable();
    table.string('file_type').notNullable();
    table.string('path').notNullable();
    table.string('key').notNullable().unique();
    table.integer('size').notNullable();
    table.integer('owner_id').unsigned().notNullable();
    table.foreign('owner_id').references('id').inTable('users').onDelete('CASCADE');
    table.timestamps(true, true); // created_at and updated_at
  });
};

/**
 * @param {import('knex')} knex
 */
export const down = async (knex) => {
  // Drop documents table first due to foreign key dependency
  await knex.schema.dropTableIfExists('documents');
  // Drop users table
  await knex.schema.dropTableIfExists('users');
};

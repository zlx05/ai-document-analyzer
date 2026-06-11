import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

const schemaPath = new URL('../schema.sql', import.meta.url);
const schema = await readFile(schemaPath, 'utf8');

let connection;

try {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  await connection.query(schema);
  console.log('Database and tables are ready.');
} catch (error) {
  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('MySQL refused this username/password.');
    console.error(`Tried user: ${process.env.DB_USER || '(empty)'}`);
    console.error(`Tried host: ${process.env.DB_HOST || '127.0.0.1'}`);
    console.error('Please copy the same username and password that work in DBeaver into .env.');
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  if (connection) {
    await connection.end();
  }
}

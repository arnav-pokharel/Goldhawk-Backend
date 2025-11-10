// db/transaction.js
const pool = require("./pool");

const beginTransaction = async () => {
  const client = await pool.connect();
  await client.query('BEGIN');
  return client;
};

const commitTransaction = async (client) => {
  await client.query('COMMIT');
  client.release();
};

const rollbackTransaction = async (client) => {
  await client.query('ROLLBACK');
  client.release();
};

module.exports = {
  beginTransaction, commitTransaction, rollbackTransaction
};
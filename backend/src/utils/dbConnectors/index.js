const postgresConnector = require('./postgresql.connector');
const mysqlConnector = require('./mysql.connector');
const mongodbConnector = require('./mongodb.connector');
const mssqlConnector = require('./mssql.connector');

/**
 * Get appropriate database connector based on type
 */
const getConnector = (databaseType) => {
  const connectors = {
    postgresql: postgresConnector,
    mysql: mysqlConnector,
    mariadb: mysqlConnector, // MariaDB uses same connector as MySQL
    mongodb: mongodbConnector,
    mssql: mssqlConnector,
  };

  const connector = connectors[databaseType.toLowerCase()];
  if (!connector) {
    throw new Error(`Unsupported database type: ${databaseType}`);
  }

  return connector;
};

module.exports = {
  getConnector,
  postgresConnector,
  mysqlConnector,
  mongodbConnector,
  mssqlConnector,
};

var config = require('app-config');

// AS PER DOCUMENTATION: https://github.com/oracle/node-oracledb/blob/master/examples/dbconfig.js
module.exports = {
    user          : process.env.NODE_ORACLEDB_USER || config.settings.oracleUserId,
    
    // Instead of hard coding the password, consider prompting for it,
    // passing it in an environment variable via process.env, or using
    // External Authentication.
    password      : process.env.NODE_ORACLEDB_PASSWORD || config.settings.oraclePassword,
    
    // For information on connection strings see:
    // https://github.com/oracle/node-oracledb/blob/master/doc/api.md#connectionstrings
    connectString : process.env.NODE_ORACLEDB_CONNECTIONSTRING || config.settings.oracleConnectString,
    
    // Setting externalAuth is optional.  It defaults to false.  See:
    // https://github.com/oracle/node-oracledb/blob/master/doc/api.md#extauth
    externalAuth  : process.env.NODE_ORACLEDB_EXTERNALAUTH ? true : false
};

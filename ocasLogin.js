var request = require('request');
var config = require('app-config');

var ocas = {
  onLogin : function onLogin(cb) {
    request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function(err,response, body) {
      var responseStatus = response ? response.statusCode : null;
      var authToken;
      if (!err && responseStatus != 200) {
        error = {task:"Authentication failed.", error: err, response:response};
      }
      if (!err) {
        var tokenInfo = JSON.parse(body);
        authToken = tokenInfo.token_type + " " + tokenInfo.access_token;
      }
      cb(err, authToken);
    });
  }
};

module.exports = ocas;
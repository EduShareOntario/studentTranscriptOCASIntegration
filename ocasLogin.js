var request = require('request');
var config = require('app-config');

var ocas = {
  onLogin : function onLogin(cb) {
    request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function(error,response, body) {
      var authToken;
      if (!error && response.statusCode != 200) {
        error = new Error("Authentication failed." + JSON.stringify(result));
      }
      if (!error) {
        var tokenInfo = JSON.parse(body);
        authToken = tokenInfo.token_type + " " + tokenInfo.access_token;
      }
      cb(error, authToken);
    });
  },
  makeOcasUrl : function (urlTemplate, ocasRequestId) {
    return urlTemplate + ocasRequestId;
  },
  sendAcknowledgmentToOCAS : function (authToken, ocasRequestId, cb) {
    var httpOptions = {
      url: ocas.makeOcasUrl(config.settings.transcriptAcknowledgmentUrl, ocasRequestId),
      headers: {
        'Authorization': authToken
      }
    };
    request(httpOptions, function (error, response, body) {
      cb(error, response);
    });
  }
};

module.exports = ocas;
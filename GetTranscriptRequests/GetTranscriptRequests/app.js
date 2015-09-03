process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var DDP = require('ddp');
var Job = require('meteor-job');
var config = require('app-config');

console.log('Start Her Up');

// Setup the DDP connection
var ddp = new DDP({
    host: config.settings.ddpHost,
    port: config.settings.ddpPort,
    use_ejson: true
});

var authToken;

request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
        var tokenInfo = JSON.parse(body);
        authToken = tokenInfo.token_type + " " + tokenInfo.access_token;
        
        var options = {
            url: config.settings.requestsNoResponseUrl,
            headers: {
                'Authorization': authToken
            }
        };
        
        function getTranscriptDetails(error, response, body) {
            if (!error && response.statusCode == 200) {
                var info = JSON.parse(body);
                console.log("here we are");
            }
        }
        
        function getTranscriptRequests(error, response, body) {
            if (!error && response.statusCode == 200) {
                var info = JSON.parse(body);
                for (var i = 0; i < info.length; i++) {
                    console.log(info[i].RequestID);
                    
                    //get the details
                    var options2 = {
                        url: config.settings.transcriptRequestUrl + info[i].RequestID,
                        headers: {
                            'Authorization': authToken
                        }
                    };
                    request(options2, getTranscriptDetails);
                }
                             
            }
        }
        
        request(options, getTranscriptRequests);
    } else {
        console.log("Got an error: ", error, ", status code: ", response.statusCode);
    }
});
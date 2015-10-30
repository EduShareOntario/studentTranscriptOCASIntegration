process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var DDP = require('ddp');
var DDPlogin = require('ddp-login');
var Job = require('meteor-job');
var fs = require('fs');
var config = require('app-config');

console.log('Send Transcripts to OCAS');

// Setup the DDP connection
var ddp = new DDP({
    host: config.settings.ddpHost,
    port: config.settings.ddpPort,
    use_ejson: true
});

var docId = 'C20150121073680';
var file_buf = fs.readFileSync('C:\\GitHub\\studentTranscriptOCASIntegration\\200207558.xml', 'ascii');
var authToken;

// Setup the DDP connection
var ddp = new DDP({
    host: config.settings.ddpHost,
    port: config.settings.ddpPort,
    use_ejson: true
});

Job.setDDP(ddp);

// Open the DDP connection
ddp.connect(function (err) {
    if (err) throw err;
    var options = {
        env: 'METEOR_TOKEN',
        method: 'account',
        account: config.settings.ddpUser,  
        pass: config.settings.ddpPassword,     
        retry: 3,       
        plaintext: false
    };
    DDPlogin(ddp, options, ddpLoginCB);
});

function ddpLoginCB(err) {
    if (err)
        //todo what if I can't connect
        throw err;
    
    checkForTranscriptsToSend();
}

function checkForTranscriptsToSend() {
    request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var fbResponse = JSON.parse(body);
            authToken = fbResponse.token_type + " " + fbResponse.access_token;
            
            var options = {
                url: config.settings.sendTranscriptUrl + docId + "/transcripts",
                headers: {
                    'Authorization': authToken
                },
                body: file_buf
            };
            
            function sendTranscript(error, response, body) {
                if (!error && response.statusCode == 200) {
                    var transcriptDetails = JSON.parse(body);
                    console.log("here we are");
                } else {
                    console.log("Got an error: ", error, ", status code: ", response.statusCode);
                }
            }
            
            request.post(options, sendTranscript);

        } else {
            console.log("Got an error: ", error, ", status code: ", response.statusCode);
        }
    });
}


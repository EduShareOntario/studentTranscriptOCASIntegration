process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var DDP = require('ddp');
var DDPlogin = require('ddp-login');
var Job = require('meteor-job');
var config = require('app-config');

console.log('Check and see if OCAS has any transcripts to send us');

var authToken;


// Setup the DDP connection
var ddp = new DDP({
    host: config.settings.ddpHost,
    port: config.settings.ddpPort,
    use_ejson: true
});

Job.setDDP(ddp);

// Open the DDP connection
ddp.connect(function(err) {
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

    checkForTranscripts();

}

function checkForTranscripts() {
    request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var tokenInfo = JSON.parse(body);
            authToken = tokenInfo.token_type + " " + tokenInfo.access_token;
            
            var options = {
                url: config.settings.transcriptsNoResponseUrl,
                headers: {
                    'Authorization': authToken
                }
            };
            
            // get the details of a individual transcript
            // and write to the worker queue
            function getTranscriptDetails(error, response, body) {
                if (!error && response.statusCode == 200) {
                    var transcriptDetails = JSON.parse(body);
                    console.log("write the request details to the worker queue");
                    // Create a job:
                    var job = new Job('student-transcript', 'saveTranscript', // type of job
                    // Job data that you define, including anything the job
                    // needs to complete. May contain links to files, etc...
                    {
                        requestId: transcriptDetails.RequestID,
                        requestDetails: transcriptDetails.PESCXml
                    }
                    );
                    job.priority('normal')
                    .retry({
                        retries: 5,
                        wait: 15 * 60 * 1000
                    })// 15 minutes between attempts 
                    .save();               // Commit it to the server
                }
            }
            
            // get 1 to n transcripts from OCAS
            function getTranscripts(error, response, body) {
                if (!error && response.statusCode == 200) {
                    var transcripts = JSON.parse(body);
                    for (var i = 0; i < transcripts.length; i++) {
                        console.log(transcripts[i].RequestID);
                        
                        //get the details
                        var options2 = {
                            url: config.settings.transcriptDetailUrl + transcripts[i].RequestID,
                            headers: {
                                'Authorization': authToken
                            }
                        };
                        request(options2, getTranscriptDetails);
                    }
                             
                }
            }
            request(options, getTranscripts);
        } else {
            console.log("Got an error: ", error, ", status code: ", response.statusCode);
        };
    });
}




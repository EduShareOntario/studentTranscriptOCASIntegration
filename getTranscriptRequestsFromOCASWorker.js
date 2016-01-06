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

Job.setDDP(ddp);

// Open the DDP connection
ddp.connect(function (err) {
    if (err) throw err;
    var options = {
        username: config.settings.ddpUser,
        pass: config.settings.ddpPassword,     
        ldap: true
    };
    ddp.call("login", [options], ddpLoginCB);   
});

function ddpLoginCB(err) {
    if (err)
        //todo what if I can't connect
        throw err;
    
    Job.processJobs('student-transcript-in', 'getTranscriptRequestsFromOCAS', {pollInterval:1*60*1000, workTimeout: 3*60*1000}, processJob);
}

function processJob(job, cb) {
    console.log("processing job "+job.doc._id+" data:"+JSON.stringify(job.data));
    request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function (error, response, body) {
        if (error || response.statusCode != 200) {
            job.fail({task: "ocasAuthentication", exception: error, data: response})
            cb();
            return;
        }
        var tokenInfo = JSON.parse(body);
        var authToken = tokenInfo.token_type + " " + tokenInfo.access_token;

        var options = {
            url: config.settings.requestsNoResponseUrl,
            headers: {
                'Authorization': authToken
            }
        };

        function getTranscriptDetails(error, response, body) {
            if (!error && response.statusCode == 200) {
                var requestDetails = JSON.parse(body);
                console.log("write the transcript request details to the worker queue " + requestDetails.RequestID);
                // Create a job:
                var job = new Job('student-transcript-out', 'transcriptRequests', // type of job
                // Job data that you define, including anything the job
                // needs to complete. May contain links to files, etc...
                {
                    requestId: requestDetails.RequestID,
                    requestDetails: requestDetails.PESCXml
                }
                );
                job.priority('normal')
                .retry({
                    retries: 5,
                    wait: 15 * 60 * 1000
                })// 15 minutes between attempts
                .save();               // Commit it to
            }
            return;
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
    });
}



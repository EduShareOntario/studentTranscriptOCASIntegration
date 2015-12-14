process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var DDP = require('ddp');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var Fiber = require('fibers');
var Future = require('fibers/future');

console.log('Check and see if OCAS has any transcripts to send us');

var authToken;


// Setup the DDP connection
var ddp = new DDP({
    host: config.settings.ddpHost,
    port: config.settings.ddpPort
});

Job.setDDP(ddp);

// Open the DDP connection
ddp.connect(function(err, wasReconnect) {
    if (err) throw err;
    var options = {
        username: config.settings.ddpUser,
        pass: config.settings.ddpPassword,     
        ldap: true
    };
    ddp.call ("login", [options], ddpLoginCB);
});

function ddpLoginCB(err, res) {
    console.log("ddpLoginCB with "+JSON.stringify(err)+", and "+JSON.stringify(res));
    if (err)
        //todo what if I can't connect
        throw err;

    Job.processJobs('student-transcript-in', 'getTranscriptIdsFromOCAS', {pollInterval:1*60*1000, workTimeout: 3*60*1000}, processJob);
}

function processJob(job, cb) {
    request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function (error, response, body) {
        if (error || response.statusCode != 200) {
            job.fail({task: "ocasAuthentication", exception: error, data: response})
            cb();
            return;
        }
        var tokenInfo = JSON.parse(body);
        authToken = tokenInfo.token_type + " " + tokenInfo.access_token;

        var options = {
            url: config.settings.transcriptsNoResponseUrl,
            headers: {
                'Authorization': authToken
            }
        };

        // get 1 to n transcripts from OCAS
        function createJobsForProcessingTranscriptList(error, response, body) {
            if (!error && response.statusCode == 200) {
                var transcripts = JSON.parse(body);
                //
                Future.task(function() {
                    var errors = [];
                    var jobSaveFutures = [];
                    for (var i = 0; i < transcripts.length; i++) {
                        console.log("processing in-bound transcript requestID: "+transcripts[i].RequestID);
                        //Let's make sure we didn't already process this request.
                        var getTranscriptFromOCASJob = new Job('student-transcript-in', 'getTranscriptFromOCAS', {ocasRequestId: transcripts[i].RequestID});
                        getTranscriptFromOCASJob.priority('normal').retry({retries: Job.forever, wait: 15 * 60 * 1000}); // 15 minutes between attempts
                        var futureJobSave = Future.wrap(getTranscriptFromOCASJob).saveFuture();
                        jobSaveFutures.push(futureJobSave);
                    }
                    // Wait for all the saves to complete.
                    // Errors are thrown!
                    // get() returns result/jobId in our case.
                    var savedJobIds = jobSaveFutures.map(function(saveFuture){
                        try {
                            saveFuture.wait();
                            var jobId = saveFuture.get()
                            return jobId;
                        } catch (err) {
                            errors.push({task: "createJob", exception: err, data: saveFuture});
                        }
                    });
                    if (errors.length > 0) {
                        job.fail({errors:errors});
                    }
                    job.done({savedJobs:savedJobIds});
                    cb();
                }).detach();
            }
        }
        request(options, createJobsForProcessingTranscriptList);
    });
}




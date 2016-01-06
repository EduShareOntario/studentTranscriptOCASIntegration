var https = require('https');
var request = require('request');
var DDP = require('ddp');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var Fiber = require('fibers');
var Future = require('fibers/future');

console.log('Start-up');

// Setup the DDP connection
var ddp = new DDP({
    host: config.settings.ddpHost
    ,port: config.settings.ddpPort
    ,path: config.settings.ddpPath
    //,useSockJs: true
    //,url: 'ws://localhost:3000/transcript/websocket'
    //,url: config.settings.ddpUrl
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

function acquireAuthToken(callback) {
    request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function(error,response, body) {
        var authToken;
        if (!error && response.statusCode != 200) {
            error = new Error("Authentication failed." + JSON.stringify(result));
        }
        if (!error) {
            var tokenInfo = JSON.parse(body);
            authToken = tokenInfo.token_type + " " + tokenInfo.access_token;
        }
        callback(error, authToken);
    });
}

function processJob(job, cb) {
    acquireAuthToken(function(err, authToken){
        if (err) {
            job.fail({task:"ocasAcquireAuthToken", exception:err});
            cb();
            return;
        }
        var options = {
            url: config.settings.transcriptsNoResponseUrl,
            headers: {
                'Authorization': authToken
            }
        };

        /** Map the list of transcript request id's to a set of getTranscriptFromOCAS jobs.
         *
         * @param error OCAS request error
         * @param response OCAS response
         * @param body OCAS response body
         */
        function createJobsForProcessingTranscriptList(error, response, body) {
            if (error) {
                job.fail({task:"getTranscriptIdsFromOCAS", exception:error});
                cb();
                return;
            }
            if (!error && response.statusCode == 200) {
                var transcripts = JSON.parse(body);
                // This task will start saving all the jobs and then wait for them all to complete
                // before deciding on the success/failure.
                Future.task(function () {
                    var errors = [];
                    var jobSaveFutures = [];
                    for (var i = 0; i < transcripts.length; i++) {
                        console.log("processing in-bound transcript requestID: " + transcripts[i].RequestID);
                        //todo: Let's make sure we didn't already process this request.

                        var getTranscriptFromOCASJob = new Job('student-transcript-in', 'getTranscriptFromOCAS', {ocasRequestId: transcripts[i].RequestID});
                        getTranscriptFromOCASJob.priority('normal').retry({
                            retries: Job.forever,
                            wait: 15 * 60 * 1000
                        }); // 15 minutes between attempts
                        var futureJobSave = Future.wrap(getTranscriptFromOCASJob).saveFuture();
                        jobSaveFutures.push(futureJobSave);
                    }
                    // Wait for all the saves to complete.
                    // Errors are thrown!
                    // get() returns result/jobId in our case.
                    var savedJobIds = jobSaveFutures.map(function (saveFuture) {
                        try {
                            saveFuture.wait();
                            var jobId = saveFuture.get()
                            return jobId;
                        } catch (err) {
                            errors.push({task: "createJob", exception: err});
                        }
                    });
                    if (errors.length > 0) {
                        job.fail({errors: errors});
                    } else {
                        job.done({savedJobs: savedJobIds});
                    }
                    cb();
                }).detach();
            }
        }

        request(options, createJobsForProcessingTranscriptList);
    });
}




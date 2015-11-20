process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var DDP = require('ddp');
var DDPlogin = require('ddp-login');
var Job = require('meteor-job');
var config = require('app-config');
var oracledb = require('oracledb');


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
    
    checkForTranscriptsToProcess();
}

function checkForTranscriptsToProcess() {
    console.log("Processing transcripts");
    var workers = Job.processJobs('student-transcript', 'transcriptRequests', 
	  function (job, cb) {
        // This will only be called if a job is obtained from Job.getWork() 
        // Up to four of these worker functions can be outstanding at 
        //	a time based on the concurrency option... 
        //console.log("Obtained Job ID" + job.data);
        console.log("here");
        // Be sure to invoke the callback when this job has been 
        // completed or failed. 
        cb();
	 
    }
    );
}
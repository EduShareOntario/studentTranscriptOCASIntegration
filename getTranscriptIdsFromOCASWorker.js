﻿var config = require('app-config');

var processJobConfig = {
    root : 'student-transcript',
    type : 'getInboundTranscriptRequestIdsFromOCAS',
    options : {pollInterval:1*30*1000, workTimeout: 3*60*1000},
    ocasUrl : config.settings.transcriptsNoResponseUrl
}

var createJobConfig = {
    root : 'student-transcript',
    type : 'getTranscriptDetailsFromOCAS'
}

var worker = require ('./getRequestIdsFromOCAS');
worker.start(processJobConfig, createJobConfig);

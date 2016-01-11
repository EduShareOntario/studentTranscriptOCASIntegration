var DDP = require('ddp');
var Job = require('meteor-job');
var config = require('app-config');
var soap = require("soap");
var fs = require('fs');
var request = require('request');
var ddpLogin = require('./ddpLogin');

var ddp
ddpLogin.onSuccess(function (ddpConnection){
	ddp = ddpConnection;
	Job.setDDP(ddpConnection);
	Job.processJobs(config.settings.jobCollectionName, 'saveTranscript', {pollInterval:5000, workTimeout: 1*60*1000}, processJob);
});

function processJob(job,cb) {
	ddp.call("getTranscript", [job.data.transcriptId], function(err,transcript){
		if(err) {
			console.log(err);
			job.fail({task:"getTranscript", exception:err});
			cb();
		} else {
			sendToDocStore(transcript.pescCollegeTranscriptXML, transcript.applicant, function(err, result) {
				if (err) {
					console.log(err);
					job.fail({task:"sendToDocStore", exception:err});
				} else {
					job.done(result);
				}
				cb();
			});
		}
	});
}

function sendToDocStore(xml_doc, applicant, cb) {

var currentdate = new Date(); 
var datetime = currentdate.getFullYear() + "-"
                + (currentdate.getMonth()+1)  + "-" 
                + currentdate.getDate() + " "  
                + currentdate.getHours() + ":"  
                + currentdate.getMinutes() + ":" 
                + currentdate.getSeconds();

	request.post(config.settings.transcriptToHtmlURL,	{ form: { doc: xml_doc } },	function (error, response, body) {
			if (!error && response.statusCode == 200) {
				// Now that we have the html version of the transcript, write it to the shared filesystem.
				var filename = applicant.studentId + '.html';
				var localFilename = config.settings.localFilePath + filename;
				var appxtenderFilename = config.settings.appxtenderFilePath + filename;
				fs.writeFile(localFilename, body, function (err) {
					if (err) {
						cb(err);
						return;
					}
						
					// Now lets tell AppXtender about the transcript.
					soap.createClient(config.settings.appxtenderURL, {forceSoap12Headers: true}, function(err, client){
						if(err) {
							console.log(err);
							cb(err);
							return;
						}
					 
						//user account that will be used to login to appxtender and create the new document
						var credentials = {userId: config.settings.appxtenderUser, password: config.settings.appxtenderPass, features: 0};
						client.Login( credentials, function(err, loginResponse){
								if(err) {
									cb(err);
									return;
								}	else {
									var sessionTicket = loginResponse.LoginResult;
									soap.createClient(config.settings.appxtenderURL, {forceSoap12Headers: true}, function(err, soapClient){
										if(err) {
											cb(err);
											return;
										}
										var appxtenderDocumentCreationData = {
											dsn: config.settings.appxtenderDSN,
											appid: config.settings.appxtenderAppId,
											filepath: appxtenderFilename,
											filetype: 'FT_HTML'
										}
										var appxtenderIndexData = {
											id: applicant.studentId, //note that id is SPRIDEN ID
											pidm: applicant.pidm,
											document_type: 'STUDENT TRANSCRIPT',
											last_name: applicant.lastName,
											first_name: applicant.firstName,
											ssn: '100000000',
											birth_date: applicant.birthDate.toISOString().slice(0,10).replace(/-/g,""),
											term_code: applicant.termCode,
											routing_status: 'OPEN',
											activity_date: datetime,
											ocas_number: applicant.applicantId
										};
										//create the xml document describing the appxtender collection where the document will be posted to and the source document path and type
										var creationData = "";
										creationData = '<?xml version="1.0" encoding="utf-16"?><ax:AxDocCrtData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
										creationData += 'dsn="' + appxtenderDocumentCreationData.dsn + '" ';
										creationData += 'appid="' + appxtenderDocumentCreationData.appid + '" ';
										creationData += 'filepath="' + appxtenderDocumentCreationData.filepath + '" ';
										creationData += 'ignore_dup_index="true" ignore_dls="true" splitimg="true" subpages="0" filetype="' + appxtenderDocumentCreationData.filetype + '" xmlns:ax="http://www.emc.com/ax" />';

										//populate the values for the document index
										var docIndex = '<?xml version="1.0" encoding="utf-16"?><ax:QueryItem xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="-1" xmlns:ax="http://www.emc.com/ax"><ax:Attributes /><ax:Fields>';
										docIndex += '<ax:Field id="1" value="' + appxtenderIndexData.id + '" isNull="false" />';
										docIndex += '<ax:Field id="2" value="' + appxtenderIndexData.pidm + '" isNull="false" />';
										docIndex += '<ax:Field id="3" value="' + appxtenderIndexData.document_type + '" isNull="false" />';
										docIndex += '<ax:Field id="4" value="' + appxtenderIndexData.last_name + '" isNull="false" />';
										docIndex += '<ax:Field id="5" value="' + appxtenderIndexData.first_name + '" isNull="false" />';
										docIndex += '<ax:Field id="6" value="' + appxtenderIndexData.ssn + '" isNull="false" />';
										docIndex += '<ax:Field id="7" value="' + appxtenderIndexData.birth_date + '" isNull="false" />';
										docIndex += '<ax:Field id="8" value="' + appxtenderIndexData.term_code + '" isNull="false" />';
										docIndex += '<ax:Field id="9" value="' + appxtenderIndexData.routing_status + '" isNull="false" />';
										docIndex += '<ax:Field id="10" value="' + appxtenderIndexData.activity_date + '" isNull="false" />';
										docIndex += '<ax:Field id="11" value="' + appxtenderIndexData.ocas_number + '" isNull="false" />';
										docIndex += '</ax:Fields></ax:QueryItem>';

										var newDocumentPayload = {sessionTicket: sessionTicket, xmlAxDocumentCreationData: creationData, xmlDocIndex: docIndex};
										soapClient.CreateNewDocument( newDocumentPayload, function(err, response){
											if(err) {
												cb(err);
												return;
											}
											console.log('AppXTender Document Success \n ---------------- \n\n ' + response.CreateNewDocumentResult);
											cb(null, response.CreateNewDocumentResult);
										});
									});
								}
						});
					});
				});
			}
		}
	);

}

process.env.NODE_ENV = "dev";

var DDP = require('ddp');
var DDPlogin = require('ddp-login');
var Job = require('meteor-job');
var config = require('app-config');
var soap = require("soap");
var fs = require('fs');
var request = require('request');

var njobs=0;

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
		
    saveTranscripts();
}

function saveTranscripts() {
	var workers = Job.processJobs('student-transcript-in', 'saveTranscript', { concurrency: 4 },
	  function (job, cb) {
		ddp.call("getTranscript", [job.data.transcriptId], function(err,transcript){
		//ddp.call("getTranscript", ["ZXC7fu6CvThj8LLCn"], function(err,transcript){
			if(err) {
				console.log(err);
			}
			else {
				sendToDocStore(transcript.pescCollegeTranscriptXML, transcript.applicant);
			}
		});	 
	}
}

function sendToDocStore(xml_doc, applicant) {

var currentdate = new Date(); 
var datetime = currentdate.getFullYear() + "-"
                + (currentdate.getMonth()+1)  + "-" 
                + currentdate.getDate() + " "  
                + currentdate.getHours() + ":"  
                + currentdate.getMinutes() + ":" 
                + currentdate.getSeconds();

		

	request.post(
		'http://transformdoc.georgiantest.com',
		{ form: { doc: xml_doc } },
		function (error, response, body) {
			if (!error && response.statusCode == 200) {
				//now that we have the html transcript, write out the file to the file share so documentum can access it later when we do the API call
				fs.writeFile('Z:/'+applicant.studentId+'.html', body, function (err) {
					if (err) return console.log(err);
						
					//initiate call to AppXtender API
					soap.createClient(config.settings.appxtenderURL, {forceSoap12Headers: true}, function(err, client){
						if(err) {
							console.log(err);
							return;
						}
					 
						//user account that will be used to login to appxtender and create the new document
						var newData = {userId: config.settings.appxtenderUser, password: config.settings.appxtenderPass, features: 0};

						var appxtender = {
											//these are the creation data variables
											dsn: config.settings.appxtenderDSN,
											appid: config.settings.appxtenderAppId,
											filepath: config.settings.appxtenderFilePath+applicant.studentId+'.html',
											filetype: 'FT_HTML',
											
											//these are the appxtender index variables
											id: applicant.studentId, //note that id is SPRIDEN ID
											pidm: applicant.pidm,
											document_type: 'STUDENT TRANSCRIPT',
											last_name: applicant.lastName,
											first_name: applicant.firstName,
											ssn: '100000000',
											birth_date: new Date(applicant.birthDate).toISOString().slice(0,10).replace(/-/g,""),
											term_code: applicant.termCode,
											routing_status: 'OPEN',
											activity_date: datetime,
											ocas_number: applicant.applicantId
							};
						
						client.Login( newData, function(err, response){

					   
								if(err) {
									console.log(err);
									return;
								}
								
								else {
									var sessionTicket = response.LoginResult;

									soap.createClient(config.settings.appxtenderURL, {forceSoap12Headers: true}, function(err, client){
										if(err) {
											console.log(err);
											return;
										}
										
										//create the xml document describing the appxtender collection where the document will be posted to and the source document path and type
										var creationData = "";
										creationData = '<?xml version="1.0" encoding="utf-16"?><ax:AxDocCrtData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
										creationData += 'dsn="' + appxtender.dsn + '" ';
										creationData += 'appid="' + appxtender.appid + '" ';
										creationData += 'filepath="' + appxtender.filepath + '" ';
										creationData += 'ignore_dup_index="true" ignore_dls="true" splitimg="true" subpages="0" filetype="' + appxtender.filetype + '" xmlns:ax="http://www.emc.com/ax" />';

										//populate the values for the document index
										var docIndex = '<?xml version="1.0" encoding="utf-16"?><ax:QueryItem xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="-1" xmlns:ax="http://www.emc.com/ax"><ax:Attributes /><ax:Fields>';
										docIndex += '<ax:Field id="1" value="' + appxtender.id + '" isNull="false" />';
										docIndex += '<ax:Field id="2" value="' + appxtender.pidm + '" isNull="false" />';
										docIndex += '<ax:Field id="3" value="' + appxtender.document_type + '" isNull="false" />';
										docIndex += '<ax:Field id="4" value="' + appxtender.last_name + '" isNull="false" />';
										docIndex += '<ax:Field id="5" value="' + appxtender.first_name + '" isNull="false" />';
										docIndex += '<ax:Field id="6" value="' + appxtender.ssn + '" isNull="false" />';
										docIndex += '<ax:Field id="7" value="' + appxtender.birth_date + '" isNull="false" />';
										docIndex += '<ax:Field id="8" value="' + appxtender.term_code + '" isNull="false" />';
										docIndex += '<ax:Field id="9" value="' + appxtender.routing_status + '" isNull="false" />';
										docIndex += '<ax:Field id="10" value="' + appxtender.activity_date + '" isNull="false" />';
										docIndex += '<ax:Field id="11" value="' + appxtender.ocas_number + '" isNull="false" />';
										docIndex += '</ax:Fields></ax:QueryItem>';
										
										client.CreateNewDocument( {sessionTicket: sessionTicket, xmlAxDocumentCreationData: creationData, xmlDocIndex: docIndex}, function(err, response){
											if(err) {
												console.log(err);
												return;
											}
											console.log('AppXTender Document Success \n ---------------- \n\n ' + response.CreateNewDocumentResult);
											process.exit();
										});
									});
									
								}
						});

					});
					//end call to AppXtender API
				});
			}
		}
	);

}

# studentTranscriptOCASIntegration
A node.js implementation of student transcript exchange activities with the Ontario College Application Service.

## Components
This project includes a set of closely related components that automate the transcript exchange responsibilites of an education institution.  Each of the following use cases include zero or more student transcript work items.
 - Retrieve 'transcript request' from OCAS. 
 - Retrieve 'transcript' from OCAS.
 - Send 'transcript' to OCAS.
  
### Get Transcript Requests from OCAS - Scheduled Worker
This component periodically:
- contacts the OCAS web service and gets any outstanding 'transcript requests'
- creates a chain of tasks/jobs to process each.
- sends an acknowledgment to OCAS indicating that we have successfully retrieved the requests.

The chain of tasks/jobs will:
  - validate the request
  - produce the transcript
  - ????? Should we... index and store the transcript in our student document management system (BDM/documentum)
  - send the transcript to OCAS  

See [Resiliency](#Resiliency).

#### Schedule
TBD

#### Runtime
Initially a single node process managed as a windows 'service' (eg. OCAS Get Transcript Requests) that starts automatically.

### Get Transcript from OCAS - Scheduled Worker
This component periodically:
- contacts the OCAS web service and gets any outstanding 'transcripts'
- creates a chain of tasks/jobs to process each
  - It does not implement the actual task/job logic but merely establishes the work process/chain and lets the specific 'worker' do the actual work.
- sends an acknowledgment to OCAS indicating that we have successfully retrieved the transcripts.
 
The chain of tasks/jobs will:
  - identify/match the 'transcript' document to a known student
  - index and store the transcript in our student document management system (BDM/documentum).
  - create a manual task/job to 'articulate' the transcript if necessary.

See [Resiliency](#Resiliency).

#### Schedule
TBD

#### Runtime
Initially a single node process managed as a windows 'service' (eg. OCAS Get Transcripts) that starts automatically.

### Send Transcript to OCAS - On Demand Worker
This component is responsible for sending the transcripts to OCAS.  It continually :
- looks for 'Send Transcript Jobs'
- contacts the OCAS web service and 
- sends the student transcript.

See [Resiliency](#Resiliency).

#### Runtime
Initially a single node process managed as a windows 'service' (eg. OCAS Send Transcript) that starts automatically.

### Resiliency
Each task/job is responsible for completion including recovering from intermitment system failures without requiring human intervention. 
- Each job will retry a configurable number of times with configurable delay between retries.
- Upon max retries a job will fail
- Failed jobs will be resolved manually. TBD.

### Monitoring
TBD

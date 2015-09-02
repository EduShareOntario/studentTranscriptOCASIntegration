# studentTranscriptOCASIntegration
A node.js implementation of student transcript exchange activities with the Ontario College Application Service.

## Components
This project includes a set of closely related components that fullfil a subset of the total transcript exchange responsibilites of an education institution.  Each of the following use case may include zero or more student transcript work items.
 - Retrieve 'transcript request' from OCAS. 
 - Retrieve 'transcript' from OCAS.
 - Send 'transcript' to OCAS.
  
### Get Transcript Requests from OCAS
This component periodically contacts the OCAS web service and gets any outstanding 'transcript requests' and creates a chain of tasks/jobs to process each.  See [Resiliency](#Resiliency).

The chain of tasks/jobs will:
  - validate the request
  - produce the transcript and 
  - send the transcript to OCAS  

#### Runtime
Single process.  Expected low load.

### Get Transcript from OCAS
This component periodically contacts the OCAS web service and gets any outstanding 'transcripts' and creates a chain of tasks/jobs to process each. It does not implement the actual task/job logic but merely establishes the work process/chain and lets the specific 'worker' do the actual work.

The chain of tasks/jobs will:
  - identify/match the 'transcript' document to a known student
  - index and store the transcript in our student document management system (BDM/documentum).
  - create a manual task/job to 'articulate' the transcript if necessary.

See [Resiliency](#Resiliency).

### Resiliency
Each task/job is responsible for completion including recovering from intermitment system failures without requiring human intervention. 
- Each job will retry a configurable number of times with configurable delay between retries.
- Upon max retries a job will fail
- Failed jobs will be resolved manually. TBD.

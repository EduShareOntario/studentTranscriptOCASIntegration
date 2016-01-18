db.getCollection('student-transcript.jobs').aggregate(
[
{
    $group: {
        _id : { "type": "$type", "status": "$status" },
        "count" : { "$sum": 1 }
    }
},
{ "$sort": { "_id.type" : 1 } }
]
)

db.getCollection('student-transcript.jobs').find(
{ "type" : {$regex: /.*TranscriptRequestIds.*/}, "status" : {$in: ["waiting","running", "ready" ]}}
)

db.getCollection('student-transcript.jobs').find(
{ "type" : "getInboundTranscriptRequestIdsFromOCAS", "status" : {$in: ["waiting","running", "ready" ]}}
)
var futureDate = new Date(new Date().getTime()+(3*24*60*60000));
db.getCollection('student-transcript.jobs').update({"type": "getInboundTranscriptRequestIdsFromOCAS", status: {$in:['running','waiting', 'ready']}}, {$set: {status: "waiting", after: ISODate(), expiresAfter: futureDate, retryWait: 1000}})

db.getCollection('student-transcript.jobs').find(
{ "type" : "saveTranscript", "status" : {$in: ["waiting","running", "ready", "completed" ]}}
).sort({updated:-1})


db.getCollection('student-transcript.jobs').find(
{ "type" : {$regex: /transcriptRequests/}, "status" : {$in: ["waiting","running", "ready" ]}}
)

db.getCollection('student-transcript.jobs').find(
{ "type" : {$regex: /transcriptRequests/}}
)

db.getCollection('transcript').find(
{ "_id" : "AMQ6SkqRPFZxwJhgP"}
)

db.getCollection('student-transcript.jobs').find({
  updated: {$gte: ISODate("2016-07-11:00:00:00.000Z")},
  "log.level": 'danger'
})

db.getCollection('student-transcript.jobs').find({status: 'waiting'})

db.getCollection('student-transcript.jobs').find({_id: 'ghq6bXLMiRfPnqitE'})

db.getCollection('student-transcript.jobs').find({_id: 'Rx2A2qfYwNjTtoRcq'})

//find jobs for given OCAS request ids
ocasRequestIds= ["2016092701015"]
db.getCollection('student-transcript.jobs').find({ 
    $or: [
    {"data.ocasRequestId": {$in:ocasRequestIds}},
    {"data.requestId": {$in:ocasRequestIds}},
    {"ocasRequestId": {$in:ocasRequestIds}},
    ]
})

cJobStatsByMatch({created: {$gte: daysAgo(10) }})
cJobStatsByMatch({updated: {$gte: daysAgo(10) }})

cJobStatsByMatch( { $or : [ {created: {$gte: daysAgo(10) }}, {updated: {$gte: daysAgo(10) }}] })
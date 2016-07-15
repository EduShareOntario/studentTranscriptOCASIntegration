db.getCollection('student-transcript.jobs').find({
  updated: {$gte: ISODate("2016-07-11:00:00:00.000Z")},
  "log.level": 'danger'
})

db.getCollection('student-transcript.jobs').find({status: 'waiting'})

db.getCollection('student-transcript.jobs').find({_id: 'ghq6bXLMiRfPnqitE'})

db.getCollection('student-transcript.jobs').find({_id: 'Rx2A2qfYwNjTtoRcq'})
db.getCollection('student-transcript.jobs').aggregate(    [        {            $group: {                _id : { "type": "$type", "status": "$status" },                "count" : { "$sum": 1 }            }        },        { "$sort": { "_id.type" : 1 } }    ])
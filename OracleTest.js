process.env.NODE_ENV = "dev";

var oracledb = require('oracledb');
var dateFormat = require('dateformat');

oracledb.getConnection(
    {
        user          : "georgian",
        password      : "BANNER8",
        connectString : "testrac01-vip.admin.georgianc.on.ca/GSB4"
    },
  function (err, connection) {
        if (err) {
            console.error(err.message);
            return;
        }
        var now = new Date();
        var date = new Date(2013, 11, 24, 18, 0, 1);
      var bindvars = {
          // Bind type is determined from the data.  Default direction is BIND_IN
              pTrackingId: 'C99999999999999',
              pTransDate: date,
              pPurposeCode: '13',
              pActionCode: 'R2',
              pStateInd: 'C',
              pCompletionInd: '130',
              pDataOrigin: 'TOAD',
              pUserId: 'MWESTBROOKE',
                pBirthDate: null,
                pDateInd: null,
                pExitDate: null,
                pFirstMiddleName: null,
                pFirstName: null,
                pFormerSurName: null,
                pGender: null,
                pHoldInd: null,
                pStudentId: null,
                pMatchInd: null,
                pOcasNum: null,
                pPrefix: null,
                pReasonCode: null,
                pSecondMiddleName: null,
                pSendDate: null,
                pSeqNo: null,
                pSin: null,
                pStudentNo1: null,
                pStudentNo2: null,
                pStudentNo3: null,
                pSurname: null,
              pSurrogateId: { type: oracledb.NUMBER, dir: oracledb.out}
        };
        


       // match_student_info
        connection.execute(
            "BEGIN georgian.svptreq_pkg.match_student_info(:p_svrtreq_bgn02, :p_svrtreq_birth_date,:p_svrtreq_sex,:p_svrtreq_ssn,:p_svrtreq_last_name,:p_svrtreq_first_name,:p_svrtreq_state_ind,:p_svrtreq_match_ind,:p_spriden_pidm,:p_svrtreq_id ); END;",
            {
                // bind variables
                p_svrtreq_bgn02: 'C20150715585395',
                p_svrtreq_birth_date: now,
                p_svrtreq_sex: 'F',
                p_svrtreq_ssn: '999999999',
                p_svrtreq_last_name: 'Shabbir',
                p_svrtreq_first_name: 'Ihtasham',	
                p_svrtreq_state_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                p_svrtreq_match_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                p_spriden_pidm: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
                p_svrtreq_id : { dir: oracledb.BIND_OUT, type: oracledb.STRING }	
            },	
    //    connection.execute(
    //        "insert into saturn.svrtreq (svrtreq_bgn02,svrtreq_trans_date,svrtreq_purpose_cde, svrtreq_action_cde, svrtreq_state_ind, svrtreq_completion_ind, svrtreq_data_origin, svrtreq_user_id,svrtreq_activity_date) values (:svrtreq_bgn02,:svrtreq_trans_date,:svrtreq_purpose_cde, :svrtreq_action_cde, :svrtreq_state_ind, :svrtreq_completion_ind, :svrtreq_data_origin, :svrtreq_user_id,:svrtreq_activity_date)",
		  //['C99999999999999', date, '13', 'R2', 'C', '130', 'testapp', 'mwestbrooke', now],
		  //{ autoCommit: true }, 
        //connection.execute(
        //    "BEGIN georgian.XmlTranscripts.AddSvrtreq(:pTrackingId, :pTransDate, :pPurposeCode, :pActionCode, :pStateInd, :pCompletionInd, :pDataOrigin, :pUserId, :pSurrogateId); END;",
        //    {
        //        // bind variables
        //        pTrackingId: 'C99999999999999',
        //        pTransDate: date,
        //        pPurposeCode: '13',
        //        pActionCode: 'R2',
        //        pStateInd: 'C',
        //        pCompletionInd: '130',
        //        pDataOrigin: 'toad',
        //        pUserId: 'MWESTBROOKE',
        //        pBirthDate: '' ,
        //        pDateInd: '',
        //        pExitDate: '',
        //        pFirstMiddleName: '',
        //        pFirstName: '',
        //        pFormerSurName: '',
        //        pGender: '',
        //        pHoldInd: '',
        //        pStudentId: '',
        //        pMatchInd: '',
        //        pOcasNum: '',
        //        pPrefix: '',
        //        pReasonCode: '',
        //        pSecondMiddleName: '',
        //        pSendDate: '',
        //        pSeqNo: '',
        //        pSin: '',
        //        pStudentNo1: '',
        //        pStudentNo2: '',
        //        pStudentNo3: '',
        //        pSurname: '',
        //        pSurrogateId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        //    },
            //"BEGIN georgian.XmlTranscripts.AddSvrtreq(:pTrackingId, :pTransDate, :pPurposeCode, :pActionCode, :pStateInd, :pCompletionInd, :pDataOrigin, :pUserId, :pSurrogateId ); END;",
            //bindvars,
      function (err, result) {
                if (err) {
                    console.error(err.message);
                    doRelease(connection);
                    return;
                }
                console.log(result.metaData);
                console.log(result.rows);
                doRelease(connection);
            });
    });

function doRelease(connection) {
    connection.release(
        function (err) {
            if (err) {
                console.error(err.message);
            }
        });
}


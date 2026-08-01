export const serviceParameters = {
  "examArrangement": {
    "listCohorts": [
      "schoolId"
    ],
    "getContext": [
      "schoolId",
      "cohortKey"
    ],
    "listArrangements": [
      "schoolId",
      "cohortKey"
    ],
    "saveArrangement": [
      "schoolId",
      "teacherId",
      "input"
    ],
    "deleteArrangement": [
      "arrangementId"
    ]
  },
  "donation": {
    "listDonations": [
      "teacherId"
    ],
    "listTeacherDonations": [
      "teacherId"
    ],
    "getDonorStatus": [
      "teacherId"
    ],
    "getCatalogTrees": [
      "teacherId"
    ],
    "checkDonation": [
      "teacherId",
      "schoolId",
      "items"
    ],
    "donateResources": [
      "teacherId",
      "schoolId",
      "items",
      "decisions"
    ],
    "checkSaveAsOwnResource": [
      "donationId",
      "teacherId",
      "schoolId"
    ],
    "saveAsOwnResource": [
      "donationId",
      "teacherId",
      "schoolId",
      "decision"
    ],
    "updateDonation": [
      "donationId",
      "teacherId",
      "patch"
    ],
    "listAttributeOptions": [],
    "updateAttributeOptions": [
      "teacherId",
      "type",
      "values"
    ]
  },
  "ai": {
    "generateTeachingResources": [
      "kind",
      "keyword",
      "difficulty",
      "count"
    ],
    "getDocument": [
      "docId"
    ],
    "listDocuments": [
      "teacherId"
    ],
    "recognize": [
      "docId"
    ],
    "getRecognitions": [
      "docId"
    ],
    "updateRecognition": [
      "recognitionId",
      "patch"
    ],
    "reRecognize": [
      "recognitionId"
    ],
    "confirmRecognition": [
      "recognitionId",
      "teacherId",
      "schoolId"
    ],
    "confirmAll": [
      "docId",
      "teacherId",
      "schoolId"
    ],
    "rejectRecognition": [
      "recognitionId"
    ],
    "generateKnowledgePoint": [
      "topic",
      "context"
    ],
    "webAnalyzeQuestion": [
      "_stem"
    ]
  },
  "analytics": {
    "listAnswerRecordsByQuestion": [
      "questionId",
      "range"
    ],
    "listAnswerRecordsByStudent": [
      "studentId",
      "range"
    ],
    "listAnswerRecordsByLecture": [
      "lectureId",
      "range"
    ],
    "listAnswerRecordsByStudents": [
      "studentIds",
      "range"
    ],
    "listAllAnswerRecordsByQuestion": [
      "questionId"
    ],
    "saveAnswerRecord": [
      "input"
    ],
    "batchSaveAnswerRecords": [
      "items"
    ],
    "getAnsweredQuestionIds": [
      "studentIds",
      "range"
    ],
    "getQuestionWeaknessScore": [
      "schoolId",
      "studentIds",
      "range"
    ],
    "annotateTreeWithStudentProgress": [
      "tree",
      "studentIds",
      "type",
      "range"
    ],
    "getQuestionStats": [
      "schoolId",
      "range"
    ],
    "getStudentStats": [
      "schoolId",
      "range"
    ],
    "getKnowledgeMastery": [
      "studentIds",
      "schoolId",
      "range"
    ],
    "getSameGradeTypeAverage": [
      "classId",
      "schoolId",
      "range"
    ],
    "getPrevGradeBestClass": [
      "classId",
      "schoolId",
      "range"
    ],
    "getClassAverageMastery": [
      "classId",
      "schoolId",
      "range"
    ],
    "getStudentAnswerDetails": [
      "studentIds",
      "range"
    ]
  },
  "basket": {
    "listBaskets": [
      "teacherId"
    ],
    "getBasket": [
      "id"
    ],
    "getDefaultBasket": [
      "teacherId"
    ],
    "setDefaultBasket": [
      "teacherId",
      "basketId"
    ],
    "createBasket": [
      "teacherId",
      "name",
      "description",
      "isDefault",
      "audience"
    ],
    "updateBasket": [
      "id",
      "patch"
    ],
    "deleteBasket": [
      "id"
    ],
    "addQuestion": [
      "basketId",
      "questionId"
    ],
    "addMaterial": [
      "basketId",
      "materialId"
    ],
    "addQuestionToDefault": [
      "teacherId",
      "questionId"
    ],
    "removeQuestion": [
      "basketId",
      "questionId"
    ],
    "removeMaterial": [
      "basketId",
      "materialId"
    ],
    "moveQuestion": [
      "fromBasketId",
      "toBasketId",
      "questionId"
    ]
  },
  "class": {
    "listClassroomChoices": [],
    "listSchoolClasses": [
      "schoolId"
    ],
    "listPersonalClasses": [
      "teacherId"
    ],
    "listAllClasses": [
      "schoolId",
      "teacherId"
    ],
    "createSchoolClass": [
      "schoolId",
      "teacherId",
      "name",
      "grade",
      "options"
    ],
    "createPersonalClass": [
      "teacherId",
      "name",
      "description"
    ],
    "addStudent": [
      "classId",
      "schoolId",
      "input"
    ],
    "addExternalStudentToPersonalClass": [
      "classId",
      "input"
    ],
    "listStudentsByClass": [
      "classId"
    ],
    "listSuspendedStudents": [
      "schoolIdOrTeacherId",
      "scope"
    ],
    "listStudentsBySchool": [
      "schoolId"
    ],
    "listDepartedStudents": [
      "schoolIdOrTeacherId",
      "scope"
    ],
    "listMyClasses": [
      "schoolId",
      "teacherId"
    ],
    "listMyStudents": [
      "schoolId",
      "teacherId"
    ],
    "listMyClassIds": [
      "schoolId",
      "teacherId"
    ],
    "getClassesByIds": [
      "ids"
    ],
    "addStudentToPersonalClass": [
      "classId",
      "studentId"
    ],
    "removeStudentFromPersonalClass": [
      "classId",
      "studentId"
    ],
    "deleteClass": [
      "classId",
      "isPersonal"
    ],
    "updateSchoolClass": [
      "classId",
      "patch"
    ],
    "getStudent": [
      "studentId"
    ],
    "updateStudent": [
      "studentId",
      "patch"
    ],
    "transferStudent": [
      "studentId",
      "toClassId",
      "options"
    ],
    "suspendStudent": [
      "studentId"
    ],
    "graduateStudent": [
      "studentId"
    ],
    "transferOutStudent": [
      "studentId"
    ],
    "graduateClass": [
      "classId"
    ],
    "resumeStudent": [
      "studentId",
      "toClassId"
    ]
  },
  "grade": {
    "getQueryData": [
      "teacher"
    ],
    "listCohorts": [
      "schoolId"
    ],
    "getImportContext": [
      "schoolId",
      "cohortKey"
    ],
    "getCohortTemplateProfile": [
      "schoolId",
      "cohortKey"
    ],
    "saveCohortTemplateProfile": [
      "schoolId",
      "cohortKey",
      "teacherId",
      "subjectsInput",
      "templates"
    ],
    "getCohortSettings": [
      "schoolId",
      "cohortKey"
    ],
    "saveCohortSettings": [
      "schoolId",
      "teacherId",
      "cohortKey",
      "subjects",
      "settings"
    ],
    "copyCohortSettings": [
      "schoolId",
      "teacherId",
      "sourceCohortKey",
      "targetCohortKey"
    ],
    "listExams": [
      "schoolId",
      "cohortKey"
    ],
    "getExam": [
      "examId"
    ],
    "importExam": [
      "schoolId",
      "teacherId",
      "input"
    ],
    "updateExamSettings": [
      "examId",
      "settings"
    ],
    "deleteExam": [
      "examId"
    ]
  },
  "courseware": {
    "listCoursewares": [
      "filter"
    ],
    "getCourseware": [
      "id"
    ],
    "createCourseware": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "updateCourseware": [
      "id",
      "patch"
    ],
    "deleteCourseware": [
      "id"
    ],
    "duplicateCourseware": [
      "sourceId",
      "newTitle"
    ]
  },
  "examPaper": {
    "listPapers": [
      "filter"
    ],
    "getPaper": [
      "id"
    ],
    "createPaper": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "updatePaper": [
      "id",
      "patch"
    ],
    "deletePaper": [
      "id"
    ],
    "duplicatePaper": [
      "sourceId",
      "newTitle"
    ],
    "extractToQuestionBank": [
      "paperId"
    ],
    "createExtractCopy": [
      "sourceId",
      "contentBlocks"
    ],
    "getExtractCopy": [
      "sourceId"
    ],
    "convertToLecture": [
      "paperId"
    ]
  },
  "examPublish": {
    "publishExam": [
      "params"
    ],
    "listPublications": [
      "schoolId"
    ],
    "verifyPassword": [
      "publicationId",
      "password"
    ],
    "isUnlocked": [
      "publication"
    ],
    "revokePublication": [
      "publicationId"
    ],
    "checkExpiry": []
  },
  "extract": {
    "confirmExtract": [
      "teacherId",
      "schoolId",
      "items",
      "chapterIds",
      "knowledgePointIds",
      "grade",
      "schoolYear",
      "semester",
      "sourceResourceId"
    ]
  },
  "knowledge": {
    "listChapters": [
      "schoolId"
    ],
    "listKnowledgePoints": [
      "schoolId"
    ],
    "getAliasIds": [
      "knowledgePointId",
      "schoolId"
    ],
    "getChapterTree": [
      "schoolId"
    ],
    "getKnowledgeTree": [
      "schoolId"
    ],
    "addChapter": [
      "schoolId",
      "parentId",
      "name"
    ],
    "addKnowledgePoint": [
      "schoolId",
      "chapterId",
      "parentId",
      "name",
      "questionCount"
    ],
    "getChapterPath": [
      "chapterId"
    ],
    "getKnowledgePath": [
      "knowledgeId"
    ],
    "renameNode": [
      "id",
      "type",
      "newName"
    ],
    "deleteNode": [
      "id",
      "type"
    ],
    "moveNode": [
      "id",
      "type",
      "newParentId"
    ],
    "reorderSiblings": [
      "ids",
      "type"
    ]
  },
  "lecture": {
    "listLectures": [
      "filter"
    ],
    "getLecture": [
      "id"
    ],
    "listColumnTemplates": [
      "teacherId",
      "schoolId"
    ],
    "createColumnTemplate": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "deleteColumnTemplate": [
      "templateId",
      "teacherId"
    ],
    "createLecture": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "updateLecture": [
      "id",
      "patch"
    ],
    "deleteLecture": [
      "id"
    ],
    "duplicateLecture": [
      "sourceId",
      "newTitle"
    ],
    "addQuestionToLecture": [
      "lectureId",
      "questionId",
      "position"
    ],
    "addSectionToLecture": [
      "lectureId",
      "section"
    ],
    "removeSection": [
      "lectureId",
      "sectionId"
    ],
    "reorderSections": [
      "lectureId",
      "sectionIds"
    ],
    "publish": [
      "lectureId"
    ],
    "createExtractCopy": [
      "sourceId",
      "contentBlocks"
    ],
    "getExtractCopy": [
      "sourceId"
    ],
    "convertToExamPaper": [
      "lectureId"
    ]
  },
  "lessonCourseware": {
    "listCoursewares": [
      "filter"
    ],
    "getCourseware": [
      "id"
    ],
    "createCourseware": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "updateCourseware": [
      "id",
      "patch"
    ],
    "deleteCourseware": [
      "id"
    ],
    "publishCourseware": [
      "id"
    ],
    "unpublishCourseware": [
      "id"
    ],
    "createFromExamPaper": [
      "teacherId",
      "schoolId",
      "examPaper"
    ],
    "createFromLecture": [
      "teacherId",
      "schoolId",
      "lecture"
    ],
    "createFromCourseware": [
      "teacherId",
      "schoolId",
      "sourceId"
    ]
  },
  "material": {
    "listMaterials": [
      "filter"
    ],
    "getMaterial": [
      "id"
    ],
    "createMaterial": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "updateMaterial": [
      "id",
      "patch"
    ],
    "deleteMaterial": [
      "id"
    ],
    "checkKnowledgeBlockDuplicate": [
      "title",
      "content",
      "schoolId"
    ]
  },
  "onlineResource": {
    "search": [
      "params"
    ],
    "getResource": [
      "resourceId"
    ],
    "parseResource": [
      "resourceId"
    ],
    "getParsedQuestions": [
      "resourceId"
    ],
    "importQuestions": [
      "resourceId",
      "teacherId",
      "schoolId",
      "selectedQuestionIds"
    ],
    "updateQuestionSelection": [
      "resourceId",
      "questionId",
      "selected"
    ],
    "getHotResources": [
      "limit"
    ]
  },
  "organization": {
    "listSubjectGroups": [
      "schoolId"
    ],
    "getSubjectGroup": [
      "id"
    ],
    "createSubjectGroup": [
      "schoolId",
      "data"
    ],
    "updateSubjectGroup": [
      "id",
      "patch"
    ],
    "deleteSubjectGroup": [
      "id"
    ],
    "addMember": [
      "groupId",
      "teacherId"
    ],
    "removeMember": [
      "groupId",
      "teacherId"
    ],
    "listPrepGroups": [
      "schoolId",
      "subjectGroupId"
    ],
    "getPrepGroup": [
      "id"
    ],
    "createPrepGroup": [
      "schoolId",
      "data"
    ],
    "updatePrepGroup": [
      "id",
      "patch"
    ],
    "deletePrepGroup": [
      "id"
    ],
    "addPrepMember": [
      "groupId",
      "teacherId"
    ],
    "removePrepMember": [
      "groupId",
      "teacherId"
    ],
    "updateTeacherRoles": [
      "teacherId",
      "roles"
    ],
    "listTeachers": [
      "schoolId"
    ]
  },
  "prep": {
    "listTasks": [
      "schoolId",
      "teacherId"
    ],
    "getTask": [
      "taskId"
    ],
    "createTask": [
      "schoolId",
      "subjectGroupId",
      "data",
      "createdBy"
    ],
    "updateTask": [
      "taskId",
      "patch"
    ],
    "deleteTask": [
      "taskId"
    ],
    "addWorkflow": [
      "taskId",
      "data"
    ],
    "updateWorkflow": [
      "taskId",
      "workflowId",
      "patch"
    ],
    "deleteWorkflow": [
      "taskId",
      "workflowId"
    ],
    "assignTask": [
      "taskId",
      "workflowId",
      "teacherIds"
    ],
    "updateAssignment": [
      "taskId",
      "assignmentId",
      "status"
    ],
    "addQuestionReference": [
      "questionId",
      "teacherId",
      "studentIds",
      "sourceTaskId",
      "sourceType"
    ],
    "getQuestionReferences": [
      "teacherId"
    ],
    "getUsedQuestionIds": [
      "teacherId"
    ],
    "checkDuplicateQuestion": [
      "stem",
      "teacherId",
      "excludeQuestionId"
    ],
    "mergeQuestions": [
      "targetQuestionId",
      "sourceQuestionId"
    ]
  },
  "question": {
    "listQuestions": [
      "filter"
    ],
    "getQuestion": [
      "id"
    ],
    "checkDuplicate": [
      "stem",
      "answer",
      "options",
      "schoolId"
    ],
    "findSimilarQuestions": [
      "stem",
      "schoolId",
      "excludeQuestionId"
    ],
    "createQuestion": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "updateQuestion": [
      "id",
      "patch",
      "duplicateDecision"
    ],
    "deleteQuestion": [
      "id"
    ],
    "addRemark": [
      "questionId",
      "content"
    ],
    "updateRemark": [
      "questionId",
      "remarkId",
      "content"
    ],
    "deleteRemark": [
      "questionId",
      "remarkId"
    ],
    "batchImport": [
      "teacherId",
      "schoolId",
      "questions"
    ],
    "incrementUsage": [
      "questionId"
    ]
  },
  "reflection": {
    "listByTarget": [
      "targetId"
    ],
    "listByLesson": [
      "lessonCoursewareId"
    ],
    "listByTeacher": [
      "teacherId"
    ],
    "createReflection": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "updateReflection": [
      "id",
      "patch"
    ],
    "deleteReflection": [
      "id"
    ],
    "copyToTarget": [
      "teacherId",
      "schoolId",
      "fromTargetId",
      "toTargetId",
      "toLessonCoursewareId"
    ]
  },
  "school": {
    "listSchools": [],
    "searchSchools": [
      "keyword"
    ],
    "getSchool": [
      "schoolId"
    ],
    "submitSchoolCreationApplication": [
      "input",
      "teacher"
    ],
    "listMySchoolCreationApplications": [
      "teacher"
    ],
    "listPendingSchoolCreationApplications": [
      "teacher"
    ],
    "reviewSchoolCreationApplication": [
      "applicationId",
      "approved",
      "teacher"
    ]
  },
  "schoolBackup": {
    "createBackup": [
      "input"
    ],
    "listBackups": [
      "schoolId"
    ],
    "getBackup": [
      "id"
    ],
    "getChapterTree": [
      "schoolId"
    ],
    "getKnowledgeTree": [
      "schoolId"
    ],
    "updateBackupProperties": [
      "id",
      "patch",
      "teacher"
    ],
    "deleteBackup": [
      "id",
      "teacher"
    ],
    "autoBackupForResource": [
      "schoolId",
      "fromTeacherId",
      "resourceType",
      "resourceId",
      "targetClassIds",
      "backupReason",
      "targetStudentIds"
    ],
    "saveAsOwnResource": [
      "backupId",
      "teacher"
    ]
  },
  "settings": {
    "listSettings": [
      "schoolId",
      "type"
    ],
    "createSetting": [
      "schoolId",
      "data"
    ],
    "updateSetting": [
      "id",
      "patch"
    ],
    "deleteSetting": [
      "id"
    ],
    "toggleSetting": [
      "id"
    ],
    "batchUpdateSortOrder": [
      "items"
    ],
    "listClassTypes": [
      "schoolId"
    ],
    "createClassType": [
      "schoolId",
      "data"
    ],
    "updateClassType": [
      "id",
      "patch"
    ],
    "deleteClassType": [
      "id"
    ],
    "toggleClassType": [
      "id"
    ],
    "batchUpdateClassTypeSortOrder": [
      "items"
    ],
    "listExamPaperTypes": [
      "schoolId"
    ],
    "createExamPaperType": [
      "schoolId",
      "data"
    ],
    "updateExamPaperType": [
      "id",
      "patch"
    ],
    "deleteExamPaperType": [
      "id"
    ],
    "toggleExamPaperType": [
      "id"
    ],
    "batchUpdateExamPaperTypeSortOrder": [
      "items"
    ],
    "listLectureTypes": [
      "schoolId"
    ],
    "createLectureType": [
      "schoolId",
      "data"
    ],
    "updateLectureType": [
      "id",
      "patch"
    ],
    "deleteLectureType": [
      "id"
    ],
    "toggleLectureType": [
      "id"
    ],
    "batchUpdateLectureTypeSortOrder": [
      "items"
    ]
  },
  "share": {
    "createShare": [
      "params"
    ],
    "getBatchShare": [
      "batchId"
    ],
    "checkDonationCandidates": [
      "teacherId",
      "requests"
    ],
    "donateResources": [
      "teacherId",
      "schoolId",
      "requests"
    ],
    "listPublicDonations": [
      "teacherId"
    ],
    "listDonationStatus": [
      "teacherId"
    ],
    "listDonationContributors": [
      "teacherId"
    ],
    "getDonationPrivileges": [
      "teacherId"
    ],
    "getPlatformDirectoryTree": [
      "type",
      "teacherId"
    ],
    "updateDonationResource": [
      "teacherId",
      "donationId",
      "patch"
    ],
    "listPlatformResourceSettings": [],
    "updatePlatformResourceSettings": [
      "teacherId",
      "settings"
    ],
    "setSubjectModerator": [
      "teacherId",
      "subject",
      "targetTeacherId",
      "enabled"
    ],
    "updateDonationOrder": [
      "teacherId",
      "subject",
      "donationIds"
    ],
    "deleteDonationResource": [
      "teacherId",
      "donationId"
    ],
    "listIncomingShares": [
      "teacherId"
    ],
    "listOutgoingShares": [
      "teacherId"
    ],
    "acceptShare": [
      "shareId",
      "toTeacherId",
      "toSchoolId"
    ],
    "rejectShare": [
      "shareId"
    ],
    "revokeShare": [
      "shareId"
    ]
  },
  "studentInteraction": {
    "listByStudent": [
      "studentId"
    ],
    "listByTeacher": [
      "teacherId"
    ],
    "createInteraction": [
      "teacherId",
      "schoolId",
      "input"
    ],
    "deleteInteraction": [
      "id"
    ]
  }
} as const;

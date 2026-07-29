import { aiService } from "./domain/ai.js";
import { analyticsService } from "./domain/analytics.js";
import { basketService } from "./domain/basket.js";
import { classService } from "./domain/class.js";
import { coursewareService } from "./domain/courseware.js";
import { donationService } from "./domain/donation.js";
import { examPaperService } from "./domain/examPaper.js";
import { examPublishService } from "./domain/examPublish.js";
import { extractService } from "./domain/extract.js";
import { knowledgeService } from "./domain/knowledge.js";
import { lectureService } from "./domain/lecture.js";
import { lessonCoursewareService } from "./domain/lessonCourseware.js";
import { materialService } from "./domain/material.js";
import { onlineResourceService } from "./domain/onlineResource.js";
import { organizationService } from "./domain/organization.js";
import { prepService } from "./domain/prep.js";
import { questionService } from "./domain/question.js";
import { reflectionService } from "./domain/reflection.js";
import { schoolService } from "./domain/school.js";
import { schoolBackupService } from "./domain/schoolBackup.js";
import { settingsService } from "./domain/settings.js";
import { shareService } from "./domain/share.js";
import { studentInteractionService } from "./domain/studentInteraction.js";

export const serviceRegistry = {
  ai: aiService,
  analytics: analyticsService,
  basket: basketService,
  class: classService,
  courseware: coursewareService,
  donation: donationService,
  examPaper: examPaperService,
  examPublish: examPublishService,
  extract: extractService,
  knowledge: knowledgeService,
  lecture: lectureService,
  lessonCourseware: lessonCoursewareService,
  material: materialService,
  onlineResource: onlineResourceService,
  organization: organizationService,
  prep: prepService,
  question: questionService,
  reflection: reflectionService,
  school: schoolService,
  schoolBackup: schoolBackupService,
  settings: settingsService,
  share: shareService,
  studentInteraction: studentInteractionService,
} as const;

export type ServiceName = keyof typeof serviceRegistry;

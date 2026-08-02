import { useCallback, useEffect, useMemo, useState } from "react";
import { settingsService } from "@/services/settings";
import type { ExamPaperType, LectureType } from "@/types";
import { buildResourceTypeOptions, resourceTypeLabel } from "@/lib/resource-type-hierarchy";

export interface DocumentTypeOption {
  value: string;
  label: string;
}

export function includeCurrentDocumentType(
  options: DocumentTypeOption[],
  currentValue?: string,
): DocumentTypeOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options;
  return [{ value: currentValue, label: currentValue }, ...options];
}

export function useDocumentTypeOptions(schoolId?: string | null) {
  const [examPaperTypes, setExamPaperTypes] = useState<ExamPaperType[]>([]);
  const [lectureTypes, setLectureTypes] = useState<LectureType[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!schoolId) {
      setExamPaperTypes([]);
      setLectureTypes([]);
      setReady(true);
      return () => { cancelled = true; };
    }

    setExamPaperTypes([]);
    setLectureTypes([]);

    Promise.all([
      settingsService.listExamPaperTypes(schoolId),
      settingsService.listLectureTypes(schoolId),
    ]).then(([papers, lectures]) => {
      if (cancelled) return;
      setExamPaperTypes(papers);
      setLectureTypes(lectures);
      setReady(true);
    }).catch(() => {
      if (cancelled) return;
      setExamPaperTypes([]);
      setLectureTypes([]);
      setReady(true);
    });

    return () => { cancelled = true; };
  }, [schoolId]);

  const examPaperTypeOptions = useMemo(
    () => buildResourceTypeOptions(examPaperTypes, { enabledOnly: true }),
    [examPaperTypes],
  );
  const lectureTypeOptions = useMemo(
    () => buildResourceTypeOptions(lectureTypes, { enabledOnly: true }),
    [lectureTypes],
  );
  const getExamPaperTypeLabel = useCallback(
    (value?: string) => value ? resourceTypeLabel(value, examPaperTypes) : "未指定",
    [examPaperTypes],
  );
  const getLectureTypeLabel = useCallback(
    (value?: string) => value ? resourceTypeLabel(value, lectureTypes) : "未指定",
    [lectureTypes],
  );

  return useMemo(() => ({
    examPaperTypes,
    lectureTypes,
    examPaperTypeOptions,
    lectureTypeOptions,
    defaultExamPaperTypeId: ready ? examPaperTypeOptions[0]?.value || "" : "",
    defaultLectureTypeId: ready ? lectureTypeOptions[0]?.value || "" : "",
    getExamPaperTypeLabel,
    getLectureTypeLabel,
    ready,
  }), [
    examPaperTypes,
    lectureTypes,
    examPaperTypeOptions,
    lectureTypeOptions,
    getExamPaperTypeLabel,
    getLectureTypeLabel,
    ready,
  ]);
}

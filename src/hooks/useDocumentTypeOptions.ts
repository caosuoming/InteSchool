import { useCallback, useEffect, useMemo, useState } from "react";
import { settingsService } from "@/services/settings";
import type { ExamPaperType, LectureType } from "@/types";

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
      setExamPaperTypes(papers.filter((item) => item.enabled));
      setLectureTypes(lectures.filter((item) => item.enabled));
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
    () => examPaperTypes.map((item) => ({ value: item.id, label: item.name })),
    [examPaperTypes],
  );
  const lectureTypeOptions = useMemo(
    () => lectureTypes.map((item) => ({ value: item.id, label: item.name })),
    [lectureTypes],
  );
  const examPaperLabels = useMemo(
    () => new Map(examPaperTypes.map((item) => [item.id, item.name])),
    [examPaperTypes],
  );
  const lectureLabels = useMemo(
    () => new Map(lectureTypes.map((item) => [item.id, item.name])),
    [lectureTypes],
  );
  const getExamPaperTypeLabel = useCallback(
    (value?: string) => value ? examPaperLabels.get(value) || value : "未指定",
    [examPaperLabels],
  );
  const getLectureTypeLabel = useCallback(
    (value?: string) => value ? lectureLabels.get(value) || value : "未指定",
    [lectureLabels],
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

import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AnyClass } from "@/types";
import { documentLessonAudienceIds, type DocumentLessonAudience } from "@/lib/document-lesson-audience";

/** Show only actions for the document's selected class audience. */
export function DocumentCoursewareActions({
  classIds,
  classes,
  onAdd,
  loading = false,
}: {
  classIds: readonly string[];
  classes: readonly AnyClass[];
  onAdd: (audience: DocumentLessonAudience, classIds: string[]) => void;
  loading?: boolean;
}) {
  const targets = documentLessonAudienceIds(classIds, classes);
  return (
    <>
      {(["school", "personal"] as const).map((audience) => targets[audience].length > 0 && (
        <Button
          key={audience}
          variant="outline"
          onClick={() => onAdd(audience, targets[audience])}
          loading={loading}
          disabled={loading}
        >
          <Presentation className="w-4 h-4" />
          {audience === "school" ? "添加到学校上课" : "添加到个人上课"}
        </Button>
      ))}
    </>
  );
}

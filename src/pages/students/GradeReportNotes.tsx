/** Shared table footer for printed, on-screen, and published score reports. */
export function GradeReportNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div className="grade-report-notes border-t border-ink-100 px-5 py-3 text-xs leading-relaxed text-ink-600 print:break-inside-avoid" aria-label="成绩统计备注">
      {notes.map((note, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">{note}</p>
      ))}
    </div>
  );
}

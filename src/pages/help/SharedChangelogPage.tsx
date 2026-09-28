import { useEffect, useState } from "react";
import { FileClock } from "lucide-react";
import { useParams } from "react-router";
import { Card, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/service-utils";
import { helpService } from "@/services/help";
import type { HelpChangelogEntry } from "@/types";

export default function SharedChangelogPage() {
  const { token = "" } = useParams();
  const [entries, setEntries] = useState<HelpChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void helpService.getSharedChangelog(token)
      .then((result) => {
        if (active) setEntries(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "分享链接无法打开");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-mist px-4 py-10 sm:px-6">
      <main className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-900 text-white">
            <FileClock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink-950">智题云校更新日志</h1>
            <p className="mt-1 text-sm text-ink-500">平台功能、体验优化与问题修复记录</p>
          </div>
        </div>

        {loading ? (
          <Card className="flex min-h-56 items-center justify-center"><Spinner /></Card>
        ) : error ? (
          <Card className="py-16 text-center">
            <div className="font-medium text-ink-700">分享链接无法打开</div>
            <div className="mt-2 text-sm text-ink-400">{error}</div>
          </Card>
        ) : entries.length === 0 ? (
          <Card className="py-16 text-center">
            <FileClock className="mx-auto h-9 w-9 text-ink-300" />
            <div className="mt-3 font-medium text-ink-700">暂无更新日志</div>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <Card key={entry.id} className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
                    <FileClock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="text-base font-semibold text-ink-900">{entry.title}</h2>
                      <span className="text-xs text-ink-400">{formatDate(entry.updatedAt, true)}</span>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink-600">
                      {entry.content}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

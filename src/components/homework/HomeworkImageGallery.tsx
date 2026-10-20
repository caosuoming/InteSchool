import type { HomeworkOverviewImage } from "@/types";
import { HOMEWORK_IMAGE_CATEGORIES, imageCategory } from "./homeworkImageCategories";

export function HomeworkImageGallery({ images }: { images: HomeworkOverviewImage[] }) {
  if (!images.length) return null;
  return <div className="mt-3 space-y-3">
    {HOMEWORK_IMAGE_CATEGORIES.map((category) => {
      const group = images.filter((image) => imageCategory(image) === category.id);
      if (!group.length) return null;
      return <div key={category.id}>
        <h4 className="mb-2 text-xs font-medium text-ink-700">{category.label}（{group.length}）</h4>
        <div className="flex flex-wrap gap-3">
          {group.map((image) => <div key={image.id} className="w-28">
            <a href={image.url} target="_blank" rel="noreferrer" title="点击查看大图">
              <img src={image.url} alt={image.name} className="h-20 w-28 rounded border border-ink-100 object-cover" />
            </a>
            {image.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink-600">{image.note}</p>}
          </div>)}
        </div>
      </div>;
    })}
  </div>;
}

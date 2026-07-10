"use client";

import { memo } from "react";
import { Check } from "lucide-react";
import { MediaPreview } from "@/components/app/works/[id]/assign-tables";

export interface UnassignedGenerationPreview {
  id: string;
  external_id: string;
  display_name: string;
  result_url: string;
  media_type: string;
}

export interface UnassignedGenerationDayGroup {
  label: string;
  items: UnassignedGenerationPreview[];
}

type Props = {
  groups: UnassignedGenerationDayGroup[];
  selectedIds: ReadonlySet<string>;
  onToggleDay: (items: Array<{ id: string }>) => void;
  onToggle: (generationId: string) => void;
  sectionClassName?: string;
  gridClassName?: string;
  tileClassName?: string;
  checkboxClassName?: string;
};

function hfAssetUrl(externalId: string) {
  return `https://higgsfield.ai/asset/all/${externalId}`;
}

const GenerationTile = memo(
  function GenerationTile({
    generation,
    checked,
    onToggle,
    tileClassName,
    checkboxClassName,
  }: {
    generation: UnassignedGenerationPreview;
    checked: boolean;
    onToggle: (generationId: string) => void;
    tileClassName: string;
    checkboxClassName: string;
  }) {
    return (
      <a
        href={hfAssetUrl(generation.external_id)}
        target="_blank"
        rel="noreferrer"
        title="Open in Higgsfield"
        style={{ contain: "layout paint style" }}
        className={`${tileClassName} ${
          checked
            ? "border-lime-400 shadow-[0_0_0_1px_rgba(163,230,53,0.45)]"
            : "border-neutral-800 hover:border-neutral-600"
        }`}
      >
        <button
          type="button"
          aria-pressed={checked}
          aria-label={
            checked
              ? `Deselect ${generation.display_name}`
              : `Select ${generation.display_name}`
          }
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle(generation.id);
          }}
          className={`${checkboxClassName} ${
            checked ? "border-lime-400 bg-lime-400 text-black" : ""
          }`}
        >
          <Check className="size-3.5" />
        </button>
        <MediaPreview
          url={generation.result_url}
          mediaType={generation.media_type}
          name={generation.display_name}
          className="h-full w-full object-cover"
        />
      </a>
    );
  },
  (prev, next) =>
    prev.generation === next.generation &&
    prev.checked === next.checked &&
    prev.onToggle === next.onToggle &&
    prev.tileClassName === next.tileClassName &&
    prev.checkboxClassName === next.checkboxClassName,
);

export const UnassignedGenerationsGrid = memo(function UnassignedGenerationsGrid({
  groups,
  selectedIds,
  onToggleDay,
  onToggle,
  sectionClassName = "px-4 py-3",
  gridClassName = "grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-10",
  tileClassName = "",
  checkboxClassName = "",
}: Props) {
  const resolvedTileClassName =
    tileClassName ||
    "group relative block aspect-square overflow-hidden rounded-xl border bg-neutral-950 transition xl:rounded-2xl";
  const resolvedCheckboxClassName =
    checkboxClassName ||
    "absolute left-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg border-2 border-white/25 bg-black/35 text-transparent backdrop-blur-sm transition hover:border-white/45";

  return (
    <div className="divide-y divide-neutral-800">
      {groups.map((group) => {
        const daySelected =
          group.items.length > 0 &&
          group.items.every((generation) => selectedIds.has(generation.id));

        return (
          <section key={group.label} className={sectionClassName}>
            <button
              type="button"
              onClick={() => onToggleDay(group.items)}
              className="mb-4 flex items-center gap-2 text-sm font-semibold text-white transition hover:text-lime-300"
            >
              <span
                className={`flex size-5 items-center justify-center rounded border-2 transition ${
                  daySelected
                    ? "border-lime-400 bg-lime-400 text-black"
                    : "border-neutral-600 bg-transparent text-transparent"
                }`}
              >
                <Check className="size-3" />
              </span>
              <span>{group.label}</span>
            </button>

            <div className={gridClassName}>
              {group.items.map((generation) => {
                const checked = selectedIds.has(generation.id);

                return (
                  <GenerationTile
                    key={generation.id}
                    generation={generation}
                    checked={checked}
                    onToggle={onToggle}
                    tileClassName={resolvedTileClassName}
                    checkboxClassName={resolvedCheckboxClassName}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
});

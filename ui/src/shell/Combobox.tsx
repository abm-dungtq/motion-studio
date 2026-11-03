// A select that can be searched and read by a screen reader, in place of the native select element: a
// button (role="combobox") opens a popover with a search field (when there are more than 8 options)
// and a listbox. Arrows, Home and End move the active option, Enter or a click chooses it, Escape
// closes and gives focus back to the button. Moving through the list never calls onChange.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface Option { value: string; label: string; group?: string; hint?: string; disabled?: boolean }

interface Props {
  value: string | null;
  options: Option[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

// Lower case without Vietnamese marks, so "mau" finds "Mực màu"; the first letters of the words
// count too, so "dd" finds "Đường đua".
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
const initials = (s: string) => s.split(/[^\p{L}\p{N}]+/u).map((w) => w[0] ?? "").join("");

export function filterOptions(options: Option[], q: string): Option[] {
  const k = fold(q.trim());
  if (!k) return options;
  return options.filter((o) => {
    const label = fold(o.label);
    return fold(`${o.label} ${o.hint ?? ""} ${o.value}`).includes(k) || initials(label).startsWith(k);
  });
}

// Groups in the order they first appear; options without a group come first, unlabelled.
function grouped(options: Option[]): [string | undefined, Option[]][] {
  const out = new Map<string | undefined, Option[]>();
  for (const o of options) {
    const list = out.get(o.group) ?? [];
    list.push(o);
    out.set(o.group, list);
  }
  return [...out.entries()].sort(([a], [b]) => Number(a !== undefined) - Number(b !== undefined));
}

export const COMBO = "inline-flex h-8 min-w-0 items-center justify-between gap-1.5 rounded-md border border-border bg-background px-2 text-left text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

export function Combobox({ value, options, onChange, label, placeholder = "Chọn…", searchable, disabled, className, id }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);
  const base = useId();
  const listId = `${base}-list`;
  const optId = (i: number) => `${base}-o${i}`;
  const list = useRef<HTMLUListElement>(null);
  const canSearch = searchable ?? options.length > 8;
  const shown = useMemo(() => filterOptions(options, q), [options, q]);
  // The order the arrows walk: the groups as drawn, each option once.
  const flat = useMemo(() => grouped(shown).flatMap(([, xs]) => xs), [shown]);
  const current = options.find((o) => o.value === value);

  const scrollTo = (i: number) => list.current?.querySelector(`#${CSS.escape(optId(i))}`)?.scrollIntoView({ block: "nearest" });
  const move = (i: number) => {
    if (!flat.length) return;
    const n = Math.max(0, Math.min(flat.length - 1, i));
    setActive(n);
    scrollTo(n);
  };
  const choose = (o: Option | undefined) => {
    if (!o || o.disabled) return;
    setOpen(false);
    if (o.value !== value) onChange(o.value);
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) return;
    setQ("");
    // Opening again shows the chosen option.
    const i = grouped(options).flatMap(([, xs]) => xs).findIndex((x) => x.value === value);
    setActive(i);
    requestAnimationFrame(() => { if (i >= 0) scrollTo(i); });
  };

  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, () => void> = {
      ArrowDown: () => move(active + 1),
      ArrowUp: () => move(active < 0 ? flat.length - 1 : active - 1),
      Home: () => move(0),
      End: () => move(flat.length - 1),
      Enter: () => choose(flat[active]),
    };
    // Home and End stay in the search field once something is typed there.
    if (canSearch && q && (e.key === "Home" || e.key === "End")) return;
    const run = step[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  };

  const activeId = active >= 0 && active < flat.length ? optId(active) : undefined;
  let index = -1;
  const item = (o: Option) => {
    const i = ++index;
    const selected = o.value === value;
    return (
      <li
        key={o.value}
        id={optId(i)}
        role="option"
        aria-selected={selected}
        aria-disabled={o.disabled || undefined}
        className={cn(
          "flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm",
          i === active && "bg-accent",
          o.disabled && "opacity-50",
        )}
        onPointerMove={() => { if (i !== active) setActive(i); }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(o)}
      >
        <CheckIcon aria-hidden className={cn("size-3.5 shrink-0", !selected && "invisible")} />
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {o.hint ? <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span> : null}
      </li>
    );
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          title={current?.label}
          className={cn(COMBO, className)}
        >
          <span className={cn("min-w-0 flex-1 truncate", !current && "text-muted-foreground")}>{current?.label ?? placeholder}</span>
          <ChevronDownIcon aria-hidden className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={label}
        collisionPadding={8}
        className="flex max-h-[min(360px,var(--radix-popover-content-available-height))] w-max max-w-[min(420px,92vw)] min-w-(--radix-popover-trigger-width) flex-col gap-1"
        onKeyDown={onKey}
        onOpenAutoFocus={(e) => {
          if (canSearch) return;
          e.preventDefault();
          list.current?.focus();
        }}
      >
        {canSearch ? (
          <input
            type="search"
            className="h-8 w-full shrink-0 rounded-md border border-border bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            placeholder="Tìm…"
            aria-label={`Tìm trong ${label}`}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(e.target.value ? 0 : -1); }}
          />
        ) : null}
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={canSearch ? undefined : -1}
          aria-activedescendant={canSearch ? undefined : activeId}
          className="m-0 min-h-0 list-none overflow-y-auto p-0 outline-none"
        >
          {grouped(shown).map(([g, xs]) => g === undefined ? xs.map(item) : (
            <li key={`g:${g}`} role="presentation">
              <ul role="group" aria-label={g} className="m-0 list-none p-0">
                <li role="presentation" className="px-2 pt-1.5 pb-0.5 text-xs font-semibold text-muted-foreground">{g}</li>
                {xs.map(item)}
              </ul>
            </li>
          ))}
          {shown.length ? null : <li role="presentation" className="px-2 py-1 text-sm text-muted-foreground">Không có lựa chọn nào khớp.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

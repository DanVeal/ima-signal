"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Hand-rolled command palette (no cmdk dependency — see docs/production-experience.md).
 * Items self-register on mount so <CommandGroup>/<CommandItem> can be composed
 * declaratively; the root tracks which values currently match the search text
 * and which one is active for keyboard navigation.
 */
interface CommandItemEntry {
  value: string
  label: string
  keywords?: string[]
  onSelect?: () => void
  disabled?: boolean
}

interface CommandContextValue {
  search: string
  setSearch: (value: string) => void
  activeValue: string | null
  setActiveValue: (value: string | null) => void
  register: (entry: CommandItemEntry) => () => void
  visibleValues: string[]
  select: (value: string) => void
  listId: string
  /** Whether a given item should render, computed directly from its own props (never from the registration map — an item must be able to decide its own visibility before it has ever registered, or it could never mount to register in the first place). */
  matches: (label: string, keywords?: string[]) => boolean
}

const CommandContext = React.createContext<CommandContextValue | null>(null)

function useCommandContext(component: string) {
  const ctx = React.useContext(CommandContext)
  if (!ctx) {
    throw new Error(`${component} must be used within <Command>`)
  }
  return ctx
}

function defaultFilter(label: string, search: string, keywords?: string[]) {
  if (!search.trim()) return true
  const haystack = [label, ...(keywords ?? [])].join(" ").toLowerCase()
  return haystack.includes(search.trim().toLowerCase())
}

function Command({
  className,
  children,
  filter = defaultFilter,
  shouldFilter = true,
  value: controlledSearch,
  onValueChange,
  ...props
}: React.ComponentProps<"div"> & {
  filter?: (label: string, search: string, keywords?: string[]) => boolean
  /** Set to false when the caller filters items itself (e.g. results already came back pre-filtered from a server search) — every registered item is then always visible. */
  shouldFilter?: boolean
  /** Controlled search text — omit to let Command manage it internally. */
  value?: string
  onValueChange?: (value: string) => void
}) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()
  const [items, setItems] = React.useState<Map<string, CommandItemEntry>>(
    () => new Map()
  )
  const [internalSearch, setInternalSearch] = React.useState("")
  const search = controlledSearch ?? internalSearch
  const setSearch = onValueChange ?? setInternalSearch
  const [rawActiveValue, setActiveValue] = React.useState<string | null>(null)

  const register = React.useCallback((entry: CommandItemEntry) => {
    setItems((prev) => {
      const next = new Map(prev)
      next.set(entry.value, entry)
      return next
    })
    return () => {
      setItems((prev) => {
        const next = new Map(prev)
        next.delete(entry.value)
        return next
      })
    }
  }, [])

  const visibleValues = React.useMemo(() => {
    return Array.from(items.values())
      .filter((entry) => !entry.disabled && (!shouldFilter || filter(entry.label, search, entry.keywords)))
      .map((entry) => entry.value)
  }, [items, search, filter, shouldFilter])

  // The active item self-corrects at render time (rather than via an effect
  // that calls setState) whenever the previously active value is filtered out.
  const activeValue =
    rawActiveValue && visibleValues.includes(rawActiveValue)
      ? rawActiveValue
      : visibleValues[0] ?? null

  React.useEffect(() => {
    if (!activeValue) return
    const el = rootRef.current?.querySelector<HTMLElement>(
      `[data-slot="command-item"][data-value="${CSS.escape(activeValue)}"]`
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [activeValue])

  const select = React.useCallback(
    (value: string) => {
      items.get(value)?.onSelect?.()
    },
    [items]
  )

  const matches = React.useCallback(
    (label: string, keywords?: string[]) => !shouldFilter || filter(label, search, keywords),
    [shouldFilter, filter, search]
  )

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (visibleValues.length === 0) return
      const currentIndex = activeValue ? visibleValues.indexOf(activeValue) : -1
      const delta = event.key === "ArrowDown" ? 1 : -1
      const nextIndex =
        (currentIndex + delta + visibleValues.length) % visibleValues.length
      setActiveValue(visibleValues[nextIndex])
    } else if (event.key === "Enter") {
      if (activeValue) {
        event.preventDefault()
        select(activeValue)
      }
    }
  }

  const contextValue = React.useMemo<CommandContextValue>(
    () => ({ search, setSearch, activeValue, setActiveValue, register, visibleValues, select, listId, matches }),
    [search, setSearch, activeValue, register, visibleValues, select, listId, matches]
  )

  return (
    <CommandContext.Provider value={contextValue}>
      <div
        ref={rootRef}
        data-slot="command"
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </CommandContext.Provider>
  )
}

function CommandDialog({
  open,
  onOpenChange,
  children,
  className,
  label = "Command palette",
  description = "Search projects, recordings, and more, or run a command.",
  value,
  onValueChange,
  shouldFilter,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
  label?: string
  description?: string
  value?: string
  onValueChange?: (value: string) => void
  shouldFilter?: boolean
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="command-dialog-overlay"
          className="fixed inset-0 isolate z-50 bg-black/20 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          data-slot="command-dialog-content"
          className="fixed top-[16%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          <Command className={className} value={value} onValueChange={onValueChange} shouldFilter={shouldFilter}>
            {children}
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<"input">) {
  const { search, setSearch, listId, activeValue } = useCommandContext("CommandInput")
  return (
    <div className="flex items-center gap-2 border-b border-border px-3">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <input
        data-slot="command-input"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeValue ?? undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={cn(
          "flex h-11 w-full min-w-0 rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({ className, ...props }: React.ComponentProps<"div">) {
  const { listId } = useCommandContext("CommandList")
  return (
    <div
      id={listId}
      data-slot="command-list"
      role="listbox"
      className={cn(
        "max-h-80 scroll-py-1 overflow-x-hidden overflow-y-auto p-1",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: React.ComponentProps<"div">) {
  const { visibleValues } = useCommandContext("CommandEmpty")
  if (visibleValues.length > 0) return null
  return (
    <div
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CommandGroup({
  heading,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { heading?: React.ReactNode }) {
  const { matches } = useCommandContext("CommandGroup")
  const hasVisibleChild = React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) return false
    const childProps = child.props as { value?: string; keywords?: string[]; children?: React.ReactNode }
    if (!childProps.value) return true
    const label = typeof childProps.children === "string" ? childProps.children : childProps.value
    return matches(label, childProps.keywords)
  })
  if (!hasVisibleChild) return null
  return (
    <div
      data-slot="command-group"
      role="presentation"
      className={cn("overflow-hidden p-1", className)}
      {...props}
    >
      {heading ? (
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {heading}
        </div>
      ) : null}
      <div role="group">{children}</div>
    </div>
  )
}

function CommandSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-separator"
      role="separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function CommandItem({
  value,
  keywords,
  disabled,
  onSelect,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  value: string
  keywords?: string[]
  disabled?: boolean
  onSelect?: () => void
}) {
  const { register, activeValue, setActiveValue, select, matches } =
    useCommandContext("CommandItem")
  const label = typeof children === "string" ? children : value

  // useLayoutEffect (not useEffect): registration must land before paint, or
  // CommandEmpty briefly flashes "no results" for items that are about to
  // render (see the note on CommandContextValue.matches above).
  React.useLayoutEffect(() => {
    return register({ value, label, keywords, onSelect, disabled })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, value, label, disabled, onSelect, ...(keywords ?? [])])

  if (!matches(label, keywords)) return null

  const isActive = activeValue === value

  return (
    <div
      id={value}
      data-slot="command-item"
      data-value={value}
      role="option"
      aria-selected={isActive}
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      onMouseEnter={() => !disabled && setActiveValue(value)}
      onClick={() => !disabled && select(value)}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none",
        isActive && "bg-accent text-accent-foreground",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
  CommandItem,
  CommandShortcut,
}

"use client";

import { useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { deleteTask, setTaskStatus } from "@/app/actions";
import { cn } from "@/lib/utils";

export function TaskCheck({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => setTaskStatus(id, !done))}
      disabled={pending}
      aria-label={done ? "Mark as open" : "Mark as done"}
      className={cn(
        "grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] transition",
        done ? "border-green bg-green text-white" : "border-hairline-strong hover:border-blue",
        pending && "opacity-50",
      )}
    >
      {done && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

export function TaskDelete({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => deleteTask(id))}
      disabled={pending}
      aria-label="Delete task"
      className="grid size-7 place-items-center rounded-[8px] text-ink-4 opacity-0 transition group-hover:opacity-100 hover:bg-sunken hover:text-red-ink focus:opacity-100"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

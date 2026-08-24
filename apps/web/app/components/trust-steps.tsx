import { BRAND } from "@tokenbroke/shared";

/** The whole ask, made legible: what runs, what it reads, what it never touches. */
export function TrustSteps() {
  return (
    <ol className="flex flex-col gap-2.5">
      {[
        {
          key: "reads",
          title: "it reads two numbers",
          body: "your usage % and reset time, from files already on your machine. never your code, never your prompts, never your conversations.",
        },
        {
          key: "files",
          title: "it files you anonymously",
          body: "~5 seconds. no signup, no account, no email. you get a name like starving-crab-42 and a rank you didn't want.",
        },
        {
          key: "updates",
          title: "it stays fresh if you let it",
          body: `re-run it any time to update your row — or "${BRAND.cliCommand} hooks install" once, and it quietly refiles after your sessions. removable in one command.`,
        },
      ].map((step, index) => (
        <li key={step.key} className="flex gap-3">
          <span className="keycap grid size-6 shrink-0 place-items-center text-[11px] font-bold text-paper">
            {index + 1}
          </span>
          <p className="text-[13px] leading-relaxed text-dim">
            <span className="font-semibold text-paper">{step.title}</span>
            <span className="text-muted"> — {step.body}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

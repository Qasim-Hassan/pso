"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/sections/common";
import type { Question } from "@/lib/content-data";
import { cn } from "@/lib/utils";

type PracticeMode = "Subject MCQs" | "Common MCQs" | "Descriptive";

const modes: { label: PracticeMode; section: string; icon: string; hint: string }[] = [
  { label: "Subject MCQs", section: "Part II", icon: "list-checks", hint: "NSTC Part II only" },
  { label: "Common MCQs", section: "Part I", icon: "star", hint: "NSTC Part I" },
  { label: "Descriptive", section: "Part III", icon: "book-open", hint: "Long-form paper questions" },
];

const subjectOrder = ["Mathematics", "Physics", "Biology", "Chemistry"];

function sortSubjects(items: string[]) {
  return [...items].sort((a, b) => {
    const aIndex = subjectOrder.indexOf(a);
    const bIndex = subjectOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
}

function hashQuestion(id: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function subjectIcon(subject: string) {
  if (subject === "Mathematics") return "pi";
  if (subject === "Chemistry") return "flask";
  if (subject === "Biology") return "dna";
  return "atom";
}

function optionTone(question: Question, index: number, selectedAnswer: number | null) {
  if (selectedAnswer !== index) return "border-navy/10 bg-white text-charcoal hover:border-emerald/35";
  if (question.answer === null) return "border-emerald bg-mint text-emerald";
  return question.answer === index ? "border-emerald bg-mint text-emerald" : "border-red-300 bg-red-50 text-red-700";
}

export function QuestionBankClient({ questions }: { questions: Question[] }) {
  const subjects = useMemo(() => sortSubjects(Array.from(new Set(questions.map((question) => question.subject)))), [questions]);
  const [subject, setSubject] = useState("All");
  const [mode, setMode] = useState<PracticeMode>("Subject MCQs");
  const [shuffleSalt, setShuffleSalt] = useState(17);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  const activeMode = modes.find((item) => item.label === mode) ?? modes[0];
  const subjectCards = useMemo(() => {
    return subjects.map((item) => {
      const subjectQuestions = questions.filter((question) => question.subject === item);
      return {
        subject: item,
        subjectMcqs: subjectQuestions.filter((question) => question.section === "Part II").length,
        commonMcqs: subjectQuestions.filter((question) => question.section === "Part I").length,
        descriptive: subjectQuestions.filter((question) => question.section === "Part III").length,
      };
    });
  }, [questions, subjects]);

  const filtered = useMemo(() => {
    return questions
      .filter((question) => {
        const matchesMode = question.section === activeMode.section;
        const matchesSubject = mode === "Common MCQs" || subject === "All" || question.subject === subject;
        return matchesMode && matchesSubject;
      })
      .sort((a, b) => hashQuestion(a.id, shuffleSalt) - hashQuestion(b.id, shuffleSalt));
  }, [activeMode.section, mode, questions, shuffleSalt, subject]);

  const active = filtered[activeIndex] ?? null;
  const canGoBack = activeIndex > 0;
  const canGoNext = activeIndex < filtered.length - 1;

  function moveTo(index: number) {
    setActiveIndex(Math.max(0, Math.min(filtered.length - 1, index)));
    setSelectedAnswer(null);
    setShowSolution(false);
  }

  function resetQuestionState() {
    setActiveIndex(0);
    setSelectedAnswer(null);
    setShowSolution(false);
  }

  function chooseMode(value: PracticeMode) {
    setMode(value);
    if (value === "Common MCQs") setSubject("All");
    resetQuestionState();
  }

  function chooseSubject(value: string) {
    setSubject(value);
    resetQuestionState();
  }

  function shuffleQuestions() {
    setShuffleSalt((value) => value + 1);
    resetQuestionState();
  }

  function resetPractice() {
    setSubject("All");
    setMode("Subject MCQs");
    shuffleQuestions();
  }

  return (
    <div className="grid gap-4 sm:gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
        <div className="card-surface rounded-md p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase text-charcoal">Practice Mode</h2>
              <p className="mt-1 text-xs font-semibold text-charcoal/60">NSTC past-paper questions only</p>
            </div>
            <button className="rounded-md border border-navy/10 bg-white px-3 py-2 text-xs font-black text-charcoal hover:border-emerald/40" type="button" onClick={resetPractice}>
              Reset
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {modes.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => chooseMode(item.label)}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-3 text-left transition",
                  mode === item.label ? "border-emerald bg-emerald text-white" : "border-navy/10 bg-white text-charcoal hover:border-emerald/35",
                )}
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", mode === item.label ? "bg-white/15 text-white" : "bg-mint text-emerald")}>
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-black">{item.label}</span>
                  <span className={cn("block text-xs font-semibold", mode === item.label ? "text-white/75" : "text-charcoal/55")}>{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="card-surface rounded-md p-4">
          <h2 className="text-sm font-black uppercase text-charcoal">Subjects</h2>
          <div className="mt-4 grid gap-2">
            {mode !== "Common MCQs" && (
              <>
                <button
                  type="button"
                  onClick={() => chooseSubject("All")}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-3 py-2 text-sm font-black transition",
                    subject === "All" ? "border-emerald bg-mint text-emerald" : "border-navy/10 bg-white text-charcoal hover:border-emerald/35",
                  )}
                >
                  All subjects
                  <span>{questions.filter((question) => question.section === activeMode.section).length}</span>
                </button>
                {subjectCards.map((card) => {
                  const visibleCount = mode === "Subject MCQs" ? card.subjectMcqs : card.descriptive;
                  return (
                    <button
                      key={card.subject}
                      type="button"
                      onClick={() => chooseSubject(card.subject)}
                      className={cn(
                        "flex items-center justify-between rounded-md border px-3 py-2 text-sm transition",
                        subject === card.subject ? "border-emerald bg-mint text-emerald" : "border-navy/10 bg-white text-charcoal hover:border-emerald/35",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 font-black">
                        <Icon name={subjectIcon(card.subject)} className="h-4 w-4 shrink-0" />
                        <span className="truncate">{card.subject}</span>
                      </span>
                      <span className="font-black">{visibleCount}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-charcoal/60">Subject MCQs exclude Part I common MCQs. Use Common MCQs when you want the shared screening section.</p>
        </div>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="card-surface rounded-md p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-emerald/20 bg-white">{mode}</Badge>
                <Badge className="border-gold/30 bg-gold/15 text-charcoal">{mode === "Common MCQs" || subject === "All" ? "All subjects" : subject}</Badge>
                <span className="text-sm font-bold text-charcoal/60">{filtered.length.toLocaleString()} questions in this drill</span>
              </div>
              <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-charcoal sm:text-4xl">
                {mode === "Common MCQs" || subject === "All" ? mode : `${subject} ${mode}`}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-navy/10 bg-white px-3 py-2 text-sm font-black text-charcoal disabled:cursor-not-allowed disabled:opacity-45 sm:px-4"
                disabled={!canGoBack}
                onClick={() => moveTo(activeIndex - 1)}
                type="button"
              >
                Previous
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-navy/10 bg-white px-3 py-2 text-sm font-black text-charcoal hover:border-emerald/40 sm:px-4"
                onClick={shuffleQuestions}
                type="button"
              >
                <Icon name="sparkles" className="h-4 w-4 text-gold" />
                Shuffle
              </button>
              <button
                className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-1 sm:px-4"
                disabled={!canGoNext}
                onClick={() => moveTo(activeIndex + 1)}
                type="button"
              >
                Next
                <Icon name="chevron" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {active ? (
          <article className="card-surface rounded-md p-4 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-4 border-b border-navy/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-normal text-emerald">
                  Question {activeIndex + 1} of {filtered.length}
                </p>
                <h3 className="mt-2 text-base font-black text-charcoal">{active.source}</h3>
                <p className="mt-1 text-sm font-semibold text-charcoal/60">
                  {active.sectionTitle} · Original number {active.displayNumber ?? active.number}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {[active.subject, active.topic, active.difficulty, active.type].filter(Boolean).map((tag, index) => (
                  <Badge key={`${tag}-${index}`} className="bg-white">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="py-7">
              <p className="whitespace-pre-wrap text-lg font-semibold leading-8 text-charcoal sm:text-2xl sm:leading-10">{active.prompt}</p>
              {active.figure && (
                <details className="mt-5 rounded-md border border-navy/10 bg-white p-4">
                  <summary className="cursor-pointer text-sm font-black text-emerald">Show diagram</summary>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={active.figure} alt={`Diagram for question ${active.displayNumber ?? active.number}`} className="mt-4 w-full rounded-md border border-navy/10" />
                </details>
              )}
            </div>

            {active.options.length > 0 ? (
              <div className="grid gap-3">
                {active.options.map((option, index) => (
                  <button
                    key={`${active.id}-${index}-${option}`}
                    onClick={() => setSelectedAnswer(index)}
                    type="button"
                    className={cn("flex min-h-14 items-center gap-3 rounded-md border px-3 py-3 text-left text-sm font-bold leading-6 transition sm:gap-4 sm:px-4 sm:text-base", optionTone(active, index, selectedAnswer))}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy/5 text-sm font-black">{String.fromCharCode(65 + index)}</span>
                    <span>{option}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-navy/10 bg-white p-4 text-sm font-semibold text-charcoal/70">Write your solution separately, then reveal the available notes for checking.</div>
            )}

            <div className="mt-6 flex flex-col gap-3 border-t border-navy/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold leading-6 text-charcoal/65">{active.page ? `Source page ${active.page}` : active.source}</p>
              <button
                onClick={() => setShowSolution((value) => !value)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald px-5 py-2.5 text-sm font-black text-white sm:w-auto"
                type="button"
              >
                <Icon name="eye" className="h-4 w-4" />
                {showSolution ? "Hide Answer" : "Reveal Answer"}
              </button>
            </div>

            {showSolution && (
              <div className="mt-5 rounded-md border border-emerald/20 bg-mint p-5">
                <h3 className="font-black text-emerald">Answer</h3>
                <p className="mt-2 text-sm leading-7 text-charcoal/80">
                  {active.solution ||
                    (active.answer !== null
                      ? `Correct option: ${String.fromCharCode(65 + active.answer)}.`
                      : "No answer key is attached to this item yet. Use the source paper for final checking.")}
                </p>
              </div>
            )}
          </article>
        ) : (
          <div className="card-surface rounded-md p-8 text-center">
            <Icon name="list-checks" className="mx-auto h-10 w-10 text-emerald" />
            <h2 className="mt-4 font-display text-3xl font-bold text-charcoal">No questions in this drill</h2>
            <p className="mt-2 text-sm font-semibold text-charcoal/65">Try another subject or practice mode.</p>
          </div>
        )}
      </section>
    </div>
  );
}
